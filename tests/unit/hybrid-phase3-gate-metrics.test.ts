import { describe, expect, it } from "vitest";
import { buildHybridPhase3GateMetrics } from "../../src/evaluation/hybrid-phase3-gate-metrics.js";

describe("buildHybridPhase3GateMetrics", () => {
  it("computes fixed phase 3 release metrics from scheduled runs and baseline backlog", () => {
    const metrics = buildHybridPhase3GateMetrics({
      scheduledEligibleRuns: 20,
      acceptedArtifacts: 10,
      policyGatedArtifacts: 4,
      blockedOutputs: 2,
      timeoutFallbacks: 1,
      providerUnavailableFallbacks: 1,
      validationFailedFallbacks: 2,
      falsePositiveRecommendations: 1,
      deterministicBaseline: {
        eligibleRuns: 20,
        backlogSize: 10
      },
      currentWindow: {
        backlogSize: 11
      }
    });

    expect(metrics).toEqual({
      schemaValidOutputRate: 0.8,
      timeoutFallbackRate: 0.05,
      providerUnavailableFallbackRate: 0.05,
      blockedPolicyGatedStability: 0.8,
      falsePositiveRecommendationRate: 0.05,
      artifactSpamRate: 0.7,
      backlogGrowthVsBaseline: 0.1
    });
  });
});
