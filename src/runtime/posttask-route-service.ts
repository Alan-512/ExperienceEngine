import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { resolveHybridRolloutState } from "../hybrid/rollout.js";
import { selectHybridRoute, type HybridRouteDecision, type HybridRouteSignals } from "../hybrid/router.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { HybridReviewArtifactRepository } from "../store/sqlite/repositories/hybrid-review-artifact-repo.js";
import type { ExperienceInput, TaskRun, ToolEvent } from "../types/domain.js";

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

export type PosttaskLearningContext = {
  input: ExperienceInput;
  originRecordId: string;
  taskRunId: string;
  sessionId: string;
  taskRun: TaskRun;
  toolEvents: ToolEvent[];
};

export type PosttaskRouteResolution = {
  route: HybridRouteDecision;
  rollout: ReturnType<typeof resolveHybridRolloutState>;
};

export type PosttaskRouteServiceOptions = {
  config: ExperienceEngineConfig;
  hybridReviewArtifactRepo: HybridReviewArtifactRepository;
};

export class PosttaskRouteService {
  constructor(private readonly options: PosttaskRouteServiceOptions) {}

  resolve(input: {
    sessionId: string;
    finalizedInput: ExperienceInput;
    learningTaskContext?: PosttaskLearningContext;
  }): PosttaskRouteResolution {
    const rolloutKey = `${input.sessionId}:${input.finalizedInput.task_summary}`;
    const rollout = resolveHybridRolloutState(this.options.config, rolloutKey);
    const candidateSignals = input.learningTaskContext
      ? buildCandidateSignals(input.learningTaskContext.input)
      : undefined;
    const route = decidePosttaskHybridRoute(
      this.options.config,
      input.finalizedInput,
      {
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: Boolean(input.finalizedInput.task_summary),
        postmortemAlreadyRecorded: input.learningTaskContext
          ? Boolean(this.options.hybridReviewArtifactRepo.getByTaskRunId(input.learningTaskContext.taskRun.id))
          : false,
        lightweightOrExcludedTask: false,
        directionalCorrectionPresent: Boolean(
          candidateSignals?.directional_correction?.detected === true
          || candidateSignals?.evidence_driven_reversal?.detected === true
        ),
        injectedNodeInteractionPresent: input.finalizedInput.injected_node_ids.length > 0,
        retryOrInvalidationSignaturePresent: Boolean(
          (candidateSignals?.retry_count ?? 0) > 0
          || candidateSignals?.evidence_driven_reversal?.invalidating_evidence === true
        ),
        meaningfulFailureSignaturePresent: Boolean(
          candidateSignals
            ? candidateSignals.failure_signature
            : input.finalizedInput.outcome_signal === "failure"
        ),
        conservativeTransitionReviewWorthy: false
      },
      rolloutKey
    );

    return { route, rollout };
  }
}
