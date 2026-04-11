import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { buildInjectionScorecard } from "../controller/injection-scorecard.js";
import { classifyFailureAttributionReason } from "../feedback/automatic-attribution.js";
import { applyFeedback } from "../feedback/feedback-manager.js";
import { detectHarm } from "../feedback/harm-detector.js";
import { createEmptyStats, updateStats } from "../feedback/stats-updater.js";
import { buildExperienceInput } from "../input/input-adapter.js";
import { buildRetrievalContext } from "../controller/retrieval-context.js";
import { resolveScope } from "../input/scope-resolver.js";
import { decideIntervention } from "../controller/intervention-controller.js";
import { renderInlineNotice } from "../controller/inline-notice.js";
import {
  applyGovernedNodeFeedback,
  deriveNodeOriginProfileForNode
} from "../experience-management/node-lifecycle-governance.js";
import { resolveHybridRolloutState } from "../hybrid/rollout.js";
import { selectHybridRoute, type HybridRouteDecision, type HybridRouteSignals } from "../hybrid/router.js";
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
  HybridReviewArtifact,
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
import { HybridInvocationTraceRepository } from "../store/sqlite/repositories/hybrid-invocation-trace-repo.js";
import { RuntimeCaptureWriter } from "../plugin/runtime-capture.js";
import { normalizeToolResult } from "../plugin/hooks/tool-result-persist.js";
import { extractToolResultsFromPayload } from "../plugin/runtime-helpers.js";
import { HybridReviewArtifactRepository } from "../store/sqlite/repositories/hybrid-review-artifact-repo.js";
import type { LlmLearningGate } from "../analyzer/llm-learning-gate.js";
import type { DistillationQueueWorker } from "../distillation/queue-worker.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import type { PostmortemReviewCapsule } from "../hybrid/types.js";
import type {
  HybridPostmortemResult,
  HybridWorkerClient,
  HybridWorkerClientOptions
} from "../hybrid/worker-client.js";

type LearningRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
};

type ExperienceRuntimeServiceOptions = LearningRuntimeOptions & {
  hybridWorkerClientOptions?: HybridWorkerClientOptions;
  disableBackgroundLearning?: boolean;
  disableHybridPosttask?: boolean;
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
    host: context.host ?? "openclaw",
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
    learning_status: undefined,
    learning_reason: undefined,
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
    directional_correction: signals.directional_correction,
    evidence_driven_reversal: signals.evidence_driven_reversal,
    tool_event_summary: signals.tool_event_summary
  };
};

const mergeDirectionalCorrectionIntoSourceSignal = (
  sourceSignal: CandidateSourceSignal,
  draft: ExperienceCandidateDraft
): CandidateSourceSignal => {
  const directionalCorrection = sourceSignal.directional_correction;
  if (!directionalCorrection) {
    return sourceSignal;
  }

  const semanticDetected = Boolean(
    draft.experience_kind === "expectation_correction" &&
      draft.correction_category &&
      draft.deviation_pattern &&
      draft.corrected_constraint
  );

  if (!semanticDetected) {
    return sourceSignal;
  }

  return {
    ...sourceSignal,
    directional_correction: {
      ...directionalCorrection,
      semantic_detected: true,
      correction_category: draft.correction_category,
      deviation_pattern: draft.deviation_pattern,
      corrected_constraint: draft.corrected_constraint
    }
  };
};

