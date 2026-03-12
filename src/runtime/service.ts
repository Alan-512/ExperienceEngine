import { analyzeExperience } from "../analyzer/experience-analyzer.js";
import { applyFeedback } from "../feedback/feedback-manager.js";
import { createEmptyStats, updateStats } from "../feedback/stats-updater.js";
import { buildExperienceInput } from "../input/input-adapter.js";
import { resolveScope } from "../input/scope-resolver.js";
import { decideIntervention } from "../controller/intervention-controller.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";
import type {
  ExperienceCandidate,
  ExperienceInput,
  ExperienceInputRecord,
  ExperienceNode,
  ScopeTaskStats,
  ToolEvent
} from "../types/domain.js";
import type {
  ExperiencePlugin,
  HostPromptContext,
  HostToolResult,
  OpenClawLogger
} from "../types/plugin.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
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

const candidateToNode = (candidate: ExperienceCandidate, existing?: ExperienceNode): ExperienceNode => {
  const timestamp = nowIso();
  const id = stableId(
    "node",
    [candidate.scope_id, candidate.task_type, candidate.node_type, candidate.compact_hint].join(":")
  );

  return {
    id,
    ...candidate,
    state: existing?.state ?? "candidate",
    usage_count: existing?.usage_count ?? 0,
    helped_count: existing?.helped_count ?? 0,
    harmed_count: existing?.harmed_count ?? 0,
    support_count: (existing?.support_count ?? 0) + 1,
    created_at: existing?.created_at ?? timestamp,
    last_used_at: existing?.last_used_at,
    last_helped_at: existing?.last_helped_at,
    last_harmed_at: existing?.last_harmed_at,
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
  private readonly logger: OpenClawLogger;
  private readonly sessions = new Map<string, SessionState>();
  private readonly orphanToolEvents = new Map<string, ToolEvent>();
  private readonly scopeRepo;
  private readonly inputRepo;
  private readonly nodeRepo;
  private readonly candidateRepo;
  private readonly statsRepo;
  readonly captureWriter;

  constructor(
    readonly config: ExperienceEngineConfig,
    logger?: OpenClawLogger
  ) {
    this.logger = logger ?? {};
    const db = openDatabase(config);
    bootstrapDatabase(db);
    this.scopeRepo = new ScopeRepository(db);
    this.inputRepo = new InputRecordRepository(db);
    this.nodeRepo = new NodeRepository(db);
    this.candidateRepo = new CandidateRepository(db);
    this.statsRepo = new StatsRepository(db);
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

  private finalizeInput(context: HostPromptContext): ExperienceInput {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    const mergedContext = mergeContext(session.context, context);
    const input = buildExperienceInput(
      {
        ...mergedContext,
        injectedNodeIds: session.injectedNodeIds
      },
      session.toolEvents
    );

    this.scopeRepo.upsert(resolveScope(mergedContext.cwd));
    this.inputRepo.upsert(toInputRecord(input, sessionId));

    if (input.task_type !== "unknown") {
      const currentStats =
        this.statsRepo.get(input.scope_id, input.task_type) ?? createEmptyStats(input.scope_id, input.task_type);
      this.statsRepo.upsert(updateStats(currentStats, input.outcome_signal, input.injected_node_ids.length > 0));
    }

    return input;
  }

  private persistCandidates(input: ExperienceInput): void {
    const analysis = analyzeExperience(input);
    for (const candidate of analysis.accepted) {
      const candidateId = stableId(
        "node",
        [candidate.scope_id, candidate.task_type, candidate.node_type, candidate.compact_hint].join(":")
      );
      const existing = this.nodeRepo.getById(candidateId);
      this.nodeRepo.upsert(candidateToNode(candidate, existing));
    }
  }

  private updateInjectedNodes(input: ExperienceInput): void {
    if (!input.injected_node_ids.length) {
      return;
    }

    const touched = input.injected_node_ids
      .map((id) => this.nodeRepo.getById(id))
      .filter((node): node is ExperienceNode => Boolean(node));

    for (const node of applyFeedback(input, touched)) {
      this.nodeRepo.upsert(node);
    }
  }

  async beforePromptBuild(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    session.context = mergeContext(session.context, context);
    const input = buildExperienceInput(session.context, session.toolEvents);

    const stats =
      input.task_type !== "unknown" ? this.statsRepo.get(input.scope_id, input.task_type) : undefined;
    const nodes =
      input.task_type !== "unknown" ? this.candidateRepo.listByScopeAndTask(input.scope_id, input.task_type) : [];
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
    const input = this.finalizeInput(context);
    this.persistCandidates(input);
    this.updateInjectedNodes(input);
    this.sessions.delete(sessionId);

    this.logger.info?.("experienceengine.finalize", {
      sessionId,
      taskType: input.task_type,
      outcome: input.outcome_signal
    });

    return input;
  }
}
