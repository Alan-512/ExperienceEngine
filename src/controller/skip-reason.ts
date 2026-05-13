import type {
  EvaluationMode,
  InjectionMode,
  InterventionDecisionDiagnostics,
  SkipReasonCode
} from "../types/domain.js";

export type SkipReason = {
  code: SkipReasonCode;
  explanation: string;
};

const explain = (code: SkipReasonCode): string => {
  switch (code) {
    case "scope_disabled":
      return "ExperienceEngine skipped because interventions are disabled for this scope.";
    case "repo_policy_blocked_or_circuit_open":
      return "ExperienceEngine skipped because repo policy or circuit state blocked live reuse.";
    case "holdout_suppressed":
      return "ExperienceEngine found a usable match but withheld it for holdout evaluation.";
    case "shadow_suppressed":
      return "ExperienceEngine found a usable match but shadow mode suppressed prompt delivery.";
    case "no_candidate":
      return "ExperienceEngine skipped because no relevant experience candidate was available.";
    case "candidate_not_mature":
      return "ExperienceEngine found a nearby candidate but it has not matured enough for live delivery.";
    case "delivery_state_shadow_only":
      return "ExperienceEngine found a matching candidate that is restricted to shadow evaluation.";
    case "recent_harm_or_quarantined":
      return "ExperienceEngine skipped because matching guidance has recent harm or is quarantined.";
    case "semantic_match_policy_rejected":
      return "ExperienceEngine found a semantic match, but policy rejected prompt delivery.";
    case "task_family_mismatch":
      return "ExperienceEngine skipped because the best match was outside the current task family.";
    case "low_confidence_or_score_margin":
      return "ExperienceEngine skipped because confidence or score margin was too low.";
    case "record_only_diagnostic_candidate":
      return "ExperienceEngine kept a matching diagnostic candidate record-only until the live gate clears.";
  }
};

const fromDiagnostics = (diagnostics?: InterventionDecisionDiagnostics): SkipReasonCode => {
  if (!diagnostics) {
    return "no_candidate";
  }

  const codes = [
    diagnostics.gateReason,
    diagnostics.decisionReason,
    ...(diagnostics.topCandidates[0]?.policyReasons ?? []),
    ...(diagnostics.topCandidates[0]?.retrievalReasons ?? []),
    ...(diagnostics.retrievalPolicyDiagnostics?.stages.flatMap((stage) => stage.reasonCodes) ?? [])
  ].join("\n");

  if (diagnostics.recordOnlyDiagnosticCandidateIds?.length || /record_only|diagnostic_candidate/.test(codes)) {
    return "record_only_diagnostic_candidate";
  }
  if (/repo_policy|circuit/.test(codes)) {
    return "repo_policy_blocked_or_circuit_open";
  }
  if (/no_candidates|no_matching_candidates/.test(codes)) {
    return "no_candidate";
  }
  if (/shadow_only/.test(codes)) {
    return "delivery_state_shadow_only";
  }
  if (/quarantined|recent_harm|harmed/.test(codes)) {
    return "recent_harm_or_quarantined";
  }
  if (/state_requires_conservative_handling|candidate_not_mature|priority_candidate|candidate state/.test(codes)) {
    return "candidate_not_mature";
  }
  if (/task_family|same_family|adjacent_family/.test(codes) && diagnostics.topCandidates.length > 0) {
    return "task_family_mismatch";
  }
  if (/low_match|score_margin/.test(codes)) {
    return "low_confidence_or_score_margin";
  }
  if (/candidate_quality_rejected|uncertainty_aware_routing/.test(codes)) {
    return diagnostics.topCandidates.length > 0 ? "semantic_match_policy_rejected" : "low_confidence_or_score_margin";
  }

  return diagnostics.topCandidates.length > 0 ? "semantic_match_policy_rejected" : "no_candidate";
};

export const deriveSkipReason = (input: {
  mode: InjectionMode;
  deliveryMode?: EvaluationMode;
  delivered?: boolean;
  diagnostics?: InterventionDecisionDiagnostics;
  scopeDisabled?: boolean;
}): SkipReason | undefined => {
  let code: SkipReasonCode | undefined;

  if (input.scopeDisabled) {
    code = "scope_disabled";
  } else if (input.mode !== "skip" && input.delivered === false) {
    code = input.deliveryMode === "holdout" ? "holdout_suppressed" : "shadow_suppressed";
  } else if (input.mode === "skip") {
    code = fromDiagnostics(input.diagnostics);
  }

  return code ? { code, explanation: explain(code) } : undefined;
};
