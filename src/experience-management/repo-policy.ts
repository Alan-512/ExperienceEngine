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

export type RepoPolicyEvidenceEntry = RepoPolicyEvidence & {
  injectionId?: string;
  nodeId?: string;
  delivered?: boolean;
  attributionSource?: AttributionRecord["source"];
  attributionReason?: AttributionRecord["attribution_reason"] | InjectionEvent["attribution_reason"];
  userOverride?: AttributionRecord["user_override"];
  evidenceLabel: "automatic_attribution" | "manual_override" | "diagnostic_record" | "injection_fallback";
};

export type RepoPolicyEvidenceSummary = {
  windowSize: number;
  limit: number;
  countsBySource: Record<RepoPolicyEvidenceEntry["source"], number>;
  countsByVerdict: Partial<Record<AttributionVerdict, number>>;
  manualOverrideCount: number;
  fallbackSuppressedCount: number;
};

export type RepoPolicyInspection = {
  policy: RepoPolicy;
  evidenceSummary: RepoPolicyEvidenceSummary;
  evidence: RepoPolicyEvidenceEntry[];
  restoreGuidance?: string;
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

const evidenceSourceForEntries = (entries: RepoPolicyEvidenceEntry[]): RepoPolicyEvaluation["evidenceSource"] => {
  if (!entries.length) {
    return "none";
  }
  return entries.some((entry) => entry.source === "attribution") ? "attribution" : "injection_fallback";
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

const evidenceLabelForAttribution = (record: AttributionRecord): RepoPolicyEvidenceEntry["evidenceLabel"] => {
  if (record.user_override || record.source === "manual_override") {
    return "manual_override";
  }
  if (record.source === "diagnostic_record") {
    return "diagnostic_record";
  }
  return "automatic_attribution";
};

export const summarizeRepoPolicyEvidence = (
  attributionRecords: AttributionRecord[] = [],
  fallbackInjectionEvents: InjectionEvent[] = [],
  limit = REPO_POLICY_WINDOW_SIZE
): { summary: RepoPolicyEvidenceSummary; entries: RepoPolicyEvidenceEntry[] } => {
  const attributionEntries: RepoPolicyEvidenceEntry[] = attributionRecords
    .filter((record) => record.delivered || record.intervention_strength === "diagnostic_hint")
    .map((record) => ({
      source: "attribution",
      verdict: record.attribution_verdict,
      createdAt: record.created_at,
      injectionId: record.injection_id,
      nodeId: record.node_id,
      delivered: record.delivered,
      attributionSource: record.source,
      attributionReason: record.attribution_reason,
      userOverride: record.user_override,
      evidenceLabel: evidenceLabelForAttribution(record)
    }));
  const attributionInjectionIds = new Set(
    attributionEntries.map((entry) => entry.injectionId).filter((id): id is string => Boolean(id))
  );
  const fallbackEntries: RepoPolicyEvidenceEntry[] = fallbackInjectionEvents
    .filter((event) => !attributionInjectionIds.has(event.injection_id))
    .map((event) => ({
      source: "injection_fallback",
      verdict: fallbackVerdictForInjection(event),
      createdAt: event.created_at,
      injectionId: event.injection_id,
      delivered: event.delivered,
      attributionReason: event.attribution_reason,
      evidenceLabel: "injection_fallback"
    }));
  const entries = [...attributionEntries, ...fallbackEntries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  const countsByVerdict: Partial<Record<AttributionVerdict, number>> = {};
  for (const entry of entries) {
    countsByVerdict[entry.verdict] = (countsByVerdict[entry.verdict] ?? 0) + 1;
  }

  return {
    entries,
    summary: {
      windowSize: entries.length,
      limit,
      countsBySource: {
        attribution: entries.filter((entry) => entry.source === "attribution").length,
        injection_fallback: entries.filter((entry) => entry.source === "injection_fallback").length
      },
      countsByVerdict,
      manualOverrideCount: entries.filter((entry) => entry.evidenceLabel === "manual_override").length,
      fallbackSuppressedCount: fallbackInjectionEvents.length - fallbackEntries.length
    }
  };
};

export const inspectRepoPolicyEvidence = (
  policy: RepoPolicy,
  attributionRecords: AttributionRecord[] = [],
  fallbackInjectionEvents: InjectionEvent[] = [],
  limit = REPO_POLICY_WINDOW_SIZE
): RepoPolicyInspection => {
  const evidence = summarizeRepoPolicyEvidence(attributionRecords, fallbackInjectionEvents, limit);
  return {
    policy,
    evidenceSummary: evidence.summary,
    evidence: evidence.entries,
    restoreGuidance:
      policy.circuit_state === "tripped"
        ? "Run `ee config restore repo-policy` after investigating the circuit evidence."
        : undefined
  };
};

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
  const evidence = summarizeRepoPolicyEvidence(attributionRecords, fallbackInjectionEvents);
  const entries = evidence.entries;
  const evidenceSource = evidenceSourceForEntries(entries);
  const strongHarmedCount = entries.filter((item) => item.verdict === "strong_harmed").length;
  const harmfulCount = entries.filter((item) => isHarmfulVerdict(item.verdict)).length;
  const eligibleCount = entries.length;
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
