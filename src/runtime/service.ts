import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { buildInjectionScorecard } from "../controller/injection-scorecard.js";
import { classifyFailureAttributionReason } from "../feedback/automatic-attribution.js";
import { applyFeedback } from "../feedback/feedback-manager.js";
import { detectHarm } from "../feedback/harm-detector.js";
import { buildExperienceInput } from "../input/input-adapter.js";
import { buildRetrievalContext } from "../controller/retrieval-context.js";
import { resolveScope } from "../input/scope-resolver.js";
import { decideIntervention } from "../controller/intervention-controller.js";
import { renderInlineNotice } from "../controller/inline-notice.js";
import { buildSkipScorecard } from "../controller/skip-scorecard.js";
import {
  applyGovernedNodeFeedback,
  deriveNodeOriginProfileForNode
} from "../experience-management/node-lifecycle-governance.js";
import { evaluateRepoPolicy } from "../experience-management/repo-policy.js";
import { resolveHybridRolloutState } from "../hybrid/rollout.js";
import { selectHybridRoute, type HybridRouteDecision, type HybridRouteSignals } from "../hybrid/router.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";
import type {
  EvaluationMode,
  ExperienceInput,
  ExperienceInputRecord,
  HybridReviewArtifact,
  InjectionEvent,
  AttributionRecord,
  AttributionVerdict,
  ExperienceNode,
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
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { OutcomeRecordRepository } from "../store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import { AttributionRecordRepository } from "../store/sqlite/repositories/attribution-record-repo.js";
import { ScopeFingerprintRepository } from "../store/sqlite/repositories/scope-fingerprint-repo.js";
import { RepoPolicyRepository } from "../store/sqlite/repositories/repo-policy-repo.js";
import { HybridInvocationTraceRepository } from "../store/sqlite/repositories/hybrid-invocation-trace-repo.js";
import { TraceRepository } from "../store/sqlite/repositories/trace-repo.js";
import {
  normalizeClaudeEvent,
  normalizeCodexEvent,
  normalizeAntigravityEvent,
  normalizeOpenClawEvent
} from "../adapters/host-normalizers.js";
import { getHostTraceCapabilityProfile } from "../adapters/trace-capabilities.js";
import type { HostTraceCapabilityProfile, TraceCapsule, TraceEvent, TraceProvenanceSummary } from "../types/domain.js";
import { RuntimeCaptureWriter } from "../plugin/runtime-capture.js";
import { normalizeToolResult } from "../plugin/hooks/tool-result-persist.js";
import { extractToolResultsFromPayload } from "../plugin/runtime-helpers.js";
import { HybridReviewArtifactRepository } from "../store/sqlite/repositories/hybrid-review-artifact-repo.js";
import {
  HygieneGovernanceScheduler,
  type SchedulerOptions as HygieneGovernanceSchedulerOptions
} from "../maintenance/hygiene-governance-scheduler.js";
import { LlmHygieneGovernancePlanner } from "../maintenance/hygiene-governance-llm-planner.js";
import { LearningPipelineService } from "./learning-pipeline-service.js";
import { mergeContext, TaskFinalizationService } from "./task-finalization-service.js";
import type { LlmLearningGate } from "../analyzer/llm-learning-gate.js";
import type { DistillationQueueWorker } from "../distillation/queue-worker.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import type { PostmortemReviewCapsule } from "../hybrid/types.js";
import type {
  HybridPostmortemResult,
  HybridWorkerClient,
  HybridWorkerClientOptions
} from "../hybrid/worker-client.js";
import { TrajectoryCompiler } from "../compiler/trajectory-compiler.js";
import { TrajectoryMatcher } from "../compiler/trajectory-matcher.js";

type LearningRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
};

type ExperienceRuntimeServiceOptions = LearningRuntimeOptions & {
  hybridWorkerClientOptions?: HybridWorkerClientOptions;
  disableBackgroundLearning?: boolean;
  disableHybridPosttask?: boolean;
  autonomousHygieneGovernance?: HygieneGovernanceSchedulerOptions & {
    enabled?: boolean;
  };
};

const loadLlmLearningGate = async (): Promise<typeof import("../analyzer/llm-learning-gate.js")> =>
  import("../analyzer/llm-learning-gate.js");

const loadDistillationQueueWorker = async (): Promise<typeof import("../distillation/queue-worker.js")> =>
  import("../distillation/queue-worker.js");

const loadHybridWorkerClientModule = async (): Promise<typeof import("../hybrid/worker-client.js")> =>
  import("../hybrid/worker-client.js");

const loadHybridCapsuleBuilder = async (): Promise<typeof import("../hybrid/capsule-builder.js")> =>
  import("../hybrid/capsule-builder.js");

const loadHybridPostmortemProviderClient = async (): Promise<typeof import("../hybrid/postmortem-provider-client.js")> =>
  import("../hybrid/postmortem-provider-client.js");

type SessionState = {
  context?: HostPromptContext;
  episodeId?: string;
  toolEvents: ToolEvent[];
  toolEventKeys: Set<string>;
  injectedNodeIds: string[];
  lastInjectionEvent?: InjectionEvent;
  traceEvents?: TraceEvent[];
};

const resolveEpisodeId = (session: SessionState, sessionId: string, input: Pick<ExperienceInput, "scope_id" | "task_summary">): string => {
  session.episodeId ??= stableId("episode", `${sessionId}:${input.scope_id}:${input.task_summary}`);
  return session.episodeId;
};

const DIRECTIONAL_CORRECTION_CUE_PATTERN =
  /\b(wrong (?:direction|layer|behavior|goal|abstraction|boundary)|not (?:the )?(?:right|requested)|not what (?:i|we) (?:want|asked)|instead of|rather than|focus on|problem is (?:still )?in|issue is (?:still )?in|belongs? in|priority is|quality bar|verification order|wrong scope|wrong abstraction)\b/i;

const normalizeTraceHost = (host: string | undefined): TaskRun["host"] => {
  const normalized = String(host || "").toLowerCase();
  if (normalized.includes("claude")) {
    return "claude-code";
  }
  if (normalized.includes("codex")) {
    return "codex";
  }
  if (normalized.includes("antigravity")) {
    return "antigravity";
  }
  return "openclaw";
};

const includesTraceScope = (patterns: string[], scopeId: string, cwd?: string): boolean =>
  patterns.length === 0 ||
  patterns.some((pattern) => pattern === scopeId || (cwd ? cwd.includes(pattern) : false));

function normalizeHostEvent(host: string | undefined, raw: any): TraceEvent {
  const normalizedHost = normalizeTraceHost(host);
  if (normalizedHost === "claude-code") {
    return normalizeClaudeEvent(raw);
  } else if (normalizedHost === "codex") {
    return normalizeCodexEvent(raw);
  } else if (normalizedHost === "openclaw") {
    return normalizeOpenClawEvent(raw);
  } else {
    return normalizeAntigravityEvent(raw);
  }
}

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

const HYBRID_LIGHTWEIGHT_PATTERN = /\b(wording-only|wording only|copy-only|copy only|copy pass|inline notice wording|expression-layer refinement)\b/i;

const isLightweightHybridExcludedTask = (input: Pick<ExperienceInput, "task_summary" | "context_summary">): boolean =>
  HYBRID_LIGHTWEIGHT_PATTERN.test(`${input.task_summary} ${input.context_summary ?? ""}`);

export const decidePosttaskHybridRoute = (
  config: Pick<
    ExperienceEngineConfig,
    "hybridEnabled" | "hybridAsyncPostmortemEnabled" | "hybridRoutePolicyVersion" | "hybridRolloutMode" | "hybridCanaryRate" | "hybridKillSwitch"
  >,
  input: Pick<ExperienceInput, "task_summary" | "context_summary">,
  signals: Omit<HybridRouteSignals, "explicitExplanationRequest" | "existingConservativePathRequired" | "rolloutAllowsAsyncPostmortem">,
  rolloutKey: string = input.task_summary
): HybridRouteDecision => {
  const rollout = resolveHybridRolloutState(config, rolloutKey);
  return selectHybridRoute(
    {
      ...signals,
      explicitExplanationRequest: false,
      existingConservativePathRequired: false,
      lightweightOrExcludedTask: signals.lightweightOrExcludedTask || isLightweightHybridExcludedTask(input),
      rolloutAllowsAsyncPostmortem: config.hybridAsyncPostmortemEnabled && rollout.hybridActive
    },
    {
      enabled: config.hybridEnabled && rollout.hybridActive,
      syncExplainEnabled: false,
      asyncPostmortemEnabled: config.hybridAsyncPostmortemEnabled && rollout.hybridActive,
      policyVersion: config.hybridRoutePolicyVersion
    }
  );
};

