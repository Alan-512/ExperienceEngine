import { analyzeExperience } from "../analyzer/experience-analyzer.js";
import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { applyFeedback } from "../feedback/feedback-manager.js";
import { createEmptyStats, updateStats } from "../feedback/stats-updater.js";
import { buildExperienceInput } from "../input/input-adapter.js";
import { resolveScope } from "../input/scope-resolver.js";
import { decideIntervention } from "../controller/intervention-controller.js";
import { renderInlineNotice } from "../controller/inline-notice.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";
import type {
  CandidateSourceSignal,
  DistillationJob,
  ExperienceCandidate,
  ExperienceCandidateDraft,
  ExperienceInput,
  ExperienceInputRecord,
  ExperienceNode,
  ToolEvent
} from "../types/domain.js";
import type {
  ExperiencePlugin,
  HostPromptContext,
  HostToolResult,
  OpenClawLogger
} from "../types/plugin.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { bootstrapDatabase, openDatabase, withTransaction } from "../store/sqlite/db.js";
import { DistillationQueueWorker } from "../distillation/queue-worker.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import { RuntimeCaptureWriter } from "../plugin/runtime-capture.js";
import { normalizeToolResult } from "../plugin/hooks/tool-result-persist.js";
import { extractToolResultsFromPayload } from "../plugin/runtime-helpers.js";

type SessionState = {
  context?: HostPromptContext;
  toolEvents: ToolEvent[];
  toolEventKeys: Set<string>;
  injectedNodeIds: string[];
};

const toEvidence = (input: ExperienceInput): string[] =>
  input.tool_events.map((event) =>
    [event.tool_name, event.status, event.error_signature ?? event.output_summary]
      .filter(Boolean)
      .join(": ")
  );

const toInputRecord = (input: ExperienceInput, sessionId?: string): ExperienceInputRecord => ({
  record_id: createId("input"),
  scope_id: input.scope_id,
  session_id: sessionId,
  task_type: input.task_type,
  task_summary: input.task_summary,
  outcome_signal: input.outcome_signal,
  context_summary: input.context_summary,
  evidence: toEvidence(input),
  injected_node_ids: input.injected_node_ids,
  created_at: nowIso()
});

const buildCandidateSourceSignal = (input: ExperienceInput): CandidateSourceSignal => {
  const signals = buildCandidateSignals(input);

  return {
    task_summary: input.task_summary,
    context_summary: input.context_summary,
    outcome_signal: input.outcome_signal,
    tool_events: input.tool_events,
    evidence: toEvidence(input),
    failure_signature: signals.failure_signature,
    retry_count: signals.retry_count,
    correction_signals: signals.correction_signals,
    tool_event_summary: signals.tool_event_summary
  };
};

