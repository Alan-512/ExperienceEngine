import { describe, expect, it } from "vitest";
import { phase3PostmortemFixtures } from "../../fixtures/hybrid-phase3/postmortem/index.js";
import { runPostmortemReviewLlmWorker } from "../../../src/hybrid/workers/postmortem-review-llm.js";

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

describe("runPostmortemReviewLlmWorker", () => {
  it("returns bounded postmortem content without top-level disposition variants", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
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

    expect(result).toMatchObject({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "capture",
      feedback_followup_recommendation: "none",
      confidence: "high"
    });
    expect((result as Record<string, unknown>).postmortem_disposition).toBeUndefined();
  });

  it("rejects malformed structured output", async () => {
    const fixture = phase3PostmortemFixtures[0];
    await expect(
      runPostmortemReviewLlmWorker(fixture.capsule, {
        endpoint: openAiEndpoint,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      review_verdict: "review_artifact",
                      candidate_recommendation: "capture"
                    })
                  }
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      })
    ).rejects.toThrow(/Required|non-empty string/i);
  });

  it("normalizes real provider enum drift and string artifacts into the phase 3 contract", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation: "PROCEED_TO_VALIDATION",
                    feedback_followup_recommendation: "INTEGRATE_PHASE3_VALIDATION",
                    confidence: "HIGH",
                    reason: "Bounded postmortem signal is good enough to keep for later validation.",
                    review_artifact: "Bounded postmortem signal worth retaining for later validation."
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result).toMatchObject({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "capture",
      feedback_followup_recommendation: "review",
      confidence: "high",
      review_artifact: {
        summary: "Bounded postmortem signal worth retaining for later validation.",
        notes: ["Bounded postmortem signal worth retaining for later validation."]
      }
    });
  });

  it("normalizes maintenance-style retention recommendations into observe", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation: "MAINTAIN",
                    feedback_followup_recommendation: "NONE",
                    confidence: "HIGH",
                    reason: "The run is worth retaining as a bounded diagnostic artifact without promotion.",
                    review_artifact: "taskrun_9cd9614bded0_diagnostic_summary",
                    suggestedFollowUps: [
                      "Review the captured diagnostic table for specific plugin version mismatches."
                    ],
                    candidateShapingSuggestions: [
                      "Standardize the diagnostic output format to improve readability in postmortem reports."
                    ],
                    governanceRecommendations: [
                      "Maintain read-only constraints for all diagnostic-only task runs."
                    ]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result).toMatchObject({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "none",
      confidence: "high",
      review_artifact: {
        summary: "taskrun_9cd9614bded0_diagnostic_summary",
        notes: ["taskrun_9cd9614bded0_diagnostic_summary"]
      }
    });
  });

  it("normalizes maintain_current_state style recommendations into observe", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation: "MAINTAIN_CURRENT_STATE",
                    feedback_followup_recommendation: "NONE",
                    confidence: "HIGH",
                    reason: "The run should be preserved as a bounded diagnostic artifact without promotion.",
                    review_artifact: "taskrun_93ed01f22959_diagnostic_summary"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result).toMatchObject({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "none",
      confidence: "high",
      review_artifact: {
        summary: "taskrun_93ed01f22959_diagnostic_summary",
        notes: ["taskrun_93ed01f22959_diagnostic_summary"]
      }
    });
  });

  it("normalizes freeform recommendation sentences into bounded enums", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation:
                      "Proceed with current diagnostic findings; no further automated intervention required.",
                    feedback_followup_recommendation:
                      "Ensure the identified stale plugin state is documented in the repository's known issues tracker.",
                    confidence: "HIGH",
                    reason: "The run is useful as a retained diagnostic artifact with governance follow-up only.",
                    review_artifact: "taskrun_09a93_postmortem_summary"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result).toMatchObject({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "review",
      confidence: "high",
      review_artifact: {
        summary: "taskrun_09a93_postmortem_summary",
        notes: ["taskrun_09a93_postmortem_summary"]
      }
    });
  });

  it("normalizes REQUIRED followup recommendations into review", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation: "MAINTAIN_CURRENT_STATE",
                    feedback_followup_recommendation: "REQUIRED",
                    confidence: "HIGH",
                    reason: "A retained diagnostic artifact is useful and requires governance followup.",
                    review_artifact: "taskrun_required_followup_summary"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result).toMatchObject({
      task: "postmortem_review",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "review",
      confidence: "high"
    });
  });

  it("normalizes maintain_current_trajectory recommendations into observe", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation: "MAINTAIN_CURRENT_TRAJECTORY",
                    feedback_followup_recommendation: "NONE",
                    confidence: "HIGH",
                    reason: "The current diagnostic trajectory should be retained as-is.",
                    review_artifact: "taskrun_trajectory_summary"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result).toMatchObject({
      task: "postmortem_review",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "none",
      confidence: "high"
    });
  });

  it("normalizes proceed-with-findings and validate followup sentences into bounded enums", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const result = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation:
                      "Proceed with current diagnostic findings; no immediate code mutation required.",
                    feedback_followup_recommendation:
                      "Validate plugin manifest versioning against the detected OpenClaw stale state.",
                    confidence: "HIGH",
                    reason: "The run should be retained as a bounded diagnostic artifact without immediate mutation.",
                    review_artifact: "taskrun_validate_manifest_summary"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result).toMatchObject({
      task: "postmortem_review",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "review",
      confidence: "high"
    });
  });
});
