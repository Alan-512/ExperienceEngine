import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { LlmLearningGate } from "../analyzer/llm-learning-gate.js";
import type { DistillationQueueWorker } from "../distillation/queue-worker.js";
import type { HybridWorkerClient, HybridWorkerClientOptions } from "../hybrid/worker-client.js";
import type { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import type { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import type { NodeRepository } from "../store/sqlite/repositories/node-repo.js";

export type RuntimeWorkerFactoryRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
  hybridWorkerClientOptions?: HybridWorkerClientOptions;
};

export type RuntimeWorkerFactoryOptions = {
  config: ExperienceEngineConfig;
  runtimeOptions: RuntimeWorkerFactoryRuntimeOptions;
  backgroundLearningEnabled: boolean;
  hybridPosttaskEnabled: boolean;
  candidateRepo: CandidateRepository;
  jobRepo: DistillationJobRepository;
  nodeRepo: NodeRepository;
};

const loadLlmLearningGate = async (): Promise<typeof import("../analyzer/llm-learning-gate.js")> =>
  import("../analyzer/llm-learning-gate.js");

const loadDistillationQueueWorker = async (): Promise<typeof import("../distillation/queue-worker.js")> =>
  import("../distillation/queue-worker.js");

const loadHybridWorkerClientModule = async (): Promise<typeof import("../hybrid/worker-client.js")> =>
  import("../hybrid/worker-client.js");

export class RuntimeWorkerFactory {
  private distillationWorkerPromise: Promise<DistillationQueueWorker> | undefined;
  private learningGatePromise: Promise<LlmLearningGate> | undefined;
  private hybridWorkerClientPromise: Promise<HybridWorkerClient> | undefined;

  constructor(private readonly options: RuntimeWorkerFactoryOptions) {}

  async getLearningGate(): Promise<LlmLearningGate | undefined> {
    if (!this.options.backgroundLearningEnabled) {
      return undefined;
    }
    this.learningGatePromise ??= loadLlmLearningGate().then(
      ({ LlmLearningGate: LoadedLlmLearningGate }) =>
        new LoadedLlmLearningGate(this.options.config, this.options.runtimeOptions)
    );
    return this.learningGatePromise;
  }

  async getDistillationWorker(): Promise<DistillationQueueWorker | undefined> {
    if (!this.options.backgroundLearningEnabled) {
      return undefined;
    }
    this.distillationWorkerPromise ??= loadDistillationQueueWorker().then(
      ({ DistillationQueueWorker: LoadedDistillationQueueWorker }) =>
        new LoadedDistillationQueueWorker(
          this.options.config,
          this.options.candidateRepo,
          this.options.jobRepo,
          this.options.nodeRepo,
          this.options.runtimeOptions
        )
    );
    return this.distillationWorkerPromise;
  }

  async getHybridWorkerClient(): Promise<HybridWorkerClient | undefined> {
    if (!this.options.hybridPosttaskEnabled) {
      return undefined;
    }
    this.hybridWorkerClientPromise ??= loadHybridWorkerClientModule().then(
      ({ HybridWorkerClient: LoadedHybridWorkerClient }) =>
        new LoadedHybridWorkerClient({
          explainDecisionEnabled: this.options.config.hybridEnabled && this.options.config.hybridSyncExplainEnabled,
          postmortemReviewEnabled: this.options.config.hybridEnabled && this.options.config.hybridAsyncPostmortemEnabled,
          postmortemReviewLlmEnabled:
            this.options.config.hybridEnabled
            && this.options.config.hybridAsyncPostmortemEnabled
            && this.options.config.hybridAsyncPostmortemLlmEnabled,
          ...this.options.runtimeOptions.hybridWorkerClientOptions
        })
    );
    return this.hybridWorkerClientPromise;
  }
}
