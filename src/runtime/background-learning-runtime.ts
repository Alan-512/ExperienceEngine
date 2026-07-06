import type { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import type { ExperienceInput } from "../types/domain.js";
import type { OpenClawLogger } from "../types/plugin.js";
import type { LearningPipelineService } from "./learning-pipeline-service.js";
import type { HybridPostmortemService } from "./hybrid-postmortem-service.js";
import type { PosttaskLearningContext, PosttaskRouteResolution } from "./posttask-route-service.js";

export type BackgroundLearningRuntimeOptions = {
  enabled: boolean;
  learningPipeline: LearningPipelineService;
  taskRunRepo: TaskRunRepository;
  hybridPostmortem: HybridPostmortemService;
  logger: OpenClawLogger;
};

export class BackgroundLearningRuntime {
  private readonly pendingLearningTasks = new Set<Promise<void>>();

  constructor(private readonly options: BackgroundLearningRuntimeOptions) {}

  private trackTask(task: Promise<void>): void {
    const tracked = task
      .catch((error) => {
        this.options.logger.error?.("experienceengine.learning_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        this.pendingLearningTasks.delete(tracked);
      });
    this.pendingLearningTasks.add(tracked);
  }

  async wait(): Promise<void> {
    await Promise.allSettled(this.pendingLearningTasks);
  }

  async persistCandidatesAsync(
    input: ExperienceInput,
    originRecordId: string,
    taskRunId?: string,
    sessionId?: string
  ): Promise<void> {
    await this.options.learningPipeline.persistCandidatesAsync(input, originRecordId, taskRunId, sessionId);
  }

  schedulePosttaskLearning(input: {
    learningTaskContext?: PosttaskLearningContext;
    routeResolution: PosttaskRouteResolution;
  }): void {
    if (!input.learningTaskContext || !this.options.enabled) {
      return;
    }

    const learningTaskContext = input.learningTaskContext;
    const { route: hybridPosttaskRoute, rollout } = input.routeResolution;
    this.trackTask(
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

        const refreshedTaskRun =
          this.options.taskRunRepo.getById(learningTaskContext.taskRun.id) ?? learningTaskContext.taskRun;
        await this.options.hybridPostmortem.persistAsync({
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
}
