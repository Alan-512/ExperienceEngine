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
});