const draftToCandidate = (
  draft: ExperienceCandidateDraft,
  input: ExperienceInput,
  originRecordId: string
): ExperienceCandidate => {
  const timestamp = nowIso();
  const candidateId = stableId(
    "candidate",
    [draft.scope_id, draft.task_type, draft.node_type, draft.compact_hint, originRecordId].join(":")
  );

  return {
    id: candidateId,
    ...draft,
    source_record_id: originRecordId,
    source_context_summary: input.context_summary,
    source_outcome_signal: input.outcome_signal,
    source_signal: buildCandidateSourceSignal(input),
    lifecycle_state: "pending",
    retry_count: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
};

const candidateToInitialJob = (
  candidate: ExperienceCandidate,
  extractorProfile: string
): DistillationJob => {
  const timestamp = nowIso();

  return {
    id: stableId("distill", candidate.id),
    candidate_id: candidate.id,
    status: "pending",
    extractor_profile: extractorProfile,
    retry_count: candidate.retry_count,
    created_at: timestamp,
    updated_at: timestamp
  };
};

const mergeContext = (existing: HostPromptContext | undefined, incoming: HostPromptContext): HostPromptContext => ({
  sessionId: incoming.sessionId ?? existing?.sessionId,
  cwd: incoming.cwd ?? existing?.cwd,
  userMessage: incoming.userMessage || existing?.userMessage || "",
  taskSummary: incoming.taskSummary ?? existing?.taskSummary,
  contextSummary: incoming.contextSummary ?? existing?.contextSummary,
  injectedNodeIds: incoming.injectedNodeIds ?? existing?.injectedNodeIds
});

const buildToolEventKey = (toolEvent: ToolEvent, toolCallId?: string): string =>
  toolCallId ??
  [
    toolEvent.tool_name,
    toolEvent.status,
    toolEvent.exit_code ?? "",
    toolEvent.error_signature ?? "",
    toolEvent.output_summary ?? "",
    toolEvent.ended_at ?? ""
  ].join(":");

export class ExperienceRuntimeService implements ExperiencePlugin {
  private readonly db;
  private readonly logger: OpenClawLogger;
  private readonly sessions = new Map<string, SessionState>();
  private readonly orphanToolEvents = new Map<string, ToolEvent>();
  private readonly scopeRepo;
  private readonly inputRepo;
  private readonly nodeRepo;
  private readonly candidateRepo;
  private readonly jobRepo;
  private readonly statsRepo;
  private readonly distillationWorker;
  readonly captureWriter;

  constructor(
    readonly config: ExperienceEngineConfig,
    logger?: OpenClawLogger
  ) {
    this.logger = logger ?? {};
    this.db = openDatabase(config);
    bootstrapDatabase(this.db);
    this.scopeRepo = new ScopeRepository(this.db);
    this.inputRepo = new InputRecordRepository(this.db);
    this.nodeRepo = new NodeRepository(this.db);
    this.candidateRepo = new CandidateRepository(this.db);
    this.jobRepo = new DistillationJobRepository(this.db);
    this.statsRepo = new StatsRepository(this.db);
    this.distillationWorker = new DistillationQueueWorker(
      config,
      this.candidateRepo,
      this.jobRepo,
      this.nodeRepo
    );
    this.captureWriter = new RuntimeCaptureWriter(config, this.logger);
  }

  private getSession(sessionId: string): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const next: SessionState = {
      toolEvents: [],
      toolEventKeys: new Set<string>(),
      injectedNodeIds: []
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  private appendToolEvent(sessionId: string, toolEvent: ToolEvent, toolCallId?: string): void {
    const session = this.getSession(sessionId);
    const key = buildToolEventKey(toolEvent, toolCallId);

    if (session.toolEventKeys.has(key)) {
      return;
    }

    session.toolEventKeys.add(key);
    session.toolEvents.push(toolEvent);
  }

  recoverToolEvents(sessionId: string, payload: unknown): void {
    for (const toolResult of extractToolResultsFromPayload(payload)) {
      const recoveredEvent = toolResult.toolCallId
        ? this.orphanToolEvents.get(toolResult.toolCallId)
        : undefined;
      const nextEvent = recoveredEvent ?? normalizeToolResult(toolResult);
      this.appendToolEvent(sessionId, nextEvent, toolResult.toolCallId);

      if (toolResult.toolCallId) {
        this.orphanToolEvents.delete(toolResult.toolCallId);
      }
    }
  }

  private buildFinalizedInput(context: HostPromptContext, session: SessionState): ExperienceInput {
    const mergedContext = mergeContext(session.context, context);
    const injectedNodeIds =
      session.injectedNodeIds.length > 0 ? session.injectedNodeIds : mergedContext.injectedNodeIds ?? [];
    const input = buildExperienceInput(
      {
        ...mergedContext,
        injectedNodeIds
      },
      session.toolEvents
    );
    return input;
  }

  private persistFinalizedInput(
    input: ExperienceInput,
    sessionId: string,
    session: SessionState
  ): ExperienceInputRecord {
    const resolvedScope = resolveScope(session.context?.cwd);
    const existingScope = this.scopeRepo.getById(resolvedScope.scope_id);
    this.scopeRepo.upsert({
      ...resolvedScope,
      is_disabled: existingScope?.is_disabled ?? resolvedScope.is_disabled
    });

    const record = toInputRecord(input, sessionId);
    this.inputRepo.upsert(record);

    if (input.task_type !== "unknown") {
      const currentStats =
        this.statsRepo.get(input.scope_id, input.task_type) ?? createEmptyStats(input.scope_id, input.task_type);
      this.statsRepo.upsert(updateStats(currentStats, input.outcome_signal, input.injected_node_ids.length > 0));
    }

    return record;
  }

  private persistCandidates(input: ExperienceInput, originRecordId: string): ExperienceCandidate[] {
    const analysis = analyzeExperience(input);
    const persistedCandidates = analysis.accepted.map((draft) => draftToCandidate(draft, input, originRecordId));
    for (const candidate of persistedCandidates) {
      this.candidateRepo.upsert(candidate);
      this.jobRepo.upsert(candidateToInitialJob(candidate, this.config.distillerProfile));
    }
    return persistedCandidates;
  }

  private updateInjectedNodes(input: ExperienceInput, attributionRecordId: string): void {
    if (!input.injected_node_ids.length) {
      return;
    }

    const touched = input.injected_node_ids
      .map((id) => this.nodeRepo.getById(id))
      .filter((node): node is ExperienceNode => Boolean(node));

    for (const node of applyFeedback(input, touched, attributionRecordId)) {
      this.nodeRepo.upsert(node);
    }
  }

  async beforePromptBuild(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    session.context = mergeContext(session.context, context);
    const input = buildExperienceInput(session.context, session.toolEvents);
    const resolvedScope = resolveScope(session.context.cwd);
    const existingScope = this.scopeRepo.getById(resolvedScope.scope_id);

    if (existingScope?.is_disabled) {
      session.injectedNodeIds = [];
      session.context = {
        ...session.context,
        injectedNodeIds: []
      };

      this.logger.info?.("experienceengine.scope_disabled", {
        sessionId,
        scopeId: existingScope.scope_id
      });

      return {
        mode: "skip" as const,
        text: undefined,
        notice: undefined,
        input: {
          ...input,
          scope_id: existingScope.scope_id,
          injected_node_ids: []
        }
      };
    }

    const stats =
      input.task_type !== "unknown" ? this.statsRepo.get(input.scope_id, input.task_type) : undefined;
    const nodes = input.task_type !== "unknown" ? this.nodeRepo.listInjectableByScope(input.scope_id) : [];
    const decision = decideIntervention(input, nodes, stats, this.config.triggerThreshold, this.config.maxHints);

    session.injectedNodeIds = decision.selected.map((node) => node.id);
    session.context = {
      ...session.context,
      injectedNodeIds: session.injectedNodeIds
    };

    this.logger.debug?.("experienceengine.before_prompt_build", {
      sessionId,
      mode: decision.mode,
      injectedCount: session.injectedNodeIds.length
    });

    return {
      mode: decision.mode,
      text: decision.text,
      notice:
        decision.mode !== "skip" && this.config.noticesInline ? renderInlineNotice(decision.selected) : undefined,
      input: {
        ...input,
        injected_node_ids: session.injectedNodeIds
      }
    };
  }

  async persistToolResult(result: HostToolResult) {
    const normalizedToolEvent = normalizeToolResult(result);
    const sessionId = result.sessionId ?? "global";

    if (sessionId !== "global") {
      this.appendToolEvent(sessionId, normalizedToolEvent, result.toolCallId);
    } else if (result.toolCallId) {
      this.orphanToolEvents.set(result.toolCallId, normalizedToolEvent);
    }

    this.logger.debug?.("experienceengine.tool_result_persist", {
      sessionId,
      toolName: normalizedToolEvent.tool_name,
      status: normalizedToolEvent.status,
      toolCallId: result.toolCallId
    });

    return normalizedToolEvent;
  }

  async finalizeTask(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    const input = this.buildFinalizedInput(context, session);
    withTransaction(this.db, () => {
      const record = this.persistFinalizedInput(input, sessionId, session);
      this.persistCandidates(input, record.record_id);
      this.updateInjectedNodes(input, record.record_id);
    });
    this.sessions.delete(sessionId);

    if (this.config.distillationAutoDrain) {
      void this.distillationWorker.drain().catch((error) => {
        this.logger.error?.("experienceengine.distillation_drain_failed", {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    this.logger.info?.("experienceengine.finalize", {
      sessionId,
      taskType: input.task_type,
      outcome: input.outcome_signal
    });

    return input;
  }

  async drainDistillationQueue(limit?: number): Promise<number> {
    return this.distillationWorker.drain(limit);
  }
}
