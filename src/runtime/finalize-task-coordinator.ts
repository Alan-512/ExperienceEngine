import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../store/sqlite/db.js";
import type { ExperienceInput } from "../types/domain.js";
import type { HostPromptContext, OpenClawLogger } from "../types/plugin.js";
import type { BackgroundLearningRuntime } from "./background-learning-runtime.js";
import type { InjectionOutcomeService } from "./injection-outcome-service.js";
import type { PosttaskLearningContext, PosttaskRouteService } from "./posttask-route-service.js";
import { resolveSessionEpisodeId, type RuntimeSessionState } from "./session-runtime.js";
import type { TaskFinalizationService } from "./task-finalization-service.js";
import type { TraceCaptureService } from "./trace-capture-service.js";

export type FinalizeTaskCoordinatorOptions = {
  db: DatabaseSync;
  taskFinalization: TaskFinalizationService;
  traceCapture: TraceCaptureService;
  injectionOutcome: InjectionOutcomeService;
  posttaskRoute: PosttaskRouteService;
  backgroundLearning: BackgroundLearningRuntime;
  logger: OpenClawLogger;
  resetSession: (sessionId: string) => void;
  queuePosttaskGovernance: (context: HostPromptContext) => void;
};

export class FinalizeTaskCoordinator {
  constructor(private readonly options: FinalizeTaskCoordinatorOptions) {}

  async finalizeTask(input: {
    context: HostPromptContext;
    sessionId: string;
    session: RuntimeSessionState;
  }): Promise<ExperienceInput> {
    const finalizedRunInput = this.options.taskFinalization.buildFinalizedInput(input.context, input.session);
    let finalizedInput = finalizedRunInput;
    let learningTaskContext: PosttaskLearningContext | undefined;

    withTransaction(this.options.db, () => {
      const episodeId = resolveSessionEpisodeId(input.session, input.sessionId, finalizedRunInput);
      const { record, taskRun } = this.options.taskFinalization.persistFinalizedRun({
        experienceInput: finalizedRunInput,
        sessionId: input.sessionId,
        session: input.session,
        episodeId,
        context: input.context,
        cwd: input.context.cwd
      });
      const traced = this.options.traceCapture.persistForFinalizedRun({
        context: input.context,
        session: input.session,
        sessionId: input.sessionId,
        experienceInput: finalizedRunInput,
        record,
        taskRun,
        episodeId
      });
      this.options.injectionOutcome.finalizeInjectionOutcome({
        sessionId: input.sessionId,
        sessionLastInjectionEvent: input.session.lastInjectionEvent,
        experienceInput: traced.experienceInput,
        inputRecordId: traced.record.record_id,
        taskRunId: traced.taskRun.id,
        episodeId
      });
      learningTaskContext = {
        input: traced.experienceInput,
        originRecordId: traced.record.record_id,
        taskRunId: traced.taskRun.id,
        sessionId: input.sessionId,
        taskRun: traced.taskRun,
        toolEvents: [...input.session.toolEvents]
      };
      finalizedInput = traced.experienceInput;
    });
    this.options.resetSession(input.sessionId);

    const routeResolution = this.options.posttaskRoute.resolve({
      sessionId: input.sessionId,
      finalizedInput,
      learningTaskContext
    });
    const { route: hybridPosttaskRoute, rollout } = routeResolution;

    this.options.backgroundLearning.schedulePosttaskLearning({
      learningTaskContext,
      routeResolution
    });

    this.options.logger.info?.("experienceengine.finalize", {
      sessionId: input.sessionId,
      taskType: finalizedInput.task_type,
      outcome: finalizedInput.outcome_signal,
      hybridPosttaskRoute: hybridPosttaskRoute.route,
      hybridPosttaskRouteReason: hybridPosttaskRoute.reasonCode,
      hybridRoutePolicyVersion: hybridPosttaskRoute.policyVersion,
      hybridRolloutMode: rollout.effectiveMode,
      hybridRolloutReason: rollout.reason
    });

    this.options.queuePosttaskGovernance(input.context);

    return finalizedInput;
  }
}
