export type HybridPhase3GateMetrics = {
  schemaValidOutputRate: number;
  timeoutFallbackRate: number;
  providerUnavailableFallbackRate: number;
  blockedPolicyGatedStability: number;
  falsePositiveRecommendationRate: number;
  artifactSpamRate: number;
  backlogGrowthVsBaseline: number;
};

const ratio = (value: number, total: number): number =>
  total > 0 ? Number((value / total).toFixed(4)) : 0;

export const buildHybridPhase3GateMetrics = (input: {
  scheduledEligibleRuns: number;
  acceptedArtifacts: number;
  policyGatedArtifacts: number;
  blockedOutputs: number;
  timeoutFallbacks: number;
  providerUnavailableFallbacks: number;
  validationFailedFallbacks: number;
  falsePositiveRecommendations: number;
  deterministicBaseline: {
    eligibleRuns: number;
    backlogSize: number;
  };
  currentWindow: {
    backlogSize: number;
  };
}): HybridPhase3GateMetrics => {
  const totalAttempts =
    input.acceptedArtifacts
    + input.policyGatedArtifacts
    + input.blockedOutputs
    + input.timeoutFallbacks
    + input.providerUnavailableFallbacks
    + input.validationFailedFallbacks;
  const acceptedLike = input.acceptedArtifacts + input.policyGatedArtifacts;
  const baselineBacklog = input.deterministicBaseline.backlogSize;
  const currentBacklog = input.currentWindow.backlogSize;
  const backlogGrowthVsBaseline =
    baselineBacklog > 0 ? Number(((currentBacklog - baselineBacklog) / baselineBacklog).toFixed(4)) : 0;

  return {
    schemaValidOutputRate: ratio(acceptedLike + input.blockedOutputs, totalAttempts),
    timeoutFallbackRate: ratio(input.timeoutFallbacks, totalAttempts),
    providerUnavailableFallbackRate: ratio(input.providerUnavailableFallbacks, totalAttempts),
    blockedPolicyGatedStability: ratio(acceptedLike + input.blockedOutputs, totalAttempts),
    falsePositiveRecommendationRate: ratio(input.falsePositiveRecommendations, totalAttempts),
    artifactSpamRate: ratio(acceptedLike, input.scheduledEligibleRuns),
    backlogGrowthVsBaseline
  };
};
