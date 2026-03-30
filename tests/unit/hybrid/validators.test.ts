import { describe, expect, it } from "vitest";
import {
  classifyHybridApproval,
  validateExplainDecisionOutput,
  validatePostmortemReviewOutput
} from "../../../src/hybrid/validators.js";

describe("validateExplainDecisionOutput", () => {
  it("accepts bounded explain_decision output as advisory", () => {
    const result = validateExplainDecisionOutput({
      task: "explain_decision",
      decision: "ExperienceEngine injected reusable guidance for this task.",
      reason: "The supplied evidence showed a mature validated candidate with low risk.",
      confidence: "high",
      evidence_summary: "Decision explanation and timeline evidence aligned."
    });

    expect(result).toMatchObject({
      status: "accepted",
      approvalClass: "advisory"
    });
  });

  it("rejects malformed explain_decision output", () => {
    const result = validateExplainDecisionOutput({
      task: "explain_decision",
      decision: "",
      reason: 123,
      confidence: "certain"
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "schema_invalid"
    });
  });
});

describe("validatePostmortemReviewOutput", () => {
  it("accepts bounded postmortem review notes as review artifacts", () => {
    const result = validatePostmortemReviewOutput({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "capture",
      feedback_followup_recommendation: "none",
      confidence: "high",
      reason: "The provider-path reversal is likely reusable for similar tasks.",
      review_artifact: {
        summary: "The run produced a reusable correction after the first path failed.",
        notes: ["The provider-path reversal is likely reusable for similar tasks."]
      }
    });

    expect(result).toMatchObject({
      status: "accepted",
      approvalClass: "review_artifact"
    });
  });

  it("classifies bounded follow-up recommendations as policy-gated", () => {
    const result = validatePostmortemReviewOutput({
      task: "postmortem_review",
      review_verdict: "policy_gated",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "mark_helped",
      confidence: "medium",
      reason: "The signal is promising but should stay non-authoritative.",
      review_artifact: {
        summary: "The run may justify a bounded follow-up.",
        notes: ["The signal is promising but should stay non-authoritative."]
      },
      candidateShapingSuggestions: ["Promote this as a verification-first correction pattern."]
    });

    expect(result).toMatchObject({
      status: "accepted",
      approvalClass: "policy_gated"
    });
  });

  it("rejects lifecycle-changing suggestions in phase 1", () => {
    const result = validatePostmortemReviewOutput({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "reject",
      feedback_followup_recommendation: "none",
      confidence: "high",
      reason: "The node appears harmful.",
      review_artifact: {
        summary: "The active node should be cooled immediately.",
        notes: ["The node appears harmful."]
      },
      lifecycleSuggestions: ["Retire node_123 immediately."]
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "approval_blocked"
    });
  });

  it("rejects write-back suggestions in phase 1", () => {
    const result = validatePostmortemReviewOutput({
      task: "postmortem_review",
      review_verdict: "review_artifact",
      candidate_recommendation: "capture",
      feedback_followup_recommendation: "none",
      confidence: "medium",
      reason: "The worker is proposing a write-back artifact.",
      review_artifact: {
        summary: "The system should write back a stronger hint.",
        notes: ["The worker is proposing a write-back artifact."]
      },
      writeBackSuggestions: ["Rewrite the active hint to mention provider routing."]
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "approval_blocked"
    });
  });
});

describe("classifyHybridApproval", () => {
  it("maps plain explain outputs to advisory", () => {
    expect(
      classifyHybridApproval({
        task: "explain_decision",
        decision: "Explain the decision",
        reason: "The evidence supports the original route.",
        confidence: "medium"
      })
    ).toBe("advisory");
  });

  it("maps governance suggestions to policy-gated instead of advisory", () => {
    expect(
      classifyHybridApproval({
        task: "postmortem_review",
        review_verdict: "policy_gated",
        candidate_recommendation: "observe",
        feedback_followup_recommendation: "review",
        confidence: "low",
        reason: "Keep this as a non-authoritative suggestion.",
        review_artifact: {
          summary: "The run may justify later governance review.",
          notes: ["Keep this as a non-authoritative suggestion."]
        },
        governanceRecommendations: ["Review whether this pattern should remain live."]
      })
    ).toBe("policy_gated");
  });
});