export class ExperienceRuntimeService implements ExperiencePlugin {
  private readonly db;
  private readonly logger: OpenClawLogger;
  private readonly sessions = new Map<string, SessionState>();
  private readonly orphanToolEvents = new Map<string, ToolEvent>();
  private readonly scopeRepo;
  private readonly inputRepo;
  private readonly nodeRepo;
  private readonly scopeFingerprintRepo;
  private readonly candidateRepo;
  private readonly jobRepo;
  private readonly taskRunRepo;
  private readonly outcomeRepo;
  private readonly reviewEventRepo;
  private readonly statsRepo;
  private readonly injectionRepo;
  private readonly attributionRecordRepo;
  private readonly repoPolicyRepo;
  private readonly hybridReviewArtifactRepo;
  private readonly hybridTraceRepo;
  private readonly traceRepo;
  private readonly learningPipeline;
  private readonly taskFinalization;
  private readonly runtimeOptions: ExperienceRuntimeServiceOptions;
  private readonly backgroundLearningEnabled: boolean;
  private readonly hybridPosttaskEnabled: boolean;
  private distillationWorkerPromise: Promise<DistillationQueueWorker> | undefined;
  private learningGatePromise: Promise<LlmLearningGate> | undefined;
  private hybridWorkerClientPromise: Promise<HybridWorkerClient> | undefined;
  private readonly pendingLearningTasks = new Set<Promise<void>>();
  private readonly pendingHygieneGovernanceTasks = new Set<Promise<void>>();
  readonly captureWriter;

