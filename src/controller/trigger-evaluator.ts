import type { ExperienceInput, ExperienceState, ScopeTaskStats, ValidationState } from "../types/domain.js";
import { tokenize } from "../utils/text.js";

export type TriggerCandidateQuality = {
  semanticScore: number;
  totalScore: number;
  familyScore: number;
  scopeMatch: boolean;
  taskFamilyMatch: boolean;
  state: ExperienceState;
  helpedCount: number;
  harmedCount: number;
  validationState?: ValidationState;
  scoreMargin: number;
};

export type TriggerEvaluationContext = {
  knownRiskSummary?: string;
  candidateQuality?: TriggerCandidateQuality;
};

const overlapScore = (left: string, right?: string): number => {
  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right ?? ""));
  if (!lhs.size || !rhs.size) {
    return 0;
  }

  const overlap = [...lhs].filter((token) => rhs.has(token)).length;
  const jaccardLike = overlap / Math.max(lhs.size, rhs.size);
  const inputCoverage = overlap / lhs.size;
  return Math.max(jaccardLike, inputCoverage);
};

export const evaluateTrigger = (
  input: ExperienceInput,
  stats?: ScopeTaskStats,
  knownRiskSummaryOrContext?: string | TriggerEvaluationContext,
  threshold = 0.6
): boolean => {
  if (input.task_type === "unknown") {
    return false;
  }

  const failureRate =
    stats && stats.total_tasks > 0 ? stats.failed_tasks / stats.total_tasks : 0;
  const evaluationContext =
    typeof knownRiskSummaryOrContext === "string"
      ? { knownRiskSummary: knownRiskSummaryOrContext }
      : knownRiskSummaryOrContext;
  const knownRiskSummary = evaluationContext?.knownRiskSummary;
  const candidateQuality = evaluationContext?.candidateQuality;
  const knownPattern = knownRiskSummary ?? input.context_summary;
  const taskRisk = overlapScore(input.task_summary, knownPattern);
  const contextRisk = overlapScore(input.context_summary ?? "", knownPattern);
  const combinedRisk = overlapScore(
    [input.task_summary, input.context_summary].filter(Boolean).join("\n") || input.task_summary,
    knownPattern
  );
  const triggerRisk = Math.max(taskRisk, contextRisk, combinedRisk);
  const candidateRiskThreshold = knownRiskSummary ? Math.min(threshold, 0.5) : threshold;
  const explicitFailure = input.tool_events.some((event) => event.status === "failure");
  const strongCandidate =
    candidateQuality &&
    candidateQuality.scopeMatch &&
    candidateQuality.taskFamilyMatch &&
    candidateQuality.state === "active" &&
    candidateQuality.totalScore >= 0.75 &&
    candidateQuality.scoreMargin >= 0.08 &&
    (candidateQuality.helpedCount > candidateQuality.harmedCount || candidateQuality.validationState === "validated_by_reuse") &&
    (candidateQuality.helpedCount >= 2 || candidateQuality.validationState === "validated_by_reuse");

  return explicitFailure || failureRate >= threshold || Boolean(strongCandidate) || triggerRisk >= candidateRiskThreshold;
};
