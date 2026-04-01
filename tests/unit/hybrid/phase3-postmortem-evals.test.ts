import { describe, expect, it } from "vitest";
import { phase3PostmortemFixtures } from "../../fixtures/hybrid-phase3/postmortem/index.js";
import { runPostmortemReviewLlmWorker } from "../../../src/hybrid/workers/postmortem-review-llm.js";
import { validatePostmortemReviewOutput } from "../../../src/hybrid/validators.js";
import { buildHybridPhase3GateMetrics } from "../../../src/evaluation/hybrid-phase3-gate-metrics.js";

const openAiEndpoint = {
  kind: "openai" as const,
  provider: "openai_compatible" as const,
  model: "gpt-5.4-mini",
  baseUrl: "https://api.openai.com/v1/chat/completions",
  headers: {
    Authorization: "Bearer test-key"
  },
  source: "explicit" as const
};

describe("hybrid phase 3 postmortem eval gate", () => {
  it("keeps provider-backed postmortem review within the fixed phase 3 fixture set", async () => {
    const graded = await Promise.all(
      phase3PostmortemFixtures.map(async (fixture) => {
        try {
          const output = await runPostmortemReviewLlmWorker(fixture.capsule, {
            endpoint: openAiEndpoint,
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  choices: [
                    {
                      message: {
                        content: fixture.responseJson
                      }
                    }
                  ]
                }),
                { status: 200, headers: { "content-type": "application/json" } }
              )
          });
          const validated = validatePostmortemReviewOutput(output);
          return {
            fixture,
            validated
          };
        } catch (error) {
          return {
            fixture,
            error
          };
        }
      })
    );

    expect(graded[0]).toMatchObject({
      fixture: expect.objectContaining({ name: "good bounded postmortem artifact" }),
      validated: expect.objectContaining({
        status: "accepted",
        approvalClass: "review_artifact"
      })
    });
    expect(graded[1]).toMatchObject({
      fixture: expect.objectContaining({ name: "policy gated artifact with follow-up recommendation" }),
      validated: expect.objectContaining({
        status: "accepted",
        approvalClass: "policy_gated"
      })
    });
    expect(graded[2]).toMatchObject({
      fixture: expect.objectContaining({ name: "blocked overreach" }),
      validated: expect.objectContaining({
        status: "rejected",
        reason: "approval_blocked"
      })
    });
  });

  it("computes backlog-aware gate metrics for the phase 3 release decision", () => {
    const metrics = buildHybridPhase3GateMetrics({
      scheduledEligibleRuns: 10,
      acceptedArtifacts: 7,
      policyGatedArtifacts: 1,
      blockedOutputs: 1,
      timeoutFallbacks: 0,
      providerUnavailableFallbacks: 0,
      validationFailedFallbacks: 1,
      falsePositiveRecommendations: 0,
      deterministicBaseline: {
        eligibleRuns: 10,
        backlogSize: 5
      },
      currentWindow: {
        backlogSize: 5
      }
    });

    expect(metrics.schemaValidOutputRate).toBe(0.9);
    expect(metrics.artifactSpamRate).toBe(0.8);
    expect(metrics.backlogGrowthVsBaseline).toBe(0);
  });
});
