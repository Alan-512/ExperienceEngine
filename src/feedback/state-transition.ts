import type { ExperienceNode } from "../types/domain.js";
import type { NodeOriginProfile } from "../experience-management/task-management-signals.js";

type TransitionContext = {
  originProfile?: NodeOriginProfile;
};

export const transitionState = (node: ExperienceNode, context: TransitionContext = {}): ExperienceNode["state"] => {
  const strictPromotion = context.originProfile?.strictPromotion ?? false;
  const activationHelpedThreshold = strictPromotion ? 2 : 1;
  const activationSupportThreshold = strictPromotion ? 3 : 2;

  if (node.harmed_count >= 3 && node.helped_count === 0) {
    return "retired";
  }

  if (node.state === "priority_candidate") {
    if (node.helped_count >= activationHelpedThreshold || node.support_count >= activationSupportThreshold) {
      return "active";
    }
    if (node.harmed_count > 0) {
      return "candidate";
    }
    return "priority_candidate";
  }

  if (node.harmed_count > node.helped_count) {
    return "cooling";
  }

  if (node.state === "candidate") {
    if (node.support_count >= activationSupportThreshold || node.helped_count >= activationHelpedThreshold) {
      return "active";
    }
    return "candidate";
  }

  return "active";
};

export const transitionValidationState = (
  node: ExperienceNode,
  feedback: "helped" | "harmed"
): ExperienceNode["validation_state"] => {
  if (node.experience_kind !== "expectation_correction") {
    return node.validation_state;
  }

  if (feedback === "helped") {
    return "validated_by_reuse";
  }

  if (node.validation_state === "pending_reuse_validation") {
    return "invalidated";
  }

  if (node.validation_state === "validated_by_reuse") {
    const nextHelped = node.helped_count;
    const nextHarmed = node.harmed_count + 1;
    return nextHarmed >= nextHelped ? "invalidated" : "validated_by_reuse";
  }

  return "invalidated";
};
