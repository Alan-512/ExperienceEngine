import type {
  AttributionRecord,
  AttributionVerdict,
  InjectionEvent,
  RepoExperienceMode,
  RepoPolicy
} from "../types/domain.js";
import { nowIso } from "../utils/clock.js";

export const REPO_POLICY_WINDOW_SIZE = 20;
export const REPO_POLICY_MIN_EVIDENCE = 5;
export const REPO_POLICY_HARM_RATE_THRESHOLD = 0.3;
export const REPO_POLICY_STRONG_HARM_THRESHOLD = 2;

export type RepoPolicyEvidence = {
  source: "attribution" | "injection_fallback";
  verdict: AttributionVerdict;
  createdAt: string;
};

export type RepoPolicyEvaluation = {
  policy: RepoPolicy;
  evidenceSource: "attribution" | "injection_fallback" | "none";
  eligibleCount: number;
  harmfulCount: number;
  strongHarmedCount: number;
  harmfulRate: number;
  breached: boolean;
  changed: boolean;
};

export const buildDefaultRepoPolicy = (
  scopeId: string,
  configuredMode: RepoExperienceMode = "safe",
  timestamp = nowIso()
): RepoPolicy => ({
  scope_id: scopeId,
  configured_mode: configuredMode,
  effective_mode: configuredMode,
  circuit_state: "clear",
  live_diagnostics_disabled: false,
  created_at: timestamp,
  updated_at: timestamp
});

const fallbackVerdictForInjection = (event: InjectionEvent): AttributionVerdict => {
  if (event.harm_observed) {
    return "strong_harmed";
  }
  if (event.was_successful === true) {
    return "weak_helped";
  }
  if (
    event.was_successful === false &&
    (
      event.attribution_reason === "relevant_failure" ||
      event.attribution_reason === "exploratory_failure" ||
      event.attribution_reason === "unknown_outcome"
    )
  ) {
    return "weak_harmed";
  }
  return "neutral";
};

export const evidenceFromAttributionRecords = (records: AttributionRecord[]): RepoPolicyEvidence[] =>
  records
    .filter((record) => record.delivered || record.intervention_strength === "diagnostic_hint")
    .map((record) => ({
      source: "attribution" as const,
      verdict: record.attribution_verdict,
      createdAt: record.created_at
    }));

export const evidenceFromInjectionFallback = (events: InjectionEvent[]): RepoPolicyEvidence[] =>
  events.map((event) => ({
    source: "injection_fallback" as const,
    verdict: fallbackVerdictForInjection(event),
    createdAt: event.created_at
  }));

const isHarmfulVerdict = (verdict: AttributionVerdict): boolean =>
  verdict === "weak_harmed" || verdict === "strong_harmed";

const downgradeMode = (mode: RepoExperienceMode): RepoExperienceMode =>
  mode === "fast_learning" ? "safe" : "strict";

export const restoreRepoPolicy = (policy: RepoPolicy, timestamp = nowIso()): RepoPolicy => ({
  ...policy,
  effective_mode: policy.configured_mode,
  circuit_state: "clear",
  circuit_reason: undefined,
  live_diagnostics_disabled: false,
  updated_at: timestamp,
  restored_at: timestamp
});

export const evaluateRepoPolicy = (
  policy: RepoPolicy,
  attributionRecords: AttributionRecord[] = [],
  fallbackInjectionEvents: InjectionEvent[] = [],
  timestamp = nowIso()
): RepoPolicyEvaluation => {
  const attributionEvidence = evidenceFromAttributionRecords(attributionRecords);
  const fallbackEvidence = evidenceFromInjectionFallback(fallbackInjectionEvents);
  const evidence = [...attributionEvidence, ...fallbackEvidence]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, REPO_POLICY_WINDOW_SIZE);

  const evidenceSource =
    evidence.length === 0
      ? "none"
      : attributionEvidence.length > 0
        ? "attribution"
        : "injection_fallback";
  const strongHarmedCount = evidence.filter((item) => item.verdict === "strong_harmed").length;
  const harmfulCount = evidence.filter((item) => isHarmfulVerdict(item.verdict)).length;
  const eligibleCount = evidence.length;
  const harmfulRate = eligibleCount > 0 ? harmfulCount / eligibleCount : 0;
  const breached =
    eligibleCount >= REPO_POLICY_MIN_EVIDENCE &&
    (strongHarmedCount >= REPO_POLICY_STRONG_HARM_THRESHOLD || harmfulRate >= REPO_POLICY_HARM_RATE_THRESHOLD);

  if (!breached) {
    return {
      policy,
      evidenceSource,
      eligibleCount,
      harmfulCount,
      strongHarmedCount,
      harmfulRate,
      breached: false,
      changed: false
    };
  }

  const nextEffectiveMode = downgradeMode(policy.effective_mode);
  const liveDiagnosticsDisabled = policy.effective_mode === "strict" || nextEffectiveMode === "strict";
  const reason =
    strongHarmedCount >= REPO_POLICY_STRONG_HARM_THRESHOLD
      ? `repo_circuit: ${strongHarmedCount} strong_harmed records in ${eligibleCount} recent interventions`
      : `repo_circuit: ${harmfulCount}/${eligibleCount} recent interventions harmed`;
  const nextPolicy: RepoPolicy = {
    ...policy,
    effective_mode: nextEffectiveMode,
    circuit_state: "tripped",
    circuit_reason: reason,
    live_diagnostics_disabled: liveDiagnosticsDisabled,
    updated_at: timestamp,
    last_tripped_at: timestamp
  };

  return {
    policy: nextPolicy,
    evidenceSource,
    eligibleCount,
    harmfulCount,
    strongHarmedCount,
    harmfulRate,
    breached: true,
    changed: JSON.stringify(policy) !== JSON.stringify(nextPolicy)
  };
};