  constructor(
    readonly config: ExperienceEngineConfig,
    logger?: OpenClawLogger,
    runtimeOptions: ExperienceRuntimeServiceOptions = {}
  ) {
    this.runtimeOptions = runtimeOptions;
    this.backgroundLearningEnabled = !runtimeOptions.disableBackgroundLearning;
    this.hybridPosttaskEnabled = !runtimeOptions.disableHybridPosttask;
    this.logger = logger ?? {};
    this.db = openDatabase(config);
    bootstrapDatabase(this.db);
    this.scopeRepo = new ScopeRepository(this.db);
    this.inputRepo = new InputRecordRepository(this.db);
    this.nodeRepo = new NodeRepository(this.db);
    this.scopeFingerprintRepo = new ScopeFingerprintRepository(this.db);
    this.candidateRepo = new CandidateRepository(this.db);
    this.jobRepo = new DistillationJobRepository(this.db);
    this.taskRunRepo = new TaskRunRepository(this.db);
    this.outcomeRepo = new OutcomeRecordRepository(this.db);
    this.reviewEventRepo = new ReviewEventRepository(this.db);
    this.statsRepo = new StatsRepository(this.db);
    this.injectionRepo = new InjectionRepository(this.db);
    this.attributionRecordRepo = new AttributionRecordRepository(this.db);
    this.repoPolicyRepo = new RepoPolicyRepository(this.db);
    this.hybridReviewArtifactRepo = new HybridReviewArtifactRepository(this.db);
    this.hybridTraceRepo = new HybridInvocationTraceRepository(this.db);
    this.traceRepo = new TraceRepository(this.db);
    this.learningPipeline = new LearningPipelineService({
      config: this.config,
      db: this.db,
      candidateRepo: this.candidateRepo,
      jobRepo: this.jobRepo,
      taskRunRepo: this.taskRunRepo,
      logger: this.logger,
      getLearningGate: () => this.getLearningGate(),
      getDistillationWorker: () => this.getDistillationWorker()
    });
    this.taskFinalization = new TaskFinalizationService({
      scopeRepo: this.scopeRepo,
      inputRepo: this.inputRepo,
      taskRunRepo: this.taskRunRepo,
      outcomeRepo: this.outcomeRepo,
      statsRepo: this.statsRepo
    });
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
      injectedNodeIds: [],
      traceEvents: []
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  resetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
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

  private isTraceCaptureEnabledFor(context: HostPromptContext, scopeId?: string): boolean {
    if (!this.config.traceCaptureEnabled) {
      return false;
    }

    const host = normalizeTraceHost(context.host);
    if (this.config.traceCaptureHosts.length > 0 && !this.config.traceCaptureHosts.includes(host)) {
      return false;
    }

    return scopeId ? includesTraceScope(this.config.traceCaptureScopes, scopeId, context.cwd) : true;
  }

  private shouldPersistDiagnosticTraceSnapshot(context: HostPromptContext, scopeId: string): boolean {
    if (!this.config.tracePersistDiagnosticSnapshots || !this.isTraceCaptureEnabledFor(context, scopeId)) {
      return false;
    }

    const host = normalizeTraceHost(context.host);
    return (
      this.config.traceDiagnosticSnapshotHosts.includes(host) ||
      this.config.traceDiagnosticSnapshotScopes.some((pattern) => pattern === scopeId || (context.cwd ? context.cwd.includes(pattern) : false))
    );
  }

  private captureTraceEvent(sessionId: string, context: HostPromptContext, raw: any): void {
    if (!this.isTraceCaptureEnabledFor(context)) {
      return;
    }

    const session = this.getSession(sessionId);
    session.traceEvents ??= [];
    session.traceEvents.push(normalizeHostEvent(context.host, raw));
  }

  private buildTraceHostProfile(host: TaskRun["host"]): HostTraceCapabilityProfile {
    return getHostTraceCapabilityProfile(host, this.db);
  }

  private buildTraceProvenanceSummary(input: {
    hostProfile: HostTraceCapabilityProfile;
    events: TraceEvent[];
    completenessScore: number;
    droppedEventsCount: number;
    redactionApplied: boolean;
    diagnosticSnapshotId?: string;
  }): TraceProvenanceSummary {
    const evidenceCategoryCounts: Record<string, number> = {};
    for (const event of input.events) {
      evidenceCategoryCounts[event.event_type] = (evidenceCategoryCounts[event.event_type] ?? 0) + 1;
    }

    const capabilityStates = new Set(Object.values(input.hostProfile.capabilities).map((capability) => capability.state));
    const capabilityState = capabilityStates.size === 1
      ? [...capabilityStates][0] ?? "unavailable"
      : capabilityStates.size > 1
        ? "mixed"
        : "unavailable";

    return {
      completeness_score: input.completenessScore,
      host: input.hostProfile.host,
      capability_state: capabilityState,
      evidence_category_counts: evidenceCategoryCounts,
      dropped_events_count: input.droppedEventsCount,
      redaction_applied: input.redactionApplied,
      source_provenance: "runtime_trace",
      learning_use_reason: input.completenessScore >= 0.6 ? "trace evidence available for distillation" : "trace evidence available but incomplete",
      diagnostic_snapshot_id: input.diagnosticSnapshotId
    };
  }

  private persistTraceCapsuleForFinalizedRun(input: {
    context: HostPromptContext;
    session: SessionState;
    sessionId: string;
    experienceInput: ExperienceInput;
    record: ExperienceInputRecord;
    taskRun: TaskRun;
    episodeId: string;
  }): { experienceInput: ExperienceInput; taskRun: TaskRun; record: ExperienceInputRecord } {
    const scopeId = input.experienceInput.scope_id;
    if (!this.isTraceCaptureEnabledFor(input.context, scopeId)) {
      return {
        experienceInput: input.experienceInput,
        taskRun: input.taskRun,
        record: input.record
      };
    }

    const host = normalizeTraceHost(input.context.host);
    const rawStopEvent: any = {
      timestamp: nowIso(),
      reason: input.context.outcomeSignal || input.experienceInput.outcome_signal || "completed"
    };
    if (host === "claude-code") {
      rawStopEvent.eventName = "stop";
    } else if (host === "codex") {
      rawStopEvent.type = "stop";
    } else if (host === "openclaw") {
      rawStopEvent.event = "stop";
    } else {
      rawStopEvent.name = "stop";
    }
    this.captureTraceEvent(input.sessionId, input.context, rawStopEvent);

    const observedEvents = input.session.traceEvents ?? [];
    const diagnosticSnapshotPersistence = this.shouldPersistDiagnosticTraceSnapshot(input.context, scopeId);
    const maxEvents = this.config.traceMaxEvents;
    const persistedEvents = diagnosticSnapshotPersistence ? observedEvents.slice(-maxEvents) : [];
    const droppedEventsCount = diagnosticSnapshotPersistence
      ? Math.max(0, observedEvents.length - persistedEvents.length)
      : observedEvents.length;
    const hasPrompt = observedEvents.some((event) => event.event_type === "prompt" || event.event_type === "correction");
    const hasStop = observedEvents.some((event) => event.event_type === "stop" || event.event_type === "task_completion");
    const expectedToolEvidence = input.experienceInput.tool_events.length === 0
      || observedEvents.some((event) =>
        event.event_type === "tool_call" ||
        event.event_type === "tool_result" ||
        event.event_type === "tool_failure" ||
        event.event_type === "verification" ||
        event.event_type === "file_change"
      );
    const completenessScore = Number(
      (
        0.25 +
        (hasPrompt ? 0.25 : 0) +
        (expectedToolEvidence ? 0.25 : 0) +
        (hasStop ? 0.25 : 0)
      ).toFixed(2)
    );
    const capsuleId = `trace_cap_${createId("trace")}`;
    const now = nowIso();
    const traceCompleteness = Math.min(1, completenessScore);
    const hostProfile = this.buildTraceHostProfile(host);
    const traceProvenance = this.buildTraceProvenanceSummary({
      hostProfile,
      events: observedEvents,
      completenessScore: traceCompleteness,
      droppedEventsCount,
      redactionApplied: observedEvents.length > 0,
      diagnosticSnapshotId: diagnosticSnapshotPersistence ? capsuleId : undefined
    });
    const tracedInput: ExperienceInput = {
      ...input.experienceInput,
      trace_capsule_id: diagnosticSnapshotPersistence ? capsuleId : undefined,
      trace_completeness: traceCompleteness,
      trace_provenance: traceProvenance
    };
    const tracedRecord: ExperienceInputRecord = {
      ...input.record,
      trace_capsule_id: diagnosticSnapshotPersistence ? capsuleId : undefined,
      trace_completeness: traceCompleteness,
      trace_provenance: traceProvenance
    };
    const tracedTaskRun: TaskRun = {
      ...input.taskRun,
      trace_capsule_id: diagnosticSnapshotPersistence ? capsuleId : undefined,
      trace_completeness: traceCompleteness,
      trace_provenance: traceProvenance,
      updated_at: now
    };

    if (diagnosticSnapshotPersistence) {
      const capsule: TraceCapsule = {
        id: capsuleId,
        scope_id: scopeId,
        episode_id: input.episodeId,
        task_run_id: input.taskRun.id,
        session_id: input.sessionId,
        task: {
          goal: input.experienceInput.task_summary || input.context.taskSummary || input.context.userMessage || "",
          user_constraints: [],
          injected_expectations: input.session.lastInjectionEvent?.scorecard?.recommendation
            ? [input.session.lastInjectionEvent.scorecard.recommendation]
            : [],
          delivered_node_ids: input.experienceInput.injected_node_ids
        },
        events: persistedEvents,
        evidence_refs: [],
        outcome: {
          outcome_signal: input.experienceInput.outcome_signal,
          confidence: hasStop ? "medium" : "low",
          summary: input.context.contextSummary ?? input.experienceInput.context_summary ?? input.experienceInput.task_summary,
          failure_signature: input.experienceInput.tool_events.find((event) => event.status === "failure")?.error_signature
        },
        capture_metadata: {
          is_complete: traceCompleteness >= 0.75,
          completeness_score: traceCompleteness,
          metadata_only: false,
          dropped_events_count: droppedEventsCount,
          redaction_applied: observedEvents.length > 0,
          size_bytes: JSON.stringify(persistedEvents).length
        },
        host_profile: hostProfile,
        created_at: now,
        updated_at: now
      };

      this.traceRepo.upsert(capsule);
      this.traceRepo.cleanupOldTraces(this.config.traceRetentionDays);
      this.traceRepo.cleanupCapsuleLimits(capsuleId, this.config.traceMaxEvents, this.config.traceMaxEvidenceRefs);
    }
    this.inputRepo.upsert(tracedRecord);
    this.taskRunRepo.upsert(tracedTaskRun);

    return {
      experienceInput: tracedInput,
      taskRun: tracedTaskRun,
      record: tracedRecord
    };
  }

  // The shipped runtime path stays exact-scope-only in this rollout.
  private resolveExactScopeInjectableNodes(scopeId: string): ExperienceNode[] {
    return this.nodeRepo.listLiveInjectableByExactScope(scopeId);
  }

  private resolveConservativeCrossScopeCandidates(scopeId: string): ExperienceNode[] {
    return this.nodeRepo.listConservativeCrossScopeCandidates(scopeId);
  }

  private resolveDiagnosticCandidates(scopeId: string): ExperienceNode[] {
    return this.nodeRepo.listDiagnosticCandidatesByExactScope(scopeId);
  }

  private resolveShadowProbeCandidates(scopeId: string): ExperienceNode[] {
    return this.nodeRepo.listShadowProbeByExactScope(scopeId);
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

  private trackLearningTask(task: Promise<void>): void {
    const tracked = task
      .catch((error) => {
        this.logger.error?.("experienceengine.learning_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        this.pendingLearningTasks.delete(tracked);
      });
    this.pendingLearningTasks.add(tracked);
  }

  private trackHygieneGovernanceTask(task: Promise<void>): void {
    const tracked = task
      .catch((error) => {
        this.logger.error?.("experienceengine.hygiene_governance_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        this.pendingHygieneGovernanceTasks.delete(tracked);
      });
    this.pendingHygieneGovernanceTasks.add(tracked);
  }

  async waitForBackgroundLearning(): Promise<void> {
    await Promise.allSettled([
      ...this.pendingLearningTasks,
      ...this.pendingHygieneGovernanceTasks
    ]);
  }

  private queueAutonomousHygieneGovernance(context: HostPromptContext, trigger: string): {
    status: "disabled" | "queued" | "skipped";
    reason?: "not_due" | "backoff";
    scopeId?: string;
  } {
    const options = this.runtimeOptions.autonomousHygieneGovernance;
    if (!options?.enabled) {
      return { status: "disabled" };
    }

    const { enabled: _enabled, ...schedulerOptions } = options;
    if (!schedulerOptions.planner) {
      const planner = new LlmHygieneGovernancePlanner({
        config: this.config,
        env: this.runtimeOptions.env,
        homeDir: this.runtimeOptions.homeDir,
        fetchImpl: this.runtimeOptions.fetchImpl
      });
      if (planner.hasEndpoint()) {
        schedulerOptions.planner = planner;
      }
    }
    const scheduler = new HygieneGovernanceScheduler(this.db, schedulerOptions);
    const queued = scheduler.maybeEnqueue({
      cwd: context.cwd,
      trigger
    });
    if (!queued.enqueued) {
      return {
        status: "skipped",
        reason: queued.reason === "due" ? undefined : queued.reason,
        scopeId: queued.scopeId
      };
    }

    this.trackHygieneGovernanceTask(
      scheduler.drainDueScope(queued.scopeId).then(() => undefined)
    );
    return { status: "queued", scopeId: queued.scopeId };
  }

  private maybeQueueAutonomousHygieneGovernance(context: HostPromptContext, trigger: string): void {
    this.queueAutonomousHygieneGovernance(context, trigger);
  }

  async signalHostEvent(context: HostPromptContext, trigger: string): Promise<{
    status: "disabled" | "queued" | "skipped";
    reason?: "not_due" | "backoff";
    scopeId?: string;
  }> {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    session.context = mergeContext(session.context, context);

    if ((trigger === "prompt_lookup" || trigger === "host_startup") && context.userMessage.trim()) {
      const isCorrection = DIRECTIONAL_CORRECTION_CUE_PATTERN.test(context.userMessage);
      const eventName = isCorrection ? "correction" : "prompt";
      const host = normalizeTraceHost(context.host);
      const rawPromptEvent: any = {
        timestamp: nowIso()
      };

      if (host === "claude-code") {
        rawPromptEvent.eventName = eventName;
        rawPromptEvent.promptText = context.userMessage;
      } else if (host === "codex") {
        rawPromptEvent.type = eventName;
        rawPromptEvent.prompt = context.userMessage;
      } else if (host === "openclaw") {
        rawPromptEvent.event = eventName === "correction" ? "correction" : "message";
        rawPromptEvent.message = context.userMessage;
      } else {
        rawPromptEvent.name = eventName;
        rawPromptEvent.prompt = context.userMessage;
      }

      this.captureTraceEvent(sessionId, context, rawPromptEvent);
    }

    return this.queueAutonomousHygieneGovernance(context, trigger);
  }

  private async getLearningGate(): Promise<LlmLearningGate | undefined> {
    if (!this.backgroundLearningEnabled) {
      return undefined;
    }
    this.learningGatePromise ??= loadLlmLearningGate().then(
      ({ LlmLearningGate: LoadedLlmLearningGate }) => new LoadedLlmLearningGate(this.config, this.runtimeOptions)
    );
    return this.learningGatePromise;
  }

  private async getDistillationWorker(): Promise<DistillationQueueWorker | undefined> {
    if (!this.backgroundLearningEnabled) {
      return undefined;
    }
    this.distillationWorkerPromise ??= loadDistillationQueueWorker().then(
      ({ DistillationQueueWorker: LoadedDistillationQueueWorker }) =>
        new LoadedDistillationQueueWorker(
          this.config,
          this.candidateRepo,
          this.jobRepo,
          this.nodeRepo,
          this.runtimeOptions
        )
    );
    return this.distillationWorkerPromise;
  }

  private async getHybridWorkerClient(): Promise<HybridWorkerClient | undefined> {
    if (!this.hybridPosttaskEnabled) {
      return undefined;
    }
    this.hybridWorkerClientPromise ??= loadHybridWorkerClientModule().then(
      ({ HybridWorkerClient: LoadedHybridWorkerClient }) =>
        new LoadedHybridWorkerClient({
          explainDecisionEnabled: this.config.hybridEnabled && this.config.hybridSyncExplainEnabled,
          postmortemReviewEnabled: this.config.hybridEnabled && this.config.hybridAsyncPostmortemEnabled,
          postmortemReviewLlmEnabled:
            this.config.hybridEnabled
            && this.config.hybridAsyncPostmortemEnabled
            && this.config.hybridAsyncPostmortemLlmEnabled,
          ...this.runtimeOptions.hybridWorkerClientOptions
        })
    );
    return this.hybridWorkerClientPromise;
  }

  private buildPostmortemArtifact(input: {
    taskRun: TaskRun;
    result: Extract<HybridPostmortemResult, { status: "accepted" }>;
    routeDecision: HybridRouteDecision;
  }): HybridReviewArtifact {
    const timestamp = nowIso();
    return {
      id: createId("hybridreview"),
      task_run_id: input.taskRun.id,
      scope_id: input.taskRun.scope_id,
      worker_task: "postmortem_review",
      approval_class:
        input.result.approvalClass === "policy_gated" ? "policy_gated" : "review_artifact",
      schema_version: this.config.hybridCapsuleSchemaVersion,
      route_policy_version: input.routeDecision.policyVersion,
      worker_profile_version: this.config.hybridPostmortemReviewProfileVersion,
      recommendation: input.result.value.candidate_recommendation,
      summary: input.result.value.review_artifact?.summary ?? input.result.value.reason,
      payload: input.result.value as unknown as Record<string, unknown>,
      created_at: timestamp,
      updated_at: timestamp
    };
  }

  private applyPostmortemDeliveryRecommendation(
    node: ExperienceNode,
    recommendation: "keep" | "conservative_only" | "quarantine" | "review"
  ): ExperienceNode {
    if (recommendation === "keep" || recommendation === "review") {
      return node;
    }

    if (recommendation === "quarantine") {
      return {
        ...node,
        delivery_state: "quarantined",
        quarantined_at: node.quarantined_at ?? nowIso(),
        quarantine_reason: node.quarantine_reason ?? "postmortem_review"
      };
    }

    if (node.delivery_state === "quarantined") {
      return node;
    }

    return {
      ...node,
      delivery_state: node.delivery_state === "shadow_only" ? "shadow_only" : "conservative_only"
    };
  }

  private applyAcceptedPostmortemNodeReviews(input: {
    taskRun: TaskRun;
    experienceInput: ExperienceInput;
    result: Extract<HybridPostmortemResult, { status: "accepted" }>;
  }): boolean {
    const reviews = input.result.value.injected_node_reviews ?? [];
    if (!reviews.length || input.taskRun.final_status === "cancelled") {
      return false;
    }

    const allowedIds = new Set(input.experienceInput.injected_node_ids);
    const existingEvents = this.reviewEventRepo.listByTaskRunId(input.taskRun.id);
    let applied = false;

    for (const review of reviews) {
      if (!allowedIds.has(review.node_id) || review.confidence === "low") {
        continue;
      }

      const current = this.nodeRepo.getById(review.node_id);
      if (!current) {
        continue;
      }

      const existingNodeEvents = existingEvents.filter(
        (event) => event.node_id === review.node_id && event.source === "automatic"
      );
      const alreadyMarkedHelped = existingNodeEvents.some((event) => event.event_type === "mark_helped");
      const alreadyMarkedHarmed = existingNodeEvents.some((event) => event.event_type === "mark_harmed");

      let nextNode = current;
      let feedbackEventType: "mark_helped" | "mark_harmed" | undefined;

      if (review.feedback_verdict === "helped" && !alreadyMarkedHelped) {
        nextNode = applyGovernedNodeFeedback(
          nextNode,
          "helped",
          deriveNodeOriginProfileForNode(this.inputRepo, nextNode)
        );
        feedbackEventType = "mark_helped";
      } else if (review.feedback_verdict === "harmed" && !alreadyMarkedHarmed) {
        nextNode = applyGovernedNodeFeedback(
          nextNode,
          "harmed",
          deriveNodeOriginProfileForNode(this.inputRepo, nextNode)
        );
        feedbackEventType = "mark_harmed";
      }

      const nodeAfterDelivery = this.applyPostmortemDeliveryRecommendation(
        nextNode,
        review.delivery_recommendation
      );

      if (
        feedbackEventType
        || nodeAfterDelivery.delivery_state !== current.delivery_state
        || nodeAfterDelivery.state !== current.state
        || nodeAfterDelivery.helped_count !== current.helped_count
        || nodeAfterDelivery.harmed_count !== current.harmed_count
        || nodeAfterDelivery.last_feedback_verdict !== current.last_feedback_verdict
      ) {
        this.nodeRepo.upsert(nodeAfterDelivery);
        applied = true;
      }

      if (feedbackEventType) {
        this.reviewEventRepo.upsert({
          id: createId("review"),
          episode_id: input.taskRun.episode_id,
          node_id: review.node_id,
          task_run_id: input.taskRun.id,
          event_type: feedbackEventType,
          source: "automatic",
          created_at: nowIso()
        });
      }
      if (current.delivery_state !== "quarantined" && nodeAfterDelivery.delivery_state === "quarantined") {
        this.reviewEventRepo.upsert({
          id: createId("review"),
          episode_id: input.taskRun.episode_id,
          node_id: review.node_id,
          task_run_id: input.taskRun.id,
          event_type: "quarantine",
          source: "automatic",
          created_at: nowIso()
        });
      }
    }

    return applied;
  }

  private async persistHybridPostmortemArtifactAsync(input: {
    taskRun: TaskRun;
    experienceInput: ExperienceInput;
    routeDecision: HybridRouteDecision;
    toolEvents: ToolEvent[];
    rolloutMode: string;
    rolloutReason: string;
  }): Promise<void> {
    if (!this.hybridPosttaskEnabled) {
      return;
    }
    if (this.hybridReviewArtifactRepo.getByTaskRunId(input.taskRun.id)) {
      return;
    }

    const hybridWorkerClient = await this.getHybridWorkerClient();
    if (!hybridWorkerClient) {
      return;
    }

    const candidateSignals = buildCandidateSignals(input.experienceInput);
    const [{ buildPostmortemReviewCapsule }, { resolveHybridPostmortemProviderEndpoint }] = await Promise.all([
      loadHybridCapsuleBuilder(),
      loadHybridPostmortemProviderClient()
    ]);
    const capsule: PostmortemReviewCapsule = buildPostmortemReviewCapsule({
      schemaVersion: this.config.hybridCapsuleSchemaVersion,
      routeDecision: input.routeDecision,
      taskRun: input.taskRun,
      outcomeSignal: input.experienceInput.outcome_signal,
      triggers: {
        directionalCorrectionPresent:
          candidateSignals.directional_correction?.detected === true
          || candidateSignals.evidence_driven_reversal?.detected === true,
        injectedNodeInteractionPresent: input.experienceInput.injected_node_ids.length > 0,
        retryOrInvalidationSignaturePresent:
          candidateSignals.retry_count > 0 || candidateSignals.evidence_driven_reversal?.invalidating_evidence === true,
        meaningfulFailureSignaturePresent: Boolean(candidateSignals.failure_signature),
        conservativeTransitionReviewWorthy:
          input.experienceInput.outcome_signal === "success" && input.experienceInput.injected_node_ids.length > 0
      },
      injectedNodes: input.experienceInput.injected_node_ids
        .map((id) => this.nodeRepo.getById(id))
        .filter((node): node is ExperienceNode => Boolean(node)),
      toolEvents: input.toolEvents
    });

    const providerResolution = this.config.hybridAsyncPostmortemLlmEnabled
      ? resolveHybridPostmortemProviderEndpoint(this.config)
      : { status: "disabled" as const, reason: "Phase 3 provider-backed postmortem review is disabled." };
    const result =
      this.config.hybridAsyncPostmortemLlmEnabled && providerResolution.status === "unavailable"
        ? ({
            status: "fallback",
            reason: "provider_unavailable"
          } as const)
        : await hybridWorkerClient.runPostmortemReview(
            capsule,
            providerResolution.status === "configured"
              ? {
                  mode: "provider",
                  endpoint: providerResolution.endpoint
                }
              : undefined
          );
    const timestamp = nowIso();
    const persistAcceptedArtifact =
      result.status === "accepted"
      && input.rolloutMode !== "shadow"
      && (result.approvalClass === "review_artifact" || result.approvalClass === "policy_gated");
    const appliedNodeWriteback =
      result.status === "accepted" && input.rolloutMode !== "shadow"
        ? this.applyAcceptedPostmortemNodeReviews({
            taskRun: input.taskRun,
            experienceInput: input.experienceInput,
            result
          })
        : false;
    this.hybridTraceRepo.upsert({
      id: createId("hybridtrace"),
      surface: "runtime",
      session_id: input.taskRun.session_id,
      scope_id: input.taskRun.scope_id,
      worker_task: "postmortem_review",
      route: input.routeDecision.route,
      route_policy_version: input.routeDecision.policyVersion,
      capsule_schema_version: this.config.hybridCapsuleSchemaVersion,
      worker_profile_version: this.config.hybridAsyncPostmortemLlmEnabled
        ? this.config.hybridPostmortemModelProfileVersion
        : this.config.hybridPostmortemReviewProfileVersion,
      rollout_mode: input.rolloutMode,
      rollout_reason: input.rolloutReason,
      worker_ran: result.status !== "fallback" || result.reason !== "provider_unavailable",
      validation_status: result.status === "accepted" ? "accepted" : "fallback",
      output_action: persistAcceptedArtifact || appliedNodeWriteback ? "stored" : "rejected",
      fallback_reason: result.status === "accepted" ? undefined : result.reason,
      created_at: timestamp
    });
    if (result.status !== "accepted") {
      this.logger.debug?.("experienceengine.hybrid_postmortem_skipped", {
        taskRunId: input.taskRun.id,
        reason: result.reason
      });
      return;
    }

    if (persistAcceptedArtifact) {
      this.hybridReviewArtifactRepo.upsert(
        this.buildPostmortemArtifact({
          taskRun: input.taskRun,
          result,
          routeDecision: input.routeDecision
        })
      );
    }
  }

  private async persistCandidatesAsync(
    input: ExperienceInput,
    originRecordId: string,
    taskRunId?: string,
    sessionId?: string
  ): Promise<void> {
    await this.learningPipeline.persistCandidatesAsync(input, originRecordId, taskRunId, sessionId);
  }

  private updateInjectedNodes(
    input: ExperienceInput,
    attributionRecordId: string,
    taskRunId?: string,
    injectionEvent?: InjectionEvent,
    episodeId?: string
  ): void {
    if (!input.injected_node_ids.length) {
      return;
    }

    if (injectionEvent?.scorecard?.interventionStrength === "diagnostic_hint" && !injectionEvent.delivered) {
      return;
    }

    const touched = input.injected_node_ids
      .map((id) => this.nodeRepo.getById(id))
      .filter((node): node is ExperienceNode => Boolean(node));

    const automaticEvents = touched
      .map((node) => {
        if (input.outcome_signal === "success") {
          return {
            nodeId: node.id,
            eventType: "mark_uncertain" as const
          };
        }

        if (detectHarm(input, node)) {
          return {
            nodeId: node.id,
            eventType: "mark_harmed" as const
          };
        }

        return undefined;
      })
      .filter(
        (
          value
        ): value is {
          nodeId: string;
          eventType: "mark_uncertain" | "mark_harmed";
        } => Boolean(value)
      );

    const originProfilesByNodeId = Object.fromEntries(
      touched.map((node) => {
        return [node.id, deriveNodeOriginProfileForNode(this.inputRepo, node)];
      })
    );

    const isDiagnosticHint = injectionEvent?.scorecard?.interventionStrength === "diagnostic_hint";
    const highMatchPromotionIds = new Set(
      isDiagnosticHint
        ? []
        : injectionEvent?.scorecard?.topCandidates
        ?.filter((candidate) =>
          candidate.matchScorecard?.scopeMatch === "same" &&
          candidate.matchScorecard.overallMatchBand === "high" &&
          candidate.matchScorecard.negativeEvidence.length === 0
        )
        .map((candidate) => candidate.id) ?? []
    );
    const promotedNodeIds: string[] = [];
    const fpRecord = this.scopeFingerprintRepo.getById(input.scope_id);
    const hostHash = fpRecord?.fingerprint_hash;

    for (const node of applyFeedback(input, touched, attributionRecordId, { originProfilesByNodeId })) {
      const shouldPromoteSameScopeHighMatch =
        input.outcome_signal === "success" &&
        input.scope_id === node.scope_id &&
        highMatchPromotionIds.has(node.id) &&
        node.state === "priority_candidate" &&
        node.delivery_state === "conservative_only" &&
        node.harmed_count === 0;
      let nextNode = shouldPromoteSameScopeHighMatch
        ? {
            ...node,
            state: "active" as const,
            delivery_state: "eligible" as const,
            validation_state: node.validation_state ?? "validated_by_reuse",
            promotion_reason: node.promotion_reason ?? "same_scope_high_match_success"
          }
        : node;

      if (hostHash && nextNode.scope_id !== input.scope_id) {
        const harmed = detectHarm(input, nextNode);
        const verdict =
          input.outcome_signal === "success"
            ? "success"
            : harmed
              ? "harmed"
              : "none";

        if (verdict === "success" || verdict === "harmed") {
          const evidence = nextNode.portable_validation_evidence ?? { compatibilityClasses: {} };
          const classes = evidence.compatibilityClasses ?? {};
          const prev = classes[hostHash] ?? { successReuseCount: 0, harmCount: 0, lastUsedAt: 0 };

          classes[hostHash] = {
            successReuseCount: verdict === "success" ? prev.successReuseCount + 1 : prev.successReuseCount,
            harmCount: verdict === "harmed" ? prev.harmCount + 1 : prev.harmCount,
            lastUsedAt: Date.now()
          };

          nextNode = {
            ...nextNode,
            portable_validation_evidence: {
              ...evidence,
              compatibilityClasses: classes
            }
          };
        }
      }

      if (shouldPromoteSameScopeHighMatch) {
        promotedNodeIds.push(node.id);
      }
      this.nodeRepo.upsert(nextNode);
    }

    for (const event of automaticEvents) {
      this.reviewEventRepo.upsert({
        id: createId("review"),
        episode_id: episodeId,
        node_id: event.nodeId,
        task_run_id: taskRunId,
        event_type: event.eventType,
        source: "automatic",
        created_at: nowIso()
      });
    }

    for (const nodeId of promotedNodeIds) {
      this.reviewEventRepo.upsert({
        id: createId("review"),
        episode_id: episodeId,
        node_id: nodeId,
        task_run_id: taskRunId,
        event_type: "promote_eligible",
        source: "automatic",
        created_at: nowIso()
      });
    }
  }

  private deriveAttributionVerdict(
    input: ExperienceInput,
    node: ExperienceNode,
    delivered: boolean,
    matchResult?: any
  ): {
    verdict: AttributionVerdict;
    confidence: AttributionRecord["confidence"];
  } {
    if (!delivered) {
      return { verdict: "unknown", confidence: "low" };
    }

    if (input.trace_capsule_id) {
      const isLowCompleteness = typeof input.trace_completeness === "number" && input.trace_completeness < 0.6;
      const isUnstable = input.trace_is_unstable === true;

      if ((isLowCompleteness || isUnstable) && (!matchResult || matchResult.verdict === "trajectory_unknown")) {
        return { verdict: "unknown", confidence: "low" };
      }

      if (matchResult) {
        if (matchResult.verdict === "guidance_prevented_failure") {
          return { verdict: "strong_helped", confidence: "high" };
        }
        if (matchResult.verdict === "guidance_caused_failure") {
          return { verdict: "strong_harmed", confidence: "high" };
        }
        if (matchResult.verdict === "adoption_detected") {
          return { verdict: "weak_helped", confidence: "medium" };
        }
        if (matchResult.verdict === "contra_adoption_detected") {
          return { verdict: "weak_harmed", confidence: "medium" };
        }
        if (matchResult.verdict === "non_adoption_detected") {
          return { verdict: "neutral", confidence: "low" };
        }
      }
    }

    if (input.outcome_signal === "success") {
      return { verdict: "weak_helped", confidence: "medium" };
    }

    if (input.outcome_signal === "failure") {
      if (detectHarm(input, node)) {
        return { verdict: "strong_harmed", confidence: "high" };
      }

      const reason = classifyFailureAttributionReason(input, node);
      if (reason === "relevant_failure") {
        return { verdict: "weak_harmed", confidence: "medium" };
      }

      return { verdict: "neutral", confidence: "low" };
    }

    return { verdict: "unknown", confidence: "low" };
  }

  private writeAttributionRecords(input: {
    experienceInput: ExperienceInput;
    inputRecordId: string;
    taskRunId: string;
    episodeId?: string;
    resolvedInjectionEvent: InjectionEvent;
  }): void {
    const event = input.resolvedInjectionEvent;
    const evidenceRefs = [input.inputRecordId, input.taskRunId, event.injection_id];
    if (input.experienceInput.trace_capsule_id) {
      evidenceRefs.push(input.experienceInput.trace_capsule_id);
    } else if (input.experienceInput.trace_provenance) {
      evidenceRefs.push(`trace_provenance:${input.taskRunId}`);
    }
    const selectedNodeIds = new Set(event.injected_node_ids);

    for (const nodeId of selectedNodeIds) {
      const node = this.nodeRepo.getById(nodeId);
      if (!node) {
        continue;
      }

      const compiledExps = TrajectoryCompiler.compileNodeExpectations(
        node.recommended_steps,
        node.avoid_steps,
        node.success_signal,
        node.stop_condition,
        node.escalation_condition
      );

      const matchResult = TrajectoryMatcher.match(
        compiledExps,
        input.experienceInput.tool_events,
        input.experienceInput.outcome_signal
      );

      const attribution = this.deriveAttributionVerdict(input.experienceInput, node, event.delivered, matchResult);
      this.attributionRecordRepo.insert({
        id: stableId("attr", `${event.injection_id}:${nodeId}:automatic`),
        injection_id: event.injection_id,
        node_id: nodeId,
        episode_id: input.episodeId,
        intervention_strength: event.scorecard?.interventionStrength,
        injection_mode: event.mode,
        delivery_mode: event.delivery_mode,
        delivered: event.delivered,
        outcome: input.experienceInput.outcome_signal,
        attribution_verdict: attribution.verdict,
        confidence: attribution.confidence,
        evidence_refs: evidenceRefs,
        source: "automatic",
        attribution_reason: event.attribution_reason,
        trajectory_verdict: matchResult.verdict,
        trajectory_confidence: matchResult.confidence,
        trajectory_matched_expectations: matchResult.matchedExpectationIds,
        trajectory_violated_expectations: matchResult.violatedExpectationIds,
        trajectory_evidence_refs: matchResult.evidenceRefs,
        created_at: nowIso(),
        resolved_at: event.resolved_at
      });
    }

    const diagnosticNodeIds = event.scorecard?.recordOnlyDiagnosticCandidateIds ?? [];
    for (const nodeId of diagnosticNodeIds) {
      if (selectedNodeIds.has(nodeId)) {
        continue;
      }

      const node = this.nodeRepo.getById(nodeId);
      let trajectoryFields = {};
      if (node) {
        const compiledExps = TrajectoryCompiler.compileNodeExpectations(
          node.recommended_steps,
          node.avoid_steps,
          node.success_signal,
          node.stop_condition,
          node.escalation_condition
        );
        const matchResult = TrajectoryMatcher.match(
          compiledExps,
          input.experienceInput.tool_events,
          input.experienceInput.outcome_signal
        );
        trajectoryFields = {
          trajectory_verdict: matchResult.verdict,
          trajectory_confidence: matchResult.confidence,
          trajectory_matched_expectations: matchResult.matchedExpectationIds,
          trajectory_violated_expectations: matchResult.violatedExpectationIds,
          trajectory_evidence_refs: matchResult.evidenceRefs,
        };

        if (node.delivery_state === "shadow_probe") {
          const hasHarm = detectHarm(input.experienceInput, node) || matchResult.verdict === "guidance_caused_failure";
          const isSuccess = input.experienceInput.outcome_signal === "success";

          if (isSuccess && !hasHarm) {
            const nextPassCount = (node.quarantine_no_harm_pass_count ?? 0) + 1;
            const updatedNode: ExperienceNode = {
              ...node,
              quarantine_no_harm_pass_count: nextPassCount,
              updated_at: nowIso()
            };

            if (nextPassCount >= 3) {
              updatedNode.delivery_state = "conservative_only";
              updatedNode.quarantine_release_reason = "passed_shadow_probe";

              this.reviewEventRepo.upsert({
                id: stableId("rev", `${input.taskRunId}:${nodeId}:restore_conservative`),
                episode_id: input.episodeId,
                node_id: nodeId,
                task_run_id: input.taskRunId,
                event_type: "restore_conservative",
                source: "automatic",
                created_at: nowIso()
              });
            }
            this.nodeRepo.upsert(updatedNode);
          } else {
            const nextAttemptCount = node.quarantine_release_attempt_count ?? 0;
            if (nextAttemptCount >= 3) {
              const updatedNode: ExperienceNode = {
                ...node,
                delivery_state: "retired",
                state: "retired",
                quarantine_no_harm_pass_count: 0,
                updated_at: nowIso()
              };
              this.nodeRepo.upsert(updatedNode);

              this.reviewEventRepo.upsert({
                id: stableId("rev", `${input.taskRunId}:${nodeId}:retire`),
                episode_id: input.episodeId,
                node_id: nodeId,
                task_run_id: input.taskRunId,
                event_type: "retire",
                source: "automatic",
                created_at: nowIso()
              });
            } else {
              const updatedNode: ExperienceNode = {
                ...node,
                delivery_state: "quarantined",
                quarantine_lease_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                quarantine_no_harm_pass_count: 0,
                updated_at: nowIso()
              };
              this.nodeRepo.upsert(updatedNode);

              this.reviewEventRepo.upsert({
                id: stableId("rev", `${input.taskRunId}:${nodeId}:quarantine`),
                episode_id: input.episodeId,
                node_id: nodeId,
                task_run_id: input.taskRunId,
                event_type: "quarantine",
                source: "automatic",
                created_at: nowIso()
              });
            }
          }
        }
      }

      this.attributionRecordRepo.insert({
        id: stableId("attr", `${event.injection_id}:${nodeId}:diagnostic_record`),
        injection_id: event.injection_id,
        node_id: nodeId,
        episode_id: input.episodeId,
        intervention_strength: "diagnostic_hint",
        injection_mode: event.mode,
        delivery_mode: event.delivery_mode,
        delivered: false,
        outcome: input.experienceInput.outcome_signal,
        attribution_verdict: "unknown",
        confidence: "low",
        evidence_refs: evidenceRefs,
        source: "diagnostic_record",
        attribution_reason: "diagnostic_record",
        ...trajectoryFields,
        created_at: nowIso(),
        resolved_at: event.resolved_at
      });
    }
  }

  async beforePromptBuild(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    session.context = mergeContext(session.context, context);

    if (this.isTraceCaptureEnabledFor(context)) {
      const isCorrection = DIRECTIONAL_CORRECTION_CUE_PATTERN.test(context.userMessage || "");
      const eventName = isCorrection ? "correction" : "prompt";
      const rawPromptEvent: any = {
        timestamp: nowIso()
      };
      
      const host = normalizeTraceHost(context.host);
      if (host === "claude-code") {
        rawPromptEvent.eventName = eventName;
        rawPromptEvent.promptText = context.userMessage || "";
      } else if (host === "codex") {
        rawPromptEvent.type = eventName;
        rawPromptEvent.prompt = context.userMessage || "";
      } else if (host === "openclaw") {
        rawPromptEvent.event = eventName === "correction" ? "correction" : "message";
        rawPromptEvent.message = context.userMessage || "";
      } else {
        rawPromptEvent.name = eventName;
        rawPromptEvent.prompt = context.userMessage || "";
      }

      this.captureTraceEvent(sessionId, context, rawPromptEvent);
    }
    this.maybeQueueAutonomousHygieneGovernance(session.context, "prompt_lookup");
    const input = buildExperienceInput(session.context, session.toolEvents);
    const retrievalContext = buildRetrievalContext(input, session.context);
    retrievalContext.db = this.db;
    const resolvedScope = resolveScope(session.context.cwd);
    const existingScope = this.scopeRepo.getById(resolvedScope.scope_id);

    if (existingScope?.is_disabled) {
      session.injectedNodeIds = [];
      session.context = {
        ...session.context,
        injectedNodeIds: []
      };
      const disabledInput = {
        ...input,
        scope_id: existingScope.scope_id,
        injected_node_ids: []
      };
      const scorecard = buildSkipScorecard(disabledInput, sessionId, undefined, true);
      const injectionEvent: InjectionEvent = {
        injection_id: createId("decision"),
        episode_id: resolveEpisodeId(session, sessionId, disabledInput),
        session_id: sessionId,
        scope_id: disabledInput.scope_id,
        task_type: disabledInput.task_type === "unknown" ? "general" : disabledInput.task_type,
        task_summary: disabledInput.task_summary,
        mode: "skip",
        delivery_mode: "live",
        delivered: false,
        injected_node_ids: [],
        injection_count: 0,
        scorecard,
        was_successful: null,
        harm_observed: null,
        created_at: nowIso()
      };
      this.injectionRepo.upsert(injectionEvent);
      session.lastInjectionEvent = injectionEvent;

      this.logger.info?.("experienceengine.scope_disabled", {
        sessionId,
        scopeId: existingScope.scope_id
      });

      return {
        mode: "skip" as const,
        text: undefined,
        notice: undefined,
        scorecard,
        retrievalContext,
        input: disabledInput
      };
    }

    const stats =
      input.task_type !== "unknown" ? this.statsRepo.get(input.scope_id, input.task_type) : undefined;
    const nodes = input.task_type !== "unknown"
      ? [
          ...this.resolveExactScopeInjectableNodes(input.scope_id),
          ...this.resolveConservativeCrossScopeCandidates(input.scope_id),
          ...this.resolveDiagnosticCandidates(input.scope_id),
          ...this.resolveShadowProbeCandidates(input.scope_id)
        ]
      : [];
    const existingRepoPolicy = this.repoPolicyRepo.getOrCreate(input.scope_id, this.config.repoExperienceMode);
    const repoPolicyEvaluation = evaluateRepoPolicy(
      existingRepoPolicy,
      this.attributionRecordRepo.listRecentEligibleByScope(input.scope_id),
      this.injectionRepo.listRecentResolvedByScope(input.scope_id)
    );
    if (repoPolicyEvaluation.changed) {
      this.repoPolicyRepo.upsert(repoPolicyEvaluation.policy);
      this.logger.warn?.("experienceengine.repo_policy_circuit_tripped", {
        scopeId: input.scope_id,
        configuredMode: repoPolicyEvaluation.policy.configured_mode,
        effectiveMode: repoPolicyEvaluation.policy.effective_mode,
        reason: repoPolicyEvaluation.policy.circuit_reason
      });
    }
    const decision = await decideIntervention(
      input,
      nodes,
      stats,
      this.config.triggerThreshold,
      this.config.maxHints,
      this.config,
      retrievalContext,
      repoPolicyEvaluation.policy
    );
    const episodeId = resolveEpisodeId(session, sessionId, input);

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

    const scorecard =
      decision.mode !== "skip"
        ? buildInjectionScorecard(
        input,
        decision.mode,
        decision.selected,
        sessionId,
        decision.diagnostics
      )
        : buildSkipScorecard(input, sessionId, decision.diagnostics);
    if (scorecard && decision.mode !== "skip" && !delivery.delivered) {
      if (delivery.deliveryMode === "holdout") {
        scorecard.skipReasonCode = "holdout_suppressed";
        scorecard.skipReasonExplanation = "ExperienceEngine found a usable match but withheld it for holdout evaluation.";
      } else {
        scorecard.skipReasonCode = "shadow_suppressed";
        scorecard.skipReasonExplanation = "ExperienceEngine found a usable match but shadow mode suppressed prompt delivery.";
      }
    }
    const injectionEvent: InjectionEvent = {
      injection_id: createId(decision.mode === "skip" ? "decision" : "inject"),
      episode_id: episodeId,
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
      scorecard: session.lastInjectionEvent?.scorecard,
      deliveryMode: decision.mode !== "skip" ? delivery.deliveryMode : undefined,
      delivered: decision.mode !== "skip" ? delivery.delivered : undefined,
      retrievalContext,
      input: {
        ...input,
        injected_node_ids: session.injectedNodeIds
      }
    };
  }

  async persistToolResult(result: HostToolResult) {
    const normalizedToolEvent = normalizeToolResult(result);
    const sessionId = result.sessionId ?? "global";

    const session = this.getSession(sessionId);
    const traceContext = session.context ?? {
      host: undefined,
      sessionId,
      userMessage: ""
    };

    if (this.isTraceCaptureEnabledFor(traceContext)) {
      const host = normalizeTraceHost(traceContext.host);
      const rawToolCallEvent: any = {
        timestamp: result.startedAt || nowIso(),
        id: `${result.toolCallId || stableId("tracecall", `${sessionId}:${result.toolName}:${result.inputSummary ?? ""}`)}:call`,
        toolName: result.toolName,
        toolInputSummary: result.inputSummary || "",
        arguments: result.inputSummary || "",
        toolCallId: result.toolCallId || "call_unknown"
      };
      
      if (host === "claude-code") {
        rawToolCallEvent.eventName = "beforetooluse";
      } else if (host === "codex") {
        rawToolCallEvent.type = "tool_call";
      } else if (host === "openclaw") {
        rawToolCallEvent.event = "tool_call";
      } else {
        rawToolCallEvent.name = "tool_call";
      }

      this.captureTraceEvent(sessionId, traceContext, rawToolCallEvent);

      const rawToolResultEvent: any = {
        timestamp: result.endedAt || nowIso(),
        id: `${result.toolCallId || stableId("tracecall", `${sessionId}:${result.toolName}:${result.inputSummary ?? ""}`)}:result`,
        toolName: result.toolName,
        toolInputSummary: result.inputSummary || "",
        arguments: result.inputSummary || "",
        toolOutputSummary: result.outputSummary || result.errorSignature || "",
        result: result.outputSummary || "",
        error: result.errorSignature || "",
        status: result.status || "success",
        exitCode: result.exitCode,
        exit_code: result.exitCode,
        toolCallId: result.toolCallId || "call_unknown"
      };

      if (host === "claude-code") {
        rawToolResultEvent.eventName = result.status === "failure" ? "posttoolusefailure" : "posttoolusesuccess";
      } else if (host === "codex") {
        rawToolResultEvent.type = "tool_result";
      } else if (host === "openclaw") {
        rawToolResultEvent.event = "tool_result";
      } else {
        rawToolResultEvent.name = "tool_result";
      }

      this.captureTraceEvent(sessionId, traceContext, rawToolResultEvent);
    }

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
    const input = this.taskFinalization.buildFinalizedInput(context, session);
    let finalizedInput = input;
    let learningTaskContext:
      | {
          input: ExperienceInput;
          originRecordId: string;
          taskRunId: string;
          sessionId: string;
          taskRun: TaskRun;
          toolEvents: ToolEvent[];
        }
      | undefined;
    withTransaction(this.db, () => {
      const episodeId = resolveEpisodeId(session, sessionId, input);
      const { record, taskRun } = this.taskFinalization.persistFinalizedRun({
        experienceInput: input,
        sessionId,
        session,
        episodeId,
        context,
        cwd: context.cwd
      });
      const traced = this.persistTraceCapsuleForFinalizedRun({
        context,
        session,
        sessionId,
        experienceInput: input,
        record,
        taskRun,
        episodeId
      });
      const injectionEvent = session.lastInjectionEvent ?? this.injectionRepo.getLatestBySessionId(sessionId);
      this.updateInjectedNodes(traced.experienceInput, traced.record.record_id, traced.taskRun.id, injectionEvent, episodeId);
      if (injectionEvent) {
        const touchedNodes = injectionEvent.injected_node_ids
          .map((id) => this.nodeRepo.getById(id))
          .filter((node): node is ExperienceNode => Boolean(node));
        const harmObserved = touchedNodes.some((node) => detectHarm(traced.experienceInput, node));
        const attributionReason = !injectionEvent.delivered
          ? "suppressed_delivery"
          : traced.experienceInput.outcome_signal === "success"
            ? "success_outcome"
            : traced.experienceInput.outcome_signal === "failure"
              ? touchedNodes
                  .map((node) => classifyFailureAttributionReason(traced.experienceInput, node))
                  .find((reason) => reason === "relevant_failure")
                  ?? classifyFailureAttributionReason(traced.experienceInput)
                : "unknown_outcome";
        const resolvedInjectionEvent: InjectionEvent = {
          ...injectionEvent,
          was_successful: traced.experienceInput.outcome_signal === "success",
          harm_observed: harmObserved,
          attribution_reason: attributionReason,
          resolved_at: nowIso()
        };
        this.injectionRepo.upsert(resolvedInjectionEvent);
        this.writeAttributionRecords({
          experienceInput: traced.experienceInput,
          inputRecordId: traced.record.record_id,
          taskRunId: traced.taskRun.id,
          episodeId,
          resolvedInjectionEvent
        });
      }
      learningTaskContext = {
        input: traced.experienceInput,
        originRecordId: traced.record.record_id,
        taskRunId: traced.taskRun.id,
        sessionId,
        taskRun: traced.taskRun,
        toolEvents: [...session.toolEvents]
      };
      finalizedInput = traced.experienceInput;
    });
    this.sessions.delete(sessionId);

    const rollout = resolveHybridRolloutState(this.config, `${sessionId}:${finalizedInput.task_summary}`);
    const hybridPosttaskRoute = decidePosttaskHybridRoute(
      this.config,
      finalizedInput,
      {
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: Boolean(finalizedInput.task_summary),
        postmortemAlreadyRecorded: learningTaskContext
          ? Boolean(this.hybridReviewArtifactRepo.getByTaskRunId(learningTaskContext.taskRun.id))
          : false,
        lightweightOrExcludedTask: false,
        directionalCorrectionPresent: Boolean(
          learningTaskContext
            ? buildCandidateSignals(learningTaskContext.input).directional_correction?.detected
              || buildCandidateSignals(learningTaskContext.input).evidence_driven_reversal?.detected
            : false
        ),
        injectedNodeInteractionPresent: finalizedInput.injected_node_ids.length > 0,
        retryOrInvalidationSignaturePresent: Boolean(
          learningTaskContext
            ? buildCandidateSignals(learningTaskContext.input).retry_count > 0
              || buildCandidateSignals(learningTaskContext.input).evidence_driven_reversal?.invalidating_evidence
            : false
        ),
        meaningfulFailureSignaturePresent: Boolean(
          learningTaskContext
            ? buildCandidateSignals(learningTaskContext.input).failure_signature
            : finalizedInput.outcome_signal === "failure"
        ),
        conservativeTransitionReviewWorthy: false
      },
      `${sessionId}:${finalizedInput.task_summary}`
    );

    if (learningTaskContext && this.backgroundLearningEnabled) {
      this.trackLearningTask(
        (async () => {
          await this.persistCandidatesAsync(
            learningTaskContext.input,
            learningTaskContext.originRecordId,
            learningTaskContext.taskRunId,
            learningTaskContext.sessionId
          );

          if (hybridPosttaskRoute.route !== "ESCALATE_ASYNC_POSTMORTEM") {
            return;
          }

          const refreshedTaskRun = this.taskRunRepo.getById(learningTaskContext.taskRun.id) ?? learningTaskContext.taskRun;
          await this.persistHybridPostmortemArtifactAsync({
            taskRun: refreshedTaskRun,
            experienceInput: learningTaskContext.input,
            routeDecision: hybridPosttaskRoute,
            toolEvents: learningTaskContext.toolEvents,
            rolloutMode: rollout.effectiveMode,
            rolloutReason: rollout.reason
          });
        })()
      );
    }

    this.logger.info?.("experienceengine.finalize", {
      sessionId,
      taskType: finalizedInput.task_type,
      outcome: finalizedInput.outcome_signal,
      hybridPosttaskRoute: hybridPosttaskRoute.route,
      hybridPosttaskRouteReason: hybridPosttaskRoute.reasonCode,
      hybridRoutePolicyVersion: hybridPosttaskRoute.policyVersion,
      hybridRolloutMode: rollout.effectiveMode,
      hybridRolloutReason: rollout.reason
    });

    this.maybeQueueAutonomousHygieneGovernance(context, "posttask");

    return finalizedInput;
  }

  async drainDistillationQueue(limit?: number): Promise<number> {
    const distillationWorker = await this.getDistillationWorker();
    if (!distillationWorker) {
      return 0;
    }
    return distillationWorker.drain(limit);
  }
}
