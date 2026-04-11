import type { PostmortemReviewCapsule, PostmortemReviewWorkerOutput } from "../types.js";

const summarizeSignals = (capsule: PostmortemReviewCapsule): string[] => {
  const signals: string[] = [];
  if (capsule.trusted.reviewTriggers.directionalCorrectionPresent) {
    signals.push("the run included a directional correction");
  }
  if (capsule.trusted.reviewTriggers.retryOrInvalidationSignaturePresent) {
    signals.push("the run showed invalidation or retry evidence");
  }
  if (capsule.trusted.reviewTriggers.injectedNodeInteractionPresent) {
    signals.push("the run interacted with injected guidance");
  }
  if (capsule.trusted.reviewTriggers.meaningfulFailureSignaturePresent) {
    signals.push("the run recorded a meaningful failure signature");
  }
  if (capsule.trusted.reviewTriggers.conservativeTransitionReviewWorthy) {
    signals.push("the run looked review-worthy after a conservative transition");
  }
  return signals;
};

export const runPostmortemReviewWorker = async (
  capsule: PostmortemReviewCapsule
): Promise<PostmortemReviewWorkerOutput> => {
  const signals = summarizeSignals(capsule);
  const injectedNodeReviews: NonNullable<PostmortemReviewWorkerOutput["injected_node_reviews"]> = (
    capsule.trusted.injectedNodes ?? []
  ).map((node) => {
    const harmfulFailure =
      capsule.trusted.run.outcomeSignal === "failure"
      && capsule.trusted.reviewTriggers.injectedNodeInteractionPresent
      && capsule.trusted.reviewTriggers.meaningfulFailureSignaturePresent;

    return {
      node_id: node.nodeId,
      feedback_verdict: harmfulFailure ? "harmed" : "uncertain",
      confidence: harmfulFailure ? "medium" as const : "low" as const,
      delivery_recommendation:
        harmfulFailure
          ? (node.state === "priority_candidate" || node.harmedCount > 0 ? "quarantine" : "conservative_only")
          : "keep",
      reason: harmfulFailure
        ? "Bounded failure evidence suggests the injected node contributed to the unsuccessful path."
        : "The completed run does not provide bounded causal evidence strong enough to mark the injected node as helped.",
      evidence_summary: signals.length > 0 ? `Review signal: ${signals.join(", ")}.` : undefined
    };
  });
  const candidateRecommendation: PostmortemReviewWorkerOutput["candidate_recommendation"] =
    capsule.trusted.run.outcomeSignal === "failure" && capsule.trusted.reviewTriggers.meaningfulFailureSignaturePresent
      ? "reject"
      : capsule.trusted.run.outcomeSignal === "success" && signals.length > 0
        ? "capture"
        : "observe";
  const summary =
    candidateRecommendation === "capture"
      ? "The completed run produced a bounded, potentially reusable review signal."
      : candidateRecommendation === "reject"
        ? "The completed run produced bounded evidence against the attempted path."
        : "The completed run is worth observing, but the review should remain strictly non-authoritative.";
  const reason =
    signals.length > 0
      ? `Review signal: ${signals.join(", ")}.`
      : "Review signal: no strong bounded trigger was detected beyond the completed run itself.";

  return {
    task: "postmortem_review",
    review_verdict: injectedNodeReviews.length > 0 ? "policy_gated" : "review_artifact",
    candidate_recommendation: candidateRecommendation,
    feedback_followup_recommendation: "none",
    confidence:
      candidateRecommendation === "capture" ? "high" : candidateRecommendation === "reject" ? "medium" : "low",
    reason,
    injected_node_reviews: injectedNodeReviews.length > 0 ? injectedNodeReviews : undefined,
    review_artifact: {
      summary,
      notes: [reason, "Keep the result as a non-authoritative postmortem artifact in phase 1."]
    }
  };
};
