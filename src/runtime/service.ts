import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { classifyFailureAttributionReason } from "../feedback/automatic-attribution.js";
import { applyFeedback } from "../feedback/feedback-manager.js";
import { detectHarm } from "../feedback/harm-detector.js";
import { deriveNodeOriginProfileForNode } from "../experience-management/node-lifecycle-governance.js";
import { resolveHybridRolloutState } from "../hybrid/rollout.js";
import { selectHybridRoute, type HybridRouteDecision, type HybridRouteSignals } from "../hybrid/router.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";
import type {
  ExperienceInput,
  InjectionEvent,
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
import { PromptDecisionPipeline } from "./prompt-decision-pipeline.js";
import { TraceCaptureService, type TraceCaptureSessionState } from "./trace-capture-service.js";
import type { LlmLearningGate } from "../analyzer/llm-learning-gate.js";
import type { DistillationQueueWorker } from "../distillation/queue-worker.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import type { HybridWorkerClient, HybridWorkerClientOptions } from "../hybrid/worker-client.js";
import { HybridPostmortemService } from "./hybrid-postmortem-service.js";
import { AttributionWritebackService } from "./attribution-writeback-service.js";

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

type SessionState = TraceCaptureSessionState & {
  context?: HostPromptContext;
  episodeId?: string;
  toolEvents: ToolEvent[];
  toolEventKeys: Set<string>;
  injectedNodeIds: string[];
};

const resolveEpisodeId = (session: SessionState, sessionId: string, input: Pick<ExperienceInput, "scope_id" | "task_summary">): string => {
  session.episodeId ??= stableId("episode", `${sessionId}:${input.scope_id}:${input.task_summary}`);
  return session.episodeId;
};

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
  private readonly promptDecisionPipeline;
  private readonly traceCapture;
  private readonly hybridPostmortem;
  private readonly attributionWriteback;
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
    this.promptDecisionPipeline = new PromptDecisionPipeline({
      config: this.config,
      db: this.db,
      scopeRepo: this.scopeRepo,
      nodeRepo: this.nodeRepo,
      statsRepo: this.statsRepo,
      injectionRepo: this.injectionRepo,
      attributionRecordRepo: this.attributionRecordRepo,
      repoPolicyRepo: this.repoPolicyRepo,
      onScopeDisabled: ({ sessionId, scopeId }) => {
        this.logger.info?.("experienceengine.scope_disabled", {
          sessionId,
          scopeId
        });
      },
      onRepoPolicyChanged: ({ policy }) => {
        this.logger.warn?.("experienceengine.repo_policy_circuit_tripped", {
          scopeId: policy.scope_id,
          configuredMode: policy.configured_mode,
          effectiveMode: policy.effective_mode,
          reason: policy.circuit_reason
        });
      },
      onDecision: ({ sessionId, mode, injectedCount, evaluationMode, delivered }) => {
        this.logger.debug?.("experienceengine.before_prompt_build", {
          sessionId,
          mode,
          injectedCount,
          evaluationMode,
          delivered
        });
      }
    });
    this.traceCapture = new TraceCaptureService({
      config: this.config,
      db: this.db,
      traceRepo: this.traceRepo,
      inputRepo: this.inputRepo,
      taskRunRepo: this.taskRunRepo
    });
    this.hybridPostmortem = new HybridPostmortemService({
      config: this.config,
      enabled: this.hybridPosttaskEnabled,
      inputRepo: this.inputRepo,
      nodeRepo: this.nodeRepo,
      reviewEventRepo: this.reviewEventRepo,
      hybridReviewArtifactRepo: this.hybridReviewArtifactRepo,
      hybridTraceRepo: this.hybridTraceRepo,
      logger: this.logger,
      getHybridWorkerClient: () => this.getHybridWorkerClient()
    });
    this.attributionWriteback = new AttributionWritebackService({
      nodeRepo: this.nodeRepo,
      attributionRecordRepo: this.attributionRecordRepo,
      reviewEventRepo: this.reviewEventRepo
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
      this.traceCapture.capturePromptEvent(session, context, context.userMessage);
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

  async beforePromptBuild(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    session.context = mergeContext(session.context, context);

    this.traceCapture.capturePromptEvent(session, context, context.userMessage || "");
    this.maybeQueueAutonomousHygieneGovernance(session.context, "prompt_lookup");
    return this.promptDecisionPipeline.beforePromptBuild(context, sessionId, session);
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

    this.traceCapture.captureToolResultEvents({
      sessionId,
      session,
      context: traceContext,
      result
    });

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
      const traced = this.traceCapture.persistForFinalizedRun({
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
        this.attributionWriteback.writeAttributionRecords({
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
          await this.hybridPostmortem.persistAsync({
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