const mergeEvidenceDrivenReversalIntoSourceSignal = (
  sourceSignal: CandidateSourceSignal,
  draft: ExperienceCandidateDraft
): CandidateSourceSignal => {
  const reversal = sourceSignal.evidence_driven_reversal;
  if (!reversal) {
    return sourceSignal;
  }

  const semanticDetected = Boolean(
    draft.experience_kind === "expectation_correction" &&
      draft.correction_category &&
      draft.deviation_pattern &&
      draft.corrected_constraint
  );

  if (!semanticDetected) {
    return sourceSignal;
  }

  return {
    ...sourceSignal,
    evidence_driven_reversal: {
      ...reversal,
      semantic_detected: true,
      correction_category: draft.correction_category,
      deviation_pattern: draft.deviation_pattern,
      corrected_constraint: draft.corrected_constraint
    }
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
  taskRunId?: string,
  directionalCorrectionSignal?: CandidateSourceSignal["directional_correction"],
  evidenceDrivenReversalSignal?: CandidateSourceSignal["evidence_driven_reversal"]
): ExperienceCandidate => {
  const timestamp = nowIso();
  const baseSourceSignal = buildCandidateSourceSignal(input);
  const sourceSignal = mergeEvidenceDrivenReversalIntoSourceSignal(
    mergeDirectionalCorrectionIntoSourceSignal(
      {
        ...baseSourceSignal,
        directional_correction: directionalCorrectionSignal ?? baseSourceSignal.directional_correction,
        evidence_driven_reversal: evidenceDrivenReversalSignal ?? baseSourceSignal.evidence_driven_reversal
      },
      draft
    ),
    draft
  );
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
  host: incoming.host ?? existing?.host,
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
  private readonly candidateRepo;
  private readonly jobRepo;
  private readonly taskRunRepo;
  private readonly outcomeRepo;
  private readonly reviewEventRepo;
  private readonly statsRepo;
  private readonly injectionRepo;
  private readonly hybridReviewArtifactRepo;
  private readonly hybridTraceRepo;
  private readonly runtimeOptions: ExperienceRuntimeServiceOptions;
  private readonly backgroundLearningEnabled: boolean;
  private readonly hybridPosttaskEnabled: boolean;
  private distillationWorkerPromise: Promise<DistillationQueueWorker> | undefined;
  private learningGatePromise: Promise<LlmLearningGate> | undefined;
  private hybridWorkerClientPromise: Promise<HybridWorkerClient> | undefined;
  private readonly pendingLearningTasks = new Set<Promise<void>>();
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
    this.candidateRepo = new CandidateRepository(this.db);
    this.jobRepo = new DistillationJobRepository(this.db);
    this.taskRunRepo = new TaskRunRepository(this.db);
    this.outcomeRepo = new OutcomeRecordRepository(this.db);
    this.reviewEventRepo = new ReviewEventRepository(this.db);
    this.statsRepo = new StatsRepository(this.db);
    this.injectionRepo = new InjectionRepository(this.db);
    this.hybridReviewArtifactRepo = new HybridReviewArtifactRepository(this.db);
    this.hybridTraceRepo = new HybridInvocationTraceRepository(this.db);
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

  // The shipped runtime path stays exact-scope-only in this rollout.
  private resolveExactScopeInjectableNodes(scopeId: string): ExperienceNode[] {
    return this.nodeRepo.listLiveInjectableByExactScope(scopeId);
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

  async waitForBackgroundLearning(): Promise<void> {
    await Promise.allSettled([...this.pendingLearningTasks]);
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
    const learningGate = await this.getLearningGate();
    if (!learningGate) {
      if (taskRunId) {
        const taskRun = this.taskRunRepo.getById(taskRunId);
        if (taskRun) {
          this.taskRunRepo.upsert({
            ...taskRun,
            learning_status: "not_applicable",
            learning_reason: "background learning disabled",
            updated_at: nowIso()
          });
        }
      }
      return;
    }

    const result = await learningGate.generateCandidateDrafts(input);
    if (taskRunId) {
      const taskRun = this.taskRunRepo.getById(taskRunId);
      if (taskRun) {
        this.taskRunRepo.upsert({
          ...taskRun,
          learning_status: result.drafts.length
            ? "captured"
            : result.source === "disabled" && result.reason === "distillation disabled"
              ? "not_applicable"
              : "rejected",
          learning_reason: result.reason,
          updated_at: nowIso()
        });
      }
    }
    if (!result.drafts.length) {
      this.logger.debug?.("experienceengine.learning_skipped", {
        sessionId,
        taskType: input.task_type,
        reason: result.reason,
        source: result.source
      });
      return;
    }

    const persistedCandidates = result.drafts.map((draft) =>
      draftToCandidate(
        draft,
        input,
        originRecordId,
        taskRunId,
        result.directionalCorrectionSignal,
        result.evidenceDrivenReversalSignal
      )
    );
    withTransaction(this.db, () => {
      for (const candidate of persistedCandidates) {
        this.candidateRepo.upsert(candidate);
        this.jobRepo.upsert(candidateToInitialJob(candidate, this.config.distillerProfile));
      }
    });

    this.logger.info?.("experienceengine.learning_captured", {
      sessionId,
      taskType: input.task_type,
      candidateCount: persistedCandidates.length,
      source: result.source,
      reason: result.reason
    });

    if (this.config.distillationAutoDrain) {
      const distillationWorker = await this.getDistillationWorker();
      if (!distillationWorker) {
        return;
      }

      await distillationWorker.drain().catch((error) => {
        this.logger.error?.("experienceengine.distillation_drain_failed", {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }
  }

  private updateInjectedNodes(input: ExperienceInput, attributionRecordId: string, taskRunId?: string): void {
    if (!input.injected_node_ids.length) {
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

    for (const node of applyFeedback(input, touched, attributionRecordId, { originProfilesByNodeId })) {
      this.nodeRepo.upsert(node);
    }

    for (const event of automaticEvents) {
      this.reviewEventRepo.upsert({
        id: createId("review"),
        node_id: event.nodeId,
        task_run_id: taskRunId,
        event_type: event.eventType,
        source: "automatic",
        created_at: nowIso()
      });
    }
  }

  async beforePromptBuild(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    session.context = mergeContext(session.context, context);
    const input = buildExperienceInput(session.context, session.toolEvents);
    const retrievalContext = buildRetrievalContext(input, session.context);
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
        retrievalContext,
        input: {
          ...input,
          scope_id: existingScope.scope_id,
          injected_node_ids: []
        }
      };
    }

    const stats =
      input.task_type !== "unknown" ? this.statsRepo.get(input.scope_id, input.task_type) : undefined;
    const nodes = input.task_type !== "unknown" ? this.resolveExactScopeInjectableNodes(input.scope_id) : [];
    const decision = await decideIntervention(
      input,
      nodes,
      stats,
      this.config.triggerThreshold,
      this.config.maxHints,
      this.config,
      retrievalContext
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
      const scorecard = buildInjectionScorecard(
        input,
        decision.mode,
        decision.selected,
        sessionId,
        decision.diagnostics
      );
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
      const record = this.persistFinalizedInput(input, sessionId, session);
      const taskRun = toTaskRun(input, sessionId, context);
      this.taskRunRepo.upsert(taskRun);
      this.outcomeRepo.upsert(toOutcomeRecord(taskRun, input));
      this.updateInjectedNodes(input, record.record_id, taskRun.id);
      if (session.lastInjectionEvent) {
        const touchedNodes = session.lastInjectionEvent.injected_node_ids
          .map((id) => this.nodeRepo.getById(id))
          .filter((node): node is ExperienceNode => Boolean(node));
        const harmObserved = touchedNodes.some((node) => detectHarm(input, node));
        const attributionReason = !session.lastInjectionEvent.delivered
          ? "suppressed_delivery"
          : input.outcome_signal === "success"
            ? "success_outcome"
            : input.outcome_signal === "failure"
              ? touchedNodes
                  .map((node) => classifyFailureAttributionReason(input, node))
                  .find((reason) => reason === "relevant_failure")
                  ?? classifyFailureAttributionReason(input)
              : "unknown_outcome";
        this.injectionRepo.upsert({
          ...session.lastInjectionEvent,
          was_successful: input.outcome_signal === "success",
          harm_observed: harmObserved,
          attribution_reason: attributionReason,
          resolved_at: nowIso()
        });
      }
      learningTaskContext = {
        input,
        originRecordId: record.record_id,
        taskRunId: taskRun.id,
        sessionId,
        taskRun,
        toolEvents: [...session.toolEvents]
      };
    });
    this.sessions.delete(sessionId);

    const rollout = resolveHybridRolloutState(this.config, `${sessionId}:${input.task_summary}`);
    const hybridPosttaskRoute = decidePosttaskHybridRoute(
      this.config,
      input,
      {
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: Boolean(input.task_summary),
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
        injectedNodeInteractionPresent: input.injected_node_ids.length > 0,
        retryOrInvalidationSignaturePresent: Boolean(
          learningTaskContext
            ? buildCandidateSignals(learningTaskContext.input).retry_count > 0
              || buildCandidateSignals(learningTaskContext.input).evidence_driven_reversal?.invalidating_evidence
            : false
        ),
        meaningfulFailureSignaturePresent: Boolean(
          learningTaskContext
            ? buildCandidateSignals(learningTaskContext.input).failure_signature
            : input.outcome_signal === "failure"
        ),
        conservativeTransitionReviewWorthy: false
      },
      `${sessionId}:${input.task_summary}`
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
      taskType: input.task_type,
      outcome: input.outcome_signal,
      hybridPosttaskRoute: hybridPosttaskRoute.route,
      hybridPosttaskRouteReason: hybridPosttaskRoute.reasonCode,
      hybridRoutePolicyVersion: hybridPosttaskRoute.policyVersion,
      hybridRolloutMode: rollout.effectiveMode,
      hybridRolloutReason: rollout.reason
    });

    return input;
  }

  async drainDistillationQueue(limit?: number): Promise<number> {
    const distillationWorker = await this.getDistillationWorker();
    if (!distillationWorker) {
      return 0;
    }
    return distillationWorker.drain(limit);
  }
}
