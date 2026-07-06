import type {
  ExperienceInput,
  InjectionEvent
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
import { HybridReviewArtifactRepository } from "../store/sqlite/repositories/hybrid-review-artifact-repo.js";
import type { SchedulerOptions as HygieneGovernanceSchedulerOptions } from "../maintenance/hygiene-governance-scheduler.js";
import { LearningPipelineService } from "./learning-pipeline-service.js";
import { TaskFinalizationService } from "./task-finalization-service.js";
import { PromptDecisionPipeline } from "./prompt-decision-pipeline.js";
import { TraceCaptureService } from "./trace-capture-service.js";
import type { HybridWorkerClientOptions } from "../hybrid/worker-client.js";
import { HybridPostmortemService } from "./hybrid-postmortem-service.js";
import { AttributionWritebackService } from "./attribution-writeback-service.js";
import { InjectionOutcomeService } from "./injection-outcome-service.js";
import { PosttaskRouteService } from "./posttask-route-service.js";
import { BackgroundLearningRuntime } from "./background-learning-runtime.js";
import { HygieneGovernanceRuntime, type HygieneGovernanceQueueResult } from "./hygiene-governance-runtime.js";
import { ToolEventRecoveryRuntime } from "./tool-event-recovery-runtime.js";
import { RuntimeWorkerFactory } from "./runtime-worker-factory.js";
import { RuntimeSessionStore, type RuntimeSessionState } from "./session-runtime.js";
import { FinalizeTaskCoordinator } from "./finalize-task-coordinator.js";
import { ToolResultRuntime } from "./tool-result-runtime.js";
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

export class ExperienceRuntimeService implements ExperiencePlugin {
  private readonly db;
  private readonly logger: OpenClawLogger;
  private readonly sessions = new RuntimeSessionStore();
  private readonly toolEventRecovery;
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
  private readonly toolResultRuntime;
  private readonly promptDecisionPipeline;
  private readonly traceCapture;
  private readonly hybridPostmortem;
  private readonly attributionWriteback;
  private readonly injectionOutcome;
  private readonly posttaskRoute;
  private readonly backgroundLearning;
  private readonly finalizeTaskCoordinator;
  private readonly hygieneGovernance;
  private readonly workerFactory;
  private readonly runtimeOptions: ExperienceRuntimeServiceOptions;
  private readonly backgroundLearningEnabled: boolean;
  private readonly hybridPosttaskEnabled: boolean;
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
    this.workerFactory = new RuntimeWorkerFactory({
      config: this.config,
      runtimeOptions: this.runtimeOptions,
      backgroundLearningEnabled: this.backgroundLearningEnabled,
      hybridPosttaskEnabled: this.hybridPosttaskEnabled,
      candidateRepo: this.candidateRepo,
      jobRepo: this.jobRepo,
      nodeRepo: this.nodeRepo
    });
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
    this.finalizeTaskCoordinator = new FinalizeTaskCoordinator({
      db: this.db,
      taskFinalization: this.taskFinalization,
      traceCapture: this.traceCapture,
      injectionOutcome: this.injectionOutcome,
      posttaskRoute: this.posttaskRoute,
      backgroundLearning: this.backgroundLearning,
      logger: this.logger,
      resetSession: (sessionId) => this.sessions.reset(sessionId),
      queuePosttaskGovernance: (context) => {
        this.maybeQueueAutonomousHygieneGovernance(context, "posttask");
      }
    });
    this.hygieneGovernance = new HygieneGovernanceRuntime({
      config: this.config,
      db: this.db,
      logger: this.logger,
      runtimeOptions: this.runtimeOptions
    });
    this.toolEventRecovery = new ToolEventRecoveryRuntime({
      getSession: (sessionId) => this.getSession(sessionId)
    });
    this.toolResultRuntime = new ToolResultRuntime({
      getSession: (sessionId) => this.getSession(sessionId),
      traceCapture: this.traceCapture,
      toolEventRecovery: this.toolEventRecovery,
      logger: this.logger
    });
    this.captureWriter = new RuntimeCaptureWriter(config, this.logger);
  }

  private getSession(sessionId: string): RuntimeSessionState {
    return this.sessions.get(sessionId);
  }

  resetSession(sessionId: string): void {
    this.sessions.reset(sessionId);
  }

  private mergeSessionContext(sessionId: string, context: HostPromptContext): RuntimeSessionState {
    return this.sessions.mergeContext(sessionId, context);
  }

  recoverToolEvents(sessionId: string, payload: unknown): void {
    this.toolEventRecovery.recover(sessionId, payload);
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
    const session = this.mergeSessionContext(sessionId, context);

    if ((trigger === "prompt_lookup" || trigger === "host_startup") && context.userMessage.trim()) {
      this.traceCapture.capturePromptEvent(session, context, context.userMessage);
    }

    return this.queueAutonomousHygieneGovernance(context, trigger);
  }

  private async getLearningGate() {
    return this.workerFactory.getLearningGate();
  }

  private async getDistillationWorker() {
    return this.workerFactory.getDistillationWorker();
  }

  private async getHybridWorkerClient() {
    return this.workerFactory.getHybridWorkerClient();
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
    const session = this.mergeSessionContext(sessionId, context);
    const mergedContext = session.context ?? context;

    this.traceCapture.capturePromptEvent(session, context, context.userMessage || "");
    this.maybeQueueAutonomousHygieneGovernance(mergedContext, "prompt_lookup");
    return this.promptDecisionPipeline.beforePromptBuild(context, sessionId, session);
  }

  async persistToolResult(result: HostToolResult) {
    return this.toolResultRuntime.persist(result);
  }

  async finalizeTask(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    return this.finalizeTaskCoordinator.finalizeTask({ context, sessionId, session });
  }

  async drainDistillationQueue(limit?: number): Promise<number> {
    const distillationWorker = await this.getDistillationWorker();
    if (!distillationWorker) {
      return 0;
    }
    return distillationWorker.drain(limit);
  }
}
