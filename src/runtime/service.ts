import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";
import type {
  ExperienceInput,
  InjectionEvent,
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
import type { SchedulerOptions as HygieneGovernanceSchedulerOptions } from "../maintenance/hygiene-governance-scheduler.js";
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
import { InjectionOutcomeService } from "./injection-outcome-service.js";
import { PosttaskRouteService, type PosttaskLearningContext } from "./posttask-route-service.js";
import { BackgroundLearningRuntime } from "./background-learning-runtime.js";
import { HygieneGovernanceRuntime, type HygieneGovernanceQueueResult } from "./hygiene-governance-runtime.js";
export { decidePosttaskHybridRoute } from "./posttask-route-service.js";

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
  private readonly injectionOutcome;
  private readonly posttaskRoute;
  private readonly backgroundLearning;
  private readonly hygieneGovernance;
  private readonly runtimeOptions: ExperienceRuntimeServiceOptions;
  private readonly backgroundLearningEnabled: boolean;
  private readonly hybridPosttaskEnabled: boolean;
  private distillationWorkerPromise: Promise<DistillationQueueWorker> | undefined;
  private learningGatePromise: Promise<LlmLearningGate> | undefined;
  private hybridWorkerClientPromise: Promise<HybridWorkerClient> | undefined;
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
    this.injectionOutcome = new InjectionOutcomeService({
      inputRepo: this.inputRepo,
      nodeRepo: this.nodeRepo,
      reviewEventRepo: this.reviewEventRepo,
      scopeFingerprintRepo: this.scopeFingerprintRepo,
      injectionRepo: this.injectionRepo,
      attributionWriteback: this.attributionWriteback
    });
    this.posttaskRoute = new PosttaskRouteService({
      config: this.config,
      hybridReviewArtifactRepo: this.hybridReviewArtifactRepo
    });
    this.backgroundLearning = new BackgroundLearningRuntime({
      enabled: this.backgroundLearningEnabled,
      learningPipeline: this.learningPipeline,
      taskRunRepo: this.taskRunRepo,
      hybridPostmortem: this.hybridPostmortem,
      logger: this.logger
    });
    this.hygieneGovernance = new HygieneGovernanceRuntime({
      config: this.config,
      db: this.db,
      logger: this.logger,
      runtimeOptions: this.runtimeOptions
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

  async waitForBackgroundLearning(): Promise<void> {
    await Promise.allSettled([
      this.backgroundLearning.wait(),
      this.hygieneGovernance.wait()
    ]);
  }

  private queueAutonomousHygieneGovernance(context: HostPromptContext, trigger: string): HygieneGovernanceQueueResult {
    return this.hygieneGovernance.queue(context, trigger);
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

  private updateInjectedNodes(
    input: ExperienceInput,
    attributionRecordId: string,
    taskRunId?: string,
    injectionEvent?: InjectionEvent,
    episodeId?: string
  ): void {
    this.injectionOutcome.updateInjectedNodes(
      input,
      attributionRecordId,
      taskRunId,
      injectionEvent,
      episodeId
    );
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
    let learningTaskContext: PosttaskLearningContext | undefined;
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
      this.injectionOutcome.finalizeInjectionOutcome({
        sessionId,
        sessionLastInjectionEvent: session.lastInjectionEvent,
        experienceInput: traced.experienceInput,
        inputRecordId: traced.record.record_id,
        taskRunId: traced.taskRun.id,
        episodeId
      });
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

    const routeResolution = this.posttaskRoute.resolve({
      sessionId,
      finalizedInput,
      learningTaskContext
    });
    const { route: hybridPosttaskRoute, rollout } = routeResolution;

    this.backgroundLearning.schedulePosttaskLearning({
      learningTaskContext,
      routeResolution
    });

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
