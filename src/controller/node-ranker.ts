import type { ExperienceNode } from "../types/domain.js";
import { tokenize } from "../utils/text.js";

const STATE_WEIGHT: Record<ExperienceNode["state"], number> = {
  active: 3,
  cooling: 2,
  candidate: 1,
  retired: 0
};

const similarity = (left: string, right: string): number => {
  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right));
  if (!lhs.size || !rhs.size) {
    return 0;
  }

  const common = [...lhs].filter((token) => rhs.has(token)).length;
  return common / Math.max(lhs.size, rhs.size);
};

export const rankNodes = (summary: string, nodes: ExperienceNode[]): ExperienceNode[] =>
  [...nodes].sort((a, b) => {
    const aScore =
      STATE_WEIGHT[a.state] * 10 +
      similarity(summary, a.trigger_pattern) * 5 +
      (a.helped_count - a.harmed_count) +
      a.support_count * 0.25;
    const bScore =
      STATE_WEIGHT[b.state] * 10 +
      similarity(summary, b.trigger_pattern) * 5 +
      (b.helped_count - b.harmed_count) +
      b.support_count * 0.25;

    return bScore - aScore;
  });

