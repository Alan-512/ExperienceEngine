import type { ExperienceInput, InjectionScorecard, InterventionDecisionDiagnostics } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { deriveSkipReason } from "./skip-reason.js";

export const buildSkipScorecard = (
  input: ExperienceInput,
  sessionId: string,
  diagnostics?: InterventionDecisionDiagnostics,
  scopeDisabled = false
): InjectionScorecard => {
  const skipReason = deriveSkipReason({
    mode: "skip",
    diagnostics,
    scopeDisabled
  });
  const isDiagnostic = skipReason?.code === "record_only_diagnostic_candidate";

  return {
    sessionId,
    scopeId: input.scope_id,
    taskType: input.task_type === "unknown" ? "general" : input.task_type,
    taskSummary: input.task_summary,
    mode: "skip",
    interventionStrength: isDiagnostic ? "diagnostic_hint" : undefined,
    skipReasonCode: skipReason?.code,
    skipReasonExplanation: skipReason?.explanation,
    riskLevel: isDiagnostic ? "high" : "low",
    recommendation: skipReason?.explanation ?? "No guidance was delivered for this task.",
    reasons: skipReason ? [skipReason.explanation] : [],
    topCandidates: diagnostics?.topCandidates,
    topCandidateScore: diagnostics?.topCandidateScore,
    scoreMargin: diagnostics?.scoreMargin,
    fastPathApplied: diagnostics?.fastPathApplied,
    queryRewriteApplied: diagnostics?.queryRewriteApplied,
    gateReason: diagnostics?.gateReason,
    decisionReason: diagnostics?.decisionReason,
    confidence: diagnostics?.confidence,
    budgetClass: diagnostics?.budgetClass,
    selectedCandidateIds: [],
    recordOnlyDiagnosticCandidateIds: diagnostics?.recordOnlyDiagnosticCandidateIds,
    retrievalPolicyDiagnostics: diagnostics?.retrievalPolicyDiagnostics,
    rejectedCandidates: diagnostics?.rejectedCandidates,
    nodes: [],
    createdAt: nowIso()
  };
};
