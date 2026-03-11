import type { ExperienceInput, ScopeTaskStats } from "../types/domain.js";
import { tokenize } from "../utils/text.js";

const overlapScore = (left: string, right?: string): number => {
  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right ?? ""));
  if (!lhs.size || !rhs.size) {
    return 0;
  }

  const overlap = [...lhs].filter((token) => rhs.has(token)).length;
  return overlap / Math.max(lhs.size, rhs.size);
};

export const evaluateTrigger = (
  input: ExperienceInput,
  stats?: ScopeTaskStats,
  knownRiskSummary?: string,
  threshold = 0.6
): boolean => {
  if (input.task_type === "unknown") {
    return false;
  }

  const failureRate =
    stats && stats.total_tasks > 0 ? stats.failed_tasks / stats.total_tasks : 0;
  const contextRisk = overlapScore(input.task_summary, knownRiskSummary ?? input.context_summary);
  const explicitFailure = input.tool_events.some((event) => event.status === "failure");

  return explicitFailure || failureRate >= threshold || contextRisk >= threshold;
};

