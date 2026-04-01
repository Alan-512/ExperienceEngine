import type { PostmortemReviewCapsule } from "../../../../src/hybrid/types.js";

const baseCapsule: PostmortemReviewCapsule = {
  task: "postmortem_review",
  schemaVersion: "hybrid-capsule-v1",
  trusted: {
    route: {
      route: "ESCALATE_ASYNC_POSTMORTEM",
      reasonCode: "eligible_async_postmortem_review",
      policyVersion: "hybrid-phase1-v1"
    },
    run: {
      taskRunId: "taskrun_phase3_base",
      scopeId: "scope_repo",
      taskType: "test_debug",
      finalStatus: "success",
      learningStatus: "captured",
      outcomeSignal: "success"
    },
    reviewTriggers: {
      directionalCorrectionPresent: true,
      injectedNodeInteractionPresent: false,
      retryOrInvalidationSignaturePresent: true,
      meaningfulFailureSignaturePresent: false,
      conservativeTransitionReviewWorthy: false
    }
  },
  evidence: [
    {
      source: "task_summary",
      text: "Move the failing auth fix from the UI path into provider routing.",
      trust: "untrusted_evidence",
      truncated: false
    },
    {
      source: "tool_event",
      text: "Focused auth test passed after the provider-path correction.",
      trust: "untrusted_evidence",
      truncated: false
    }
  ]
};

export const phase3PostmortemFixtures: Array<{
  name: string;
  capsule: PostmortemReviewCapsule;
  responseJson: string;
  expectedDisposition: "review_artifact" | "policy_gated" | "blocked";
  expectedRecommendation: "capture" | "reject" | "observe";
  quality: "good" | "partial" | "poor";
}> = [
  {
    name: "good bounded postmortem artifact",
    capsule: baseCapsule,
    responseJson: JSON.stringify({
      review_verdict: "review_artifact",
      candidate_recommendation: "capture",
      feedback_followup_recommendation: "none",
      confidence: "high",
      reason: "The run corrected direction after concrete invalidation and produced reusable success evidence.",
      review_artifact: {
        summary: "Reusable provider-path correction after bounded invalidation evidence.",
        notes: [
          "The UI-layer attempt was invalidated by focused test evidence.",
          "A provider-path correction later converged and stayed bounded."
        ]
      }
    }),
    expectedDisposition: "review_artifact",
    expectedRecommendation: "capture",
    quality: "good"
  },
  {
    name: "policy gated artifact with follow-up recommendation",
    capsule: {
      ...baseCapsule,
      trusted: {
        ...baseCapsule.trusted,
        run: {
          ...baseCapsule.trusted.run,
          taskRunId: "taskrun_phase3_policy"
        }
      }
    },
    responseJson: JSON.stringify({
      review_verdict: "policy_gated",
      candidate_recommendation: "observe",
      feedback_followup_recommendation: "review",
      confidence: "medium",
      reason: "The run is bounded, but the recommendation should remain under later governance review.",
      review_artifact: {
        summary: "Bounded review worth later governance review.",
        notes: ["Keep the artifact, but require a later operator review."]
      },
      governanceRecommendations: ["Review whether the bounded signal should shape future capture policy."]
    }),
    expectedDisposition: "policy_gated",
    expectedRecommendation: "observe",
    quality: "partial"
  },
  {
    name: "blocked overreach",
    capsule: {
      ...baseCapsule,
      trusted: {
        ...baseCapsule.trusted,
        run: {
          ...baseCapsule.trusted.run,
          taskRunId: "taskrun_phase3_blocked"
        }
      }
    },
    responseJson: JSON.stringify({
      review_verdict: "review_artifact",
      candidate_recommendation: "reject",
      feedback_followup_recommendation: "none",
      confidence: "high",
      reason: "The artifact suggests directly retiring the old path.",
      review_artifact: {
        summary: "Direct lifecycle overreach.",
        notes: ["This should not be persisted as a phase 3 artifact."]
      },
      lifecycleSuggestions: ["Retire the prior node immediately."]
    }),
    expectedDisposition: "blocked",
    expectedRecommendation: "reject",
    quality: "poor"
  }
];
