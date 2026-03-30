import { describe, expect, it } from "vitest";
import { buildExplainDecisionCapsule } from "../../../src/hybrid/capsule-builder.js";
import { runExplainDecisionWorker } from "../../../src/hybrid/workers/explain-decision.js";

describe("runExplainDecisionWorker", () => {
  it("returns a bounded explanation from the supplied capsule only", async () => {
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
        timeline: [
          {
            kind: "decision",
            createdAt: "2026-03-30T00:00:00.000Z",
            summary: "inject: Delivered 1 node for the task."
          }
        ],
        learningStatus: "captured",
        learningReason: "captured after successful reuse",
        summary: "Fix the failing auth test",
        createdAt: "2026-03-30T00:00:00.000Z"
      }
    });

    const output = await runExplainDecisionWorker(capsule);

    expect(output.task).toBe("explain_decision");
    expect(output.decision).toContain("ExperienceEngine");
    expect(output.reason).toContain("validated");
    expect(output.confidence).toBe("high");
    expect(output.evidence_summary?.length ?? 0).toBeGreaterThan(0);
  });
});
