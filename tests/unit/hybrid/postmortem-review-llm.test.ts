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

  it("normalizes rejected-style review verdicts into the bounded phase 3 contract", async () => {
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
                    review_verdict: "REJECTED",
                    candidate_recommendation: "REJECT",
                    feedback_followup_recommendation: "NONE",
                    confidence: "HIGH",
                    reason: "The bounded artifact should be retained only as a rejected review outcome.",
                    review_artifact: "taskrun_rejected_review_summary"
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
      candidate_recommendation: "reject",
      feedback_followup_recommendation: "none",
      confidence: "high",
      review_artifact: {
        summary: "taskrun_rejected_review_summary",
        notes: ["taskrun_rejected_review_summary"]
      }
    });
  });

  it("normalizes terminate-task and task-scope followup drift into bounded enums", async () => {
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
                    review_verdict: "REJECTED",
                    candidate_recommendation: "TERMINATE_TASK_RUN",
                    feedback_followup_recommendation: "INSTRUCT_USER_ON_TASK_SCOPE",
                    confidence: "HIGH",
                    reason: "The run should be rejected as a trivial task and redirected into clearer scope guidance.",
                    review_artifact: "taskrun_terminate_scope_summary"
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
      candidate_recommendation: "reject",
      feedback_followup_recommendation: "review",
      confidence: "high",
      review_artifact: {
        summary: "taskrun_terminate_scope_summary",
        notes: ["taskrun_terminate_scope_summary"]
      }
    });
  });

  it("normalizes single-string shaping and governance fields into arrays", async () => {
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
                    review_verdict: "REJECTED",
                    candidate_recommendation: "DISCARD",
                    feedback_followup_recommendation: "NONE",
                    confidence: "HIGH",
                    reason:
                      "The task summary contains trivial instructions and should not be retained as a substantive technical artifact.",
                    review_artifact: "taskrun_fbace93c435a_null_artifact",
                    suggestedFollowUps: [],
                    candidateShapingSuggestions:
                      "Ensure task inputs contain substantive postmortem documentation rather than conversational filler.",
                    governanceRecommendations: "Flag task for low-quality input filtering."
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
      candidate_recommendation: "reject",
      feedback_followup_recommendation: "none",
      confidence: "high",
      candidateShapingSuggestions: [
        "Ensure task inputs contain substantive postmortem documentation rather than conversational filler."
      ],
      governanceRecommendations: ["Flag task for low-quality input filtering."]
    });
  });

  it("normalizes staging and monitor-throughput drift into bounded enums", async () => {
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
                    candidate_recommendation: "PROCEED_WITH_VALIDATION",
                    feedback_followup_recommendation: "MONITOR_LATENCY_AND_THROUGHPUT",
                    confidence: "HIGH",
                    reason: "The bounded diagnostic result should be retained for later validation and operational review.",
                    review_artifact: "taskrun_stage_validation_summary"
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
        summary: "taskrun_stage_validation_summary",
        notes: ["taskrun_stage_validation_summary"]
      }
    });
  });

  it("normalizes stabilization and free-text followup drift into bounded enums", async () => {
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
                    candidate_recommendation: "MAINTAIN_STABILIZATION",
                    feedback_followup_recommendation: "DEFER_FRESH_PROBING",
                    confidence: "HIGH",
                    reason: "Hold the current stabilization posture until fresher samples are available.",
                    review_artifact: "taskrun_stabilization_summary"
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
        summary: "taskrun_stabilization_summary",
        notes: ["taskrun_stabilization_summary"]
      }
    });
  });

  it("normalizes none and terminate-replay candidate drift into bounded enums", async () => {
    const fixture = phase3PostmortemFixtures[0];
    const first = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "APPROVED",
                    candidate_recommendation: "NONE",
                    feedback_followup_recommendation: "NONE",
                    confidence: "HIGH",
                    reason: "No additional candidate promotion should occur for this bounded probe artifact.",
                    review_artifact: "taskrun_none_summary"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(first).toMatchObject({
      task: "postmortem_review",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "none",
      confidence: "high"
    });

    const second = await runPostmortemReviewLlmWorker(fixture.capsule, {
      endpoint: openAiEndpoint,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review_verdict: "REJECTED",
                    candidate_recommendation: "TERMINATE_REPLAY",
                    feedback_followup_recommendation: "NONE",
                    confidence: "HIGH",
                    reason: "The replay should be terminated as a trivial non-learning artifact.",
                    review_artifact: "taskrun_terminate_replay_summary"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(second).toMatchObject({
      task: "postmortem_review",
      candidate_recommendation: "reject",
      feedback_followup_recommendation: "none",
      confidence: "high"
    });
  });

  it("normalizes inconclusive verdicts and retry-investigate followup drift conservatively", async () => {
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
                    review_verdict: "INCONCLUSIVE",
                    candidate_recommendation: "RETRY_WITH_DIAGNOSTIC_TRACE",
                    feedback_followup_recommendation: "INVESTIGATE_PLUGIN_REGISTRY_INITIALIZATION",
                    confidence: "HIGH",
                    reason: "The current bounded evidence is inconclusive and should be reviewed before any stronger action.",
                    review_artifact: "taskrun_inconclusive_summary"
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
      review_verdict: "policy_gated",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "review",
      confidence: "high"
    });
  });
});
