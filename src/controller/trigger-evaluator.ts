import type { ExperienceInput, ExperienceState, ScopeTaskStats, ValidationState } from "../types/domain.js";
import { tokenize } from "../utils/text.js";

export type TriggerCandidateQuality = {
  semanticScore: number;
  retrievalScore?: number;
  policyAdjustment?: number;
  retrievalReasons?: string[];
  policyReasons?: string[];
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

export type TriggerRouteDecision = {
  decision: "allow" | "inject_conservative" | "skip";
  reason: string;
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

export const evaluateTriggerRoute = (
  input: ExperienceInput,
  stats?: ScopeTaskStats,
  knownRiskSummaryOrContext?: string | TriggerEvaluationContext,
  threshold = 0.6
): TriggerRouteDecision => {
  if (input.task_type === "unknown") {
    return { decision: "skip", reason: "unknown_task_type" };
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
  const hasPolicySupport =
    candidateQuality &&
    (
      (candidateQuality.policyAdjustment ?? 0) >= 0.12 ||
      candidateQuality.validationState === "validated_by_reuse" ||
      (candidateQuality.policyReasons?.some((reason) => !reason.endsWith(":0.0000")) ?? false)
    );
  const ambiguousSameFamilyCandidate =
    candidateQuality &&
    candidateQuality.scopeMatch &&
    candidateQuality.taskFamilyMatch &&
    candidateQuality.familyScore >= 0.85 &&
    candidateQuality.totalScore >= 0.6 &&
    candidateQuality.scoreMargin < 0.07 &&
    candidateQuality.helpedCount >= candidateQuality.harmedCount &&
    (
      candidateQuality.helpedCount >= 1 ||
      candidateQuality.validationState === "validated_by_reuse" ||
      candidateQuality.state === "candidate" ||
      candidateQuality.state === "priority_candidate"
    ) &&
    hasPolicySupport;
  const promisingCandidate =
    candidateQuality &&
    candidateQuality.scopeMatch &&
    candidateQuality.taskFamilyMatch &&
    candidateQuality.state === "active" &&
    candidateQuality.totalScore >= 0.8 &&
    candidateQuality.helpedCount >= candidateQuality.harmedCount &&
    (
      candidateQuality.helpedCount >= 1 ||
      candidateQuality.validationState === "validated_by_reuse"
    ) &&
    hasPolicySupport;

  if (explicitFailure) {
    return { decision: "allow", reason: "explicit_failure_signal" };
  }

  if (failureRate >= threshold) {
    return { decision: "allow", reason: "scope_failure_rate_high" };
  }

  if (strongCandidate) {
    return { decision: "allow", reason: "strong_candidate_quality" };
  }

  if (ambiguousSameFamilyCandidate) {
    return { decision: "inject_conservative", reason: "ambiguous_same_family_candidate" };
  }

  if (triggerRisk >= candidateRiskThreshold) {
    return { decision: "allow", reason: "known_pattern_overlap" };
  }

  if (promisingCandidate) {
    return { decision: "inject_conservative", reason: "promising_candidate_quality" };
  }

  return { decision: "skip", reason: "candidate_quality_rejected" };
};

export const evaluateTrigger = (
  input: ExperienceInput,
  stats?: ScopeTaskStats,
  knownRiskSummaryOrContext?: string | TriggerEvaluationContext,
  threshold = 0.6
): boolean => {
  const route = evaluateTriggerRoute(input, stats, knownRiskSummaryOrContext, threshold);
  return route.decision !== "skip";
};
