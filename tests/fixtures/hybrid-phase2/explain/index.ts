import type { ExplainDecisionCapsule } from "../../../../src/hybrid/types.js";

export const phase2ExplainFixtures: Array<{
  name: string;
  capsule: ExplainDecisionCapsule;
  responseJson: string;
  expectedDecisionFragment: string;
  expectedReasonFragment: string;
  protectedCore?: boolean;
}> = [
  {
    name: "provider explain stays faithful to bounded evidence",
    capsule: {
      task: "explain_decision",
      schemaVersion: "hybrid-capsule-v1",
      trusted: {
        route: {
          route: "ESCALATE_SYNC_EXPLAIN",
          reasonCode: "explicit_explanation_request",
          policyVersion: "hybrid-phase1-v1"
        },
        inspection: {
          scopeId: "scope_repo",
          taskType: "test_debug",
          intervention: "inject",
          deliveryMode: "live",
          autoFeedback: "none",
          outcome: "success"
        },
        scorecard: {
          mode: "inject",
          decisionReason: "mature_validated_candidate",
          riskLevel: "low",
          fastPathApplied: true,
          queryRewriteApplied: true
        }
      },
      evidence: [
        {
          source: "task_summary",
          text: "Fix the failing auth test by changing the provider config path.",
          trust: "untrusted_evidence",
          truncated: false
        },
        {
          source: "retrieval_note",
          text: "The best candidate was already validated by successful reuse.",
          trust: "untrusted_evidence",
          truncated: false
        }
      ]
    },
    responseJson: JSON.stringify({
      decision: "ExperienceEngine injected reusable guidance for this task.",
      reason:
        "The best candidate was already validated and strong enough to clear the fast path for this repo-scoped task.",
      confidence: "high",
      evidence_summary: "task summary, retrieval note"
    }),
    expectedDecisionFragment: "injected reusable guidance",
    expectedReasonFragment: "validated and strong enough",
    protectedCore: true
  }
];
