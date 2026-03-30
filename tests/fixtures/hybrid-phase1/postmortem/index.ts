import type { PostmortemReviewCapsule } from "../../../../src/hybrid/types.js";

export type PostmortemFixture = {
  id: string;
  protectedCore?: boolean;
  expectedRecommendation: "capture" | "reject" | "observe";
  capsule: PostmortemReviewCapsule;
};

const baseCapsule = (): PostmortemReviewCapsule => ({
  task: "postmortem_review",
  schemaVersion: "hybrid-capsule-v1",
  trusted: {
    route: {
      route: "ESCALATE_ASYNC_POSTMORTEM",
      reasonCode: "eligible_async_postmortem_review",
      policyVersion: "hybrid-phase1-v1"
    },
    run: {
      taskRunId: "taskrun-postmortem",
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
      text: "Fix the auth test by moving the config into the provider path.",
      trust: "untrusted_evidence",
      truncated: false
    },
    {
      source: "tool_event",
      text: "vitest: success: The focused auth test passed after the provider-path change.",
      trust: "untrusted_evidence",
      truncated: false
    }
  ]
});

export const postmortemFixtures: PostmortemFixture[] = [
  {
    id: "capture_directional_correction_core",
    protectedCore: true,
    expectedRecommendation: "capture",
    capsule: baseCapsule()
  },
  {
    id: "capture_injected_interaction_core",
    protectedCore: true,
    expectedRecommendation: "capture",
    capsule: {
      ...baseCapsule(),
      trusted: {
        ...baseCapsule().trusted,
        reviewTriggers: {
          ...baseCapsule().trusted.reviewTriggers,
          directionalCorrectionPresent: false,
          retryOrInvalidationSignaturePresent: false,
          injectedNodeInteractionPresent: true
        }
      }
    }
  },
  {
    id: "observe_without_strong_triggers",
    expectedRecommendation: "observe",
    capsule: {
      ...baseCapsule(),
      trusted: {
        ...baseCapsule().trusted,
        reviewTriggers: {
          directionalCorrectionPresent: false,
          injectedNodeInteractionPresent: false,
          retryOrInvalidationSignaturePresent: false,
          meaningfulFailureSignaturePresent: false,
          conservativeTransitionReviewWorthy: false
        }
      }
    }
  },
  {
    id: "reject_meaningful_failed_run",
    expectedRecommendation: "reject",
    capsule: {
      ...baseCapsule(),
      trusted: {
        ...baseCapsule().trusted,
        run: {
          ...baseCapsule().trusted.run,
          finalStatus: "failure",
          learningStatus: "rejected",
          outcomeSignal: "failure"
        },
        reviewTriggers: {
          directionalCorrectionPresent: false,
          injectedNodeInteractionPresent: false,
          retryOrInvalidationSignaturePresent: true,
          meaningfulFailureSignaturePresent: true,
          conservativeTransitionReviewWorthy: false
        }
      }
    }
  }
];
