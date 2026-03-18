import { analyzeExperience } from "../analyzer/experience-analyzer.js";
import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { buildInjectionScorecard } from "../controller/injection-scorecard.js";
import { applyFeedback } from "../feedback/feedback-manager.js";
import { detectHarm } from "../feedback/harm-detector.js";
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
  EvaluationMode,
  ExperienceCandidate,
  ExperienceCandidateDraft,
  ExperienceInput,
  ExperienceInputRecord,
  InjectionEvent,
  ExperienceNode,
  OutcomeRecord,
  TaskRun,
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
import { OutcomeRecordRepository } from "../store/sqlite/repositories/outcome-record-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import { RuntimeCaptureWriter } from "../plugin/runtime-capture.js";
import { normalizeToolResult } from "../plugin/hooks/tool-result-persist.js";
import { extractToolResultsFromPayload } from "../plugin/runtime-helpers.js";

type SessionState = {
  context?: HostPromptContext;
  toolEvents: ToolEvent[];
  toolEventKeys: Set<string>;
  injectedNodeIds: string[];
  lastInjectionEvent?: InjectionEvent;
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

const toTaskRun = (input: ExperienceInput, sessionId: string, context: HostPromptContext): TaskRun => {
  const timestamp = nowIso();
  const signals = buildCandidateSignals(input);

  return {
    id: stableId("taskrun", `${sessionId}:${input.task_summary}:${timestamp}`),
    host: "openclaw",
    scope_id: input.scope_id,
    session_id: sessionId,
    task_type: input.task_type,
    task_summary: input.task_summary,
    prompt_excerpt: context.userMessage,
    context_summary: input.context_summary,
    started_at: timestamp,
    ended_at: timestamp,
    final_status:
      input.outcome_signal === "success" ? "success" : input.outcome_signal === "failure" ? "failure" : "unknown",
    failure_signature: signals.failure_signature,
    created_at: timestamp,
    updated_at: timestamp
  };
};

const toOutcomeRecord = (taskRun: TaskRun, input: ExperienceInput): OutcomeRecord => ({
  id: createId("outcome"),
  task_run_id: taskRun.id,
  outcome_signal: input.outcome_signal,
  failure_signature: taskRun.failure_signature,
  summary: input.task_summary,
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

const summarizeRawCandidate = (sourceSignal: CandidateSourceSignal): string => {
  const fragments = [...sourceSignal.tool_event_summary];
  if (sourceSignal.failure_signature) {
    fragments.unshift(`failure signature: ${sourceSignal.failure_signature}`);
  }
  return fragments.slice(0, 3).join(" | ");
};

const resolveCandidateKind = (
  input: ExperienceInput,
  sourceSignal: CandidateSourceSignal
): NonNullable<ExperienceCandidate["candidate_kind"]> => {
  if (input.outcome_signal === "success") {
    return "successful_fix";
  }
  if (sourceSignal.retry_count > 1) {
    return "retry_pattern";
  }
  if (sourceSignal.correction_signals.length > 0) {
    return "correction";
  }
  return "failure";
};

const draftToCandidate = (
  draft: ExperienceCandidateDraft,
  input: ExperienceInput,
  originRecordId: string,
  taskRunId?: string
): ExperienceCandidate => {
  const timestamp = nowIso();
  const sourceSignal = buildCandidateSourceSignal(input);
  const candidateId = stableId(
    "candidate",
    [draft.scope_id, draft.task_type, draft.node_type, draft.compact_hint, originRecordId].join(":")
  );

  return {
    id: candidateId,
    task_run_id: taskRunId ?? originRecordId,
    candidate_kind: resolveCandidateKind(input, sourceSignal),
    ...draft,
    source_record_id: originRecordId,
    source_context_summary: input.context_summary,
    source_outcome_signal: input.outcome_signal,
    raw_summary: summarizeRawCandidate(sourceSignal),
    failure_signature: sourceSignal.failure_signature,
    source_signal: sourceSignal,
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

const computeHoldoutBucket = (sessionId: string, taskSummary: string): number => {
  const value = `${sessionId}:${taskSummary}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
};

const resolveDeliveryMode = (
  evaluationMode: ExperienceEngineConfig["evaluationMode"],
  holdoutRate: number,
  sessionId: string,
  taskSummary: string,
  hasInjection: boolean
): {
  deliveryMode: EvaluationMode;
  delivered: boolean;
} => {
  if (!hasInjection) {
    return {
      deliveryMode: evaluationMode,
      delivered: false
    };
  }

  if (evaluationMode === "shadow") {
    return {
      deliveryMode: "shadow",
      delivered: false
    };
  }

  if (evaluationMode === "holdout") {
    return {
      deliveryMode: "holdout",
      delivered: computeHoldoutBucket(sessionId, taskSummary) >= holdoutRate
    };
  }

  return {
    deliveryMode: "live",
    delivered: true
  };
};

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
  private readonly taskRunRepo;
  private readonly outcomeRepo;
  private readonly statsRepo;
  private readonly injectionRepo;
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
    this.taskRunRepo = new TaskRunRepository(this.db);
    this.outcomeRepo = new OutcomeRecordRepository(this.db);
    this.statsRepo = new StatsRepository(this.db);
    this.injectionRepo = new InjectionRepository(this.db);
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

  private persistCandidates(input: ExperienceInput, originRecordId: string, taskRunId?: string): ExperienceCandidate[] {
    const analysis = analyzeExperience(input);
    const persistedCandidates = analysis.accepted.map((draft) =>
      draftToCandidate(draft, input, originRecordId, taskRunId)
    );
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
      session.lastInjectionEvent = undefined;
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
    const decision = await decideIntervention(
      input,
      nodes,
      stats,
      this.config.triggerThreshold,
      this.config.maxHints,
      this.config
    );

    const selectedNodeIds = decision.selected.map((node) => node.id);
    const delivery = resolveDeliveryMode(
      this.config.evaluationMode,
      this.config.holdoutRate,
      sessionId,
      input.task_summary,
      decision.mode !== "skip" && selectedNodeIds.length > 0
    );
    session.injectedNodeIds = delivery.delivered ? selectedNodeIds : [];
    session.context = {
      ...session.context,
      injectedNodeIds: session.injectedNodeIds
    };

    if (decision.mode !== "skip") {
      const scorecard = buildInjectionScorecard(input, decision.mode, decision.selected, sessionId);
      const injectionEvent: InjectionEvent = {
        injection_id: createId("inject"),
        session_id: sessionId,
        scope_id: input.scope_id,
        task_type: input.task_type === "unknown" ? "general" : input.task_type,
        task_summary: input.task_summary,
        mode: decision.mode,
        delivery_mode: delivery.deliveryMode,
        delivered: delivery.delivered,
        injected_node_ids: selectedNodeIds,
        injection_count: selectedNodeIds.length,
        scorecard,
        was_successful: null,
        harm_observed: null,
        created_at: nowIso()
      };
      this.injectionRepo.upsert(injectionEvent);
      session.lastInjectionEvent = injectionEvent;
    } else {
      session.lastInjectionEvent = undefined;
    }

    this.logger.debug?.("experienceengine.before_prompt_build", {
      sessionId,
      mode: decision.mode,
      injectedCount: session.injectedNodeIds.length,
      evaluationMode: this.config.evaluationMode,
      delivered: delivery.delivered
    });

    const deliveredMode = decision.mode !== "skip" && !delivery.delivered ? "skip" : decision.mode;
    return {
      mode: deliveredMode,
      text: deliveredMode === "skip" ? undefined : decision.text,
      notice:
        deliveredMode !== "skip" && this.config.noticesInline ? renderInlineNotice(decision.selected) : undefined,
      scorecard: decision.mode !== "skip" ? session.lastInjectionEvent?.scorecard : undefined,
      deliveryMode: decision.mode !== "skip" ? delivery.deliveryMode : undefined,
      delivered: decision.mode !== "skip" ? delivery.delivered : undefined,
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
      const taskRun = toTaskRun(input, sessionId, context);
      this.taskRunRepo.upsert(taskRun);
      this.outcomeRepo.upsert(toOutcomeRecord(taskRun, input));
      this.persistCandidates(input, record.record_id, taskRun.id);
      this.updateInjectedNodes(input, record.record_id);
      if (session.lastInjectionEvent) {
        const harmObserved = input.injected_node_ids
          .map((id) => this.nodeRepo.getById(id))
          .some((node) => detectHarm(input, node ?? undefined));
        this.injectionRepo.upsert({
          ...session.lastInjectionEvent,
          was_successful: input.outcome_signal === "success",
          harm_observed: harmObserved,
          resolved_at: nowIso()
        });
      }
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
