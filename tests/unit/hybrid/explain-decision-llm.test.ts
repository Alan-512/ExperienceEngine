import { describe, expect, it } from "vitest";
import { buildExplainDecisionCapsule } from "../../../src/hybrid/capsule-builder.js";
import { runExplainDecisionLlmWorker } from "../../../src/hybrid/workers/explain-decision-llm.js";

describe("runExplainDecisionLlmWorker", () => {
  it("returns a validated bounded explanation from a provider-backed response", async () => {
    const capsule = buildExplainDecisionCapsule({
      schemaVersion: "hybrid-capsule-v1",
      routeDecision: {
        route: "ESCALATE_SYNC_EXPLAIN",
        reasonCode: "explicit_explanation_request",
        policyVersion: "hybrid-phase1-v1"
      },
      inspection: {
        scopeId: "scope_repo",
        taskType: "test_debug",
        intervention: "inject",
        deliveryMode: "live",
        delivered: true,
        autoFeedback: "none",
        outcome: "success",
        injectedNodes: [],
        hints: ["Run the failing auth test before editing."],
        evidence: ["vitest: success: targeted auth test now passes"],
        scorecard: {
          scopeId: "scope_repo",
          taskType: "test_debug",
          taskSummary: "Fix the failing auth test",
          mode: "inject",
          riskLevel: "low",
          recommendation: "Inject the strongest validated auth-test recovery hint.",
          reasons: ["The best candidate is validated by reuse."],
          decisionReason: "mature_validated_candidate",
          nodes: [],
          createdAt: "2026-03-30T00:00:00.000Z"
        },
        decisionExplanation: "ExperienceEngine injected the best available reusable guidance for this task.",
        trustSummary: "low-risk active guidance with 2 helped and 0 harmed signals.",
        retrievalNotes: ["Query rewrite preserved retrieval intent."],
        timeline: [],
        learningStatus: "captured",
        learningReason: "captured after successful reuse",
        summary: "Fix the failing auth test",
        createdAt: "2026-03-30T00:00:00.000Z"
      }
    });

    const output = await runExplainDecisionLlmWorker(capsule, {
      endpoint: {
        kind: "openai",
        provider: "openai_compatible",
        model: "gpt-5.4-mini",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        headers: {
          Authorization: "Bearer test-key"
        },
        source: "explicit"
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: "ExperienceEngine injected reusable guidance for this task.",
                    reason: "The candidate was already validated and cleared the fast path.",
                    confidence: "high",
                    evidence_summary: "task summary, retrieval note"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(output).toEqual({
      task: "explain_decision",
      decision: "ExperienceEngine injected reusable guidance for this task.",
      reason: "The candidate was already validated and cleared the fast path.",
      confidence: "high",
      evidence_summary: "task summary, retrieval note"
    });
  });
});
