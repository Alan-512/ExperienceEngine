import type { HybridRoute, HybridRouteSignals } from "../../../../src/hybrid/types.js";

export type HybridRouteFixture = {
  id: string;
  expectedRoute: HybridRoute;
  protectedNormalTask?: boolean;
  signals: HybridRouteSignals;
};

const basePromptSignals: HybridRouteSignals = {
  taskStage: "prompt",
  explicitExplanationRequest: false,
  existingConservativePathRequired: false,
  completedRun: false,
  terminalOutcomeRecorded: false,
  boundedPosttaskCapsuleAvailable: false,
  postmortemAlreadyRecorded: false,
  lightweightOrExcludedTask: false,
  directionalCorrectionPresent: false,
  injectedNodeInteractionPresent: false,
  retryOrInvalidationSignaturePresent: false,
  meaningfulFailureSignaturePresent: false,
  conservativeTransitionReviewWorthy: false,
  rolloutAllowsAsyncPostmortem: true
};

export const routeFixtures: HybridRouteFixture[] = [
  {
    id: "prompt_fast_path_normal_task",
    expectedRoute: "FAST_PATH",
    protectedNormalTask: true,
    signals: { ...basePromptSignals }
  },
  {
    id: "prompt_explicit_explain_request",
    expectedRoute: "ESCALATE_SYNC_EXPLAIN",
    signals: { ...basePromptSignals, explicitExplanationRequest: true }
  },
  {
    id: "prompt_existing_conservative_path",
    expectedRoute: "FAST_PATH_CONSERVATIVE",
    signals: { ...basePromptSignals, existingConservativePathRequired: true }
  },
  {
    id: "posttask_directional_correction_async_review",
    expectedRoute: "ESCALATE_ASYNC_POSTMORTEM",
    signals: {
      ...basePromptSignals,
      taskStage: "posttask",
      completedRun: true,
      terminalOutcomeRecorded: true,
      boundedPosttaskCapsuleAvailable: true,
      directionalCorrectionPresent: true
    }
  },
  {
    id: "posttask_excluded_wording_task_stays_fast",
    expectedRoute: "FAST_PATH",
    signals: {
      ...basePromptSignals,
      taskStage: "posttask",
      completedRun: true,
      terminalOutcomeRecorded: true,
      boundedPosttaskCapsuleAvailable: true,
      lightweightOrExcludedTask: true,
      directionalCorrectionPresent: true
    }
  }
];
