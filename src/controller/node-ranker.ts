import type { ExperienceNode, ResolvedTaskType } from "../types/domain.js";
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

const LEGACY_GENERIC_HINT_PATTERNS = [
  /^reproduce first, then validate the fix with /i,
  /^do not keep iterating on the current debug path without narrowing the failing signature first\.?$/i
];

const isLegacyGenericNode = (node: ExperienceNode): boolean =>
  LEGACY_GENERIC_HINT_PATTERNS.some((pattern) => pattern.test(node.compact_hint.trim()));

const getSpecificityBonus = (node: ExperienceNode): number => {
  const hintTokens = new Set(tokenize(node.compact_hint));
  const triggerTokens = new Set(tokenize(node.trigger_pattern));
  const lexicalBreadth = Math.min(12, hintTokens.size + Math.min(triggerTokens.size, 6));
  const breadthScore = lexicalBreadth / 12;
  const structuredBonus =
    (node.recommended_steps?.length ?? 0) > 0 || (node.goal?.trim().length ?? 0) > 0 ? 1.2 : 0;

  return breadthScore * 1.8 + structuredBonus;
};

const getFeedbackAdjustment = (node: ExperienceNode): number =>
  Math.max(-1, Math.min(1, (node.helped_count - node.harmed_count) * 0.08));

const getGenericPenalty = (node: ExperienceNode): number => (isLegacyGenericNode(node) ? 4 : 0);

const getTaskTypePreference = (
  preferredTaskType: ResolvedTaskType | undefined,
  node: ExperienceNode
): number => {
  if (!preferredTaskType || preferredTaskType === "unknown" || preferredTaskType === "general") {
    return 0;
  }

  if (node.task_type === preferredTaskType) {
    return 1.5;
  }

  if (node.task_type === "general") {
    return -0.75;
  }

  return 0;
};

export const rankNodes = (
  summary: string,
  nodes: ExperienceNode[],
  preferredTaskType?: ResolvedTaskType
): ExperienceNode[] =>
  [...nodes].sort((a, b) => {
    const aScore =
      STATE_WEIGHT[a.state] * 10 +
      similarity(summary, a.trigger_pattern) * 3 +
      getSpecificityBonus(a) +
      getFeedbackAdjustment(a) +
      a.support_count * 0.1 -
      getGenericPenalty(a) +
      getTaskTypePreference(preferredTaskType, a);
    const bScore =
      STATE_WEIGHT[b.state] * 10 +
      similarity(summary, b.trigger_pattern) * 3 +
      getSpecificityBonus(b) +
      getFeedbackAdjustment(b) +
      b.support_count * 0.1 -
      getGenericPenalty(b) +
      getTaskTypePreference(preferredTaskType, b);

    return bScore - aScore;
  });
