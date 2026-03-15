import type { ExperienceNode } from "../types/domain.js";

export const transitionState = (node: ExperienceNode): ExperienceNode["state"] => {
  if (node.harmed_count >= 3 && node.helped_count === 0) {
    return "retired";
  }

  if (node.harmed_count > node.helped_count) {
    return "cooling";
  }

  if (node.support_count >= 2 || node.helped_count >= 1) {
    return "active";
  }

  return "active";
};
