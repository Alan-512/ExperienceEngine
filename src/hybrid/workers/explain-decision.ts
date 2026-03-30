import type { ExplainDecisionCapsule, ExplainDecisionWorkerOutput } from "../types.js";

const explainDecisionSummary = (capsule: ExplainDecisionCapsule): string => {
  const intervention = capsule.trusted.inspection.intervention;
  if (intervention === "inject") {
    return "ExperienceEngine injected reusable guidance for this task.";
  }
  if (intervention === "shadow" || intervention === "holdout") {
    return "ExperienceEngine found reusable guidance but did not deliver it live.";
  }
  return "ExperienceEngine did not deliver guidance for this turn.";
};

const explainDecisionReason = (capsule: ExplainDecisionCapsule): string => {
  const scorecard = capsule.trusted.scorecard;
  if (capsule.trusted.inspection.intervention === "shadow") {
    return "The match was usable, but this run stayed in a non-live delivery mode.";
  }
  if (capsule.trusted.inspection.intervention === "holdout") {
    return "The match was usable, but delivery was withheld for evaluation.";
  }
  if (scorecard?.decisionReason === "mature_validated_candidate") {
    return "The best candidate was already validated and strong enough to clear the fast path.";
  }
  if (scorecard?.mode === "inject_conservative") {
    return "The best candidate looked promising, but ExperienceEngine kept delivery cautious until it has stronger runtime proof.";
  }

  return "The supplied route and evidence point to the current bounded ExperienceEngine decision.";
};

export const runExplainDecisionWorker = async (
  capsule: ExplainDecisionCapsule
): Promise<ExplainDecisionWorkerOutput> => ({
  task: "explain_decision",
  decision: explainDecisionSummary(capsule),
  reason: explainDecisionReason(capsule),
  confidence:
    capsule.trusted.inspection.intervention === "inject"
      ? "high"
      : capsule.trusted.inspection.intervention === "skip"
        ? "medium"
        : "low",
  evidence_summary:
    [...new Set(capsule.evidence.map((entry) => entry.source.replaceAll("_", " ")))]
      .slice(0, 3)
      .join(", ") || undefined
});
