import type { ExperienceNode } from "../types/domain.js";

export const transitionState = (node: ExperienceNode): ExperienceNode["state"] => {
  if (node.harmed_count >= 3 && node.helped_count === 0) {
    return "retired";
  }

  if (node.harmed_count > node.helped_count) {
    return "cooling";
  }

  if (node.state === "candidate") {
    if (node.support_count >= 2 || node.helped_count >= 1) {
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
