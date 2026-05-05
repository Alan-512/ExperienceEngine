import type {
  AttributionRecord,
  CandidateLifecycleState,
  ExperienceCandidate,
  ExperienceNode,
  ExperienceState
} from "../types/domain.js";

export type HygieneFindingType =
  | "stale_experience"
  | "duplicate_guidance"
  | "conflicting_guidance"
  | "over_generalized_guidance"
  | "evidence_drift";

export type HygieneSeverity = "high" | "medium" | "low";

export type HygieneReviewFilters = {
  scopeId?: string;
  type?: HygieneFindingType;
  severity?: HygieneSeverity;
  limit?: number;
  now?: string;
};

export type HygieneFinding = {
  type: HygieneFindingType;
  severity: HygieneSeverity;
  affectedNodeIds: string[];
  affectedCandidateIds: string[];
  evidenceSummary: string;
  recommendation: string;
  evidenceRefs: string[];
  createdAt: string;
};

export type HygieneReviewReport = {
  scopeId?: string;
  generatedAt: string;
  filters: Omit<HygieneReviewFilters, "now">;
  summary: {
    total: number;
    byType: Record<HygieneFindingType, number>;
    bySeverity: Record<HygieneSeverity, number>;
  };
  findings: HygieneFinding[];
};

export type BuildHygieneReviewInput = {
  nodes: ExperienceNode[];
  candidates: ExperienceCandidate[];
  attributionRecords: AttributionRecord[];
  filters?: HygieneReviewFilters;
};

const FINDING_TYPES: HygieneFindingType[] = [
  "stale_experience",
  "duplicate_guidance",
  "conflicting_guidance",
  "over_generalized_guidance",
  "evidence_drift"
];
const SEVERITIES: HygieneSeverity[] = ["high", "medium", "low"];
const REVIEWABLE_NODE_STATES: ExperienceState[] = ["candidate", "priority_candidate", "active", "cooling"];
const REVIEWABLE_CANDIDATE_STATES: CandidateLifecycleState[] = ["pending", "distilled", "failed"];
const DEFAULT_LIMIT = 20;
const STALE_DAYS = 90;
const TOKEN_SIMILARITY_THRESHOLD = 0.72;
const GENERIC_TERMS = new Set([
  "always",
  "before",
  "careful",
  "check",
  "debug",
  "ensure",
  "every",
  "first",
  "fix",
  "follow",
  "issue",
  "make",
  "review",
  "run",
  "task",
  "test",
  "thing",
  "use",
  "verify",
  "when"
]);

const emptyTypeCounts = (): Record<HygieneFindingType, number> =>
  Object.fromEntries(FINDING_TYPES.map((type) => [type, 0])) as Record<HygieneFindingType, number>;

const emptySeverityCounts = (): Record<HygieneSeverity, number> =>
  Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<HygieneSeverity, number>;

const toMillis = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const ageDays = (referenceIso: string, value?: string): number | undefined => {
  const reference = toMillis(referenceIso);
  const current = toMillis(value);
  if (reference === undefined || current === undefined) {
    return undefined;
  }
  return Math.max(0, Math.floor((reference - current) / 86_400_000));
};

const normalizeText = (value: string | undefined): string[] =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_/\-.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const guidanceTokens = (entry: Pick<ExperienceNode | ExperienceCandidate, "trigger_pattern" | "compact_hint" | "retrieval_text">): Set<string> =>
  new Set([...normalizeText(entry.trigger_pattern), ...normalizeText(entry.compact_hint), ...normalizeText(entry.retrieval_text)]);

const tokenSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (!left.size || !right.size) {
    return 0;
  }
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(left.size, right.size);
};

const hasGenericGuidance = (entry: Pick<ExperienceNode | ExperienceCandidate, "trigger_pattern" | "compact_hint">): boolean => {
  const tokens = normalizeText(`${entry.trigger_pattern} ${entry.compact_hint}`);
  if (tokens.length < 8) {
    return true;
  }
  const genericCount = tokens.filter((token) => GENERIC_TERMS.has(token)).length;
  return genericCount / tokens.length >= 0.45;
};

const hasRecommendationConflict = (
  left: Pick<ExperienceNode | ExperienceCandidate, "recommended_steps" | "avoid_steps">,
  right: Pick<ExperienceNode | ExperienceCandidate, "recommended_steps" | "avoid_steps">
): boolean => {
  const leftRecommended = new Set((left.recommended_steps ?? []).flatMap(normalizeText));
  const leftAvoided = new Set((left.avoid_steps ?? []).flatMap(normalizeText));
  const rightRecommended = new Set((right.recommended_steps ?? []).flatMap(normalizeText));
  const rightAvoided = new Set((right.avoid_steps ?? []).flatMap(normalizeText));
  const overlaps = (a: Set<string>, b: Set<string>): boolean => {
    for (const token of a) {
      if (b.has(token) && !GENERIC_TERMS.has(token)) {
        return true;
      }
    }
    return false;
  };
  return overlaps(leftRecommended, rightAvoided) || overlaps(rightRecommended, leftAvoided);
};

const sortFindings = (findings: HygieneFinding[]): HygieneFinding[] => {
  const severityRank: Record<HygieneSeverity, number> = { high: 0, medium: 1, low: 2 };
  return findings.sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    const timeDelta = (toMillis(right.createdAt) ?? 0) - (toMillis(left.createdAt) ?? 0);
    if (timeDelta !== 0) {
      return timeDelta;
    }
    return left.type.localeCompare(right.type) || left.affectedNodeIds.join(",").localeCompare(right.affectedNodeIds.join(","));
  });
};

export const buildHygieneReviewReport = (input: BuildHygieneReviewInput): HygieneReviewReport => {
  const filters = input.filters ?? {};
  const generatedAt = filters.now ?? new Date().toISOString();
  const nodes = input.nodes.filter(
    (node) => (!filters.scopeId || node.scope_id === filters.scopeId) && REVIEWABLE_NODE_STATES.includes(node.state)
  );
  const candidates = input.candidates.filter(
    (candidate) =>
      (!filters.scopeId || candidate.scope_id === filters.scopeId) && REVIEWABLE_CANDIDATE_STATES.includes(candidate.lifecycle_state)
  );
  const attributionByNode = new Map<string, AttributionRecord[]>();
  for (const record of input.attributionRecords) {
    if (!filters.scopeId || nodes.some((node) => node.id === record.node_id)) {
      const records = attributionByNode.get(record.node_id) ?? [];
      records.push(record);
      attributionByNode.set(record.node_id, records);
    }
  }

  const findings: HygieneFinding[] = [];

  for (const node of nodes.filter((candidate) => candidate.state === "active" || candidate.state === "cooling")) {
    const lastPositive = node.last_helped_at;
    const lastEvidenceAt = node.last_used_at ?? node.updated_at;
    const staleAge = ageDays(generatedAt, lastEvidenceAt);
    if ((staleAge ?? 0) >= STALE_DAYS && !lastPositive) {
      findings.push({
        type: "stale_experience",
        severity: node.delivery_state === "eligible" ? "medium" : "low",
        affectedNodeIds: [node.id],
        affectedCandidateIds: [],
        evidenceSummary: `Node has no recent helped attribution and has not been used for ${staleAge} day(s).`,
        recommendation: "Inspect this node and review whether cooling or retirement should be handled through explicit lifecycle controls.",
        evidenceRefs: node.origin_record_ids,
        createdAt: node.last_used_at ?? node.updated_at
      });
    }
  }

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const left = nodes[i];
      const right = nodes[j];
      if (left.scope_id !== right.scope_id || left.task_type !== right.task_type) {
        continue;
      }
      const similarity = tokenSimilarity(guidanceTokens(left), guidanceTokens(right));
      if (similarity >= TOKEN_SIMILARITY_THRESHOLD) {
        findings.push({
          type: "duplicate_guidance",
          severity: "medium",
          affectedNodeIds: [left.id, right.id],
          affectedCandidateIds: [],
          evidenceSummary: `Same-scope ${left.task_type} nodes have ${similarity.toFixed(2)} lexical guidance overlap.`,
          recommendation: "Review whether these nodes should stay separate or be merged through a separate explicit workflow.",
          evidenceRefs: [...left.origin_record_ids, ...right.origin_record_ids],
          createdAt: left.updated_at > right.updated_at ? left.updated_at : right.updated_at
        });
      }

      if (hasRecommendationConflict(left, right)) {
        findings.push({
          type: "conflicting_guidance",
          severity: "high",
          affectedNodeIds: [left.id, right.id],
          affectedCandidateIds: [],
          evidenceSummary: `Same-scope ${left.task_type} nodes contain overlapping recommended and avoided paths.`,
          recommendation: "Review the conflicting guidance before allowing either lesson to guide similar work.",
          evidenceRefs: [...left.origin_record_ids, ...right.origin_record_ids],
          createdAt: left.updated_at > right.updated_at ? left.updated_at : right.updated_at
        });
      }
    }
  }

  for (const candidate of candidates) {
    for (const node of nodes) {
      if (candidate.scope_id !== node.scope_id || candidate.task_type !== node.task_type) {
        continue;
      }
      const similarity = tokenSimilarity(guidanceTokens(candidate), guidanceTokens(node));
      if (similarity >= TOKEN_SIMILARITY_THRESHOLD) {
        findings.push({
          type: "duplicate_guidance",
          severity: "low",
          affectedNodeIds: [node.id],
          affectedCandidateIds: [candidate.id],
          evidenceSummary: `Raw candidate overlaps with existing node at ${similarity.toFixed(2)} lexical guidance similarity.`,
          recommendation: "Review the candidate before promotion; do not discard or merge it from the hygiene report.",
          evidenceRefs: [candidate.source_record_id, ...node.origin_record_ids],
          createdAt: candidate.updated_at > node.updated_at ? candidate.updated_at : node.updated_at
        });
      }
    }
  }

  for (const node of nodes) {
    const harmedRatio = node.harmed_count / Math.max(1, node.helped_count + node.harmed_count);
    if (hasGenericGuidance(node) && (node.support_count <= 1 || harmedRatio >= 0.4)) {
      findings.push({
        type: "over_generalized_guidance",
        severity: harmedRatio >= 0.5 ? "high" : "medium",
        affectedNodeIds: [node.id],
        affectedCandidateIds: [],
        evidenceSummary: "Node wording is broad while support is weak or harm evidence is elevated.",
        recommendation: "Review whether the lesson should be narrowed, cooled, or retired through explicit controls.",
        evidenceRefs: [...node.origin_record_ids, ...node.harmed_record_ids],
        createdAt: node.last_harmed_at ?? node.updated_at
      });
    }
  }

  for (const candidate of candidates) {
    if (hasGenericGuidance(candidate) && candidate.lifecycle_state !== "discarded") {
      findings.push({
        type: "over_generalized_guidance",
        severity: "low",
        affectedNodeIds: [],
        affectedCandidateIds: [candidate.id],
        evidenceSummary: "Raw candidate wording is broad and should be checked before promotion.",
        recommendation: "Review whether the candidate needs narrower trigger or hint wording before distillation.",
        evidenceRefs: [candidate.source_record_id],
        createdAt: candidate.updated_at
      });
    }
  }

  for (const node of nodes) {
    if (node.delivery_state !== "eligible" && node.delivery_state !== "conservative_only") {
      continue;
    }
    const recentHarm = (attributionByNode.get(node.id) ?? []).find(
      (record) => record.attribution_verdict === "strong_harmed" || record.attribution_verdict === "weak_harmed"
    );
    if (recentHarm) {
      findings.push({
        type: "evidence_drift",
        severity: recentHarm.attribution_verdict === "strong_harmed" ? "high" : "medium",
        affectedNodeIds: [node.id],
        affectedCandidateIds: [],
        evidenceSummary: `Delivery-state ${node.delivery_state} node has recent ${recentHarm.attribution_verdict} attribution evidence.`,
        recommendation: "Inspect the attribution evidence before relying on this node in similar live tasks.",
        evidenceRefs: recentHarm.evidence_refs,
        createdAt: recentHarm.created_at
      });
    }
  }

  const filtered = sortFindings(findings).filter(
    (finding) => (!filters.type || finding.type === filters.type) && (!filters.severity || finding.severity === filters.severity)
  );
  const bounded = filtered.slice(0, filters.limit ?? DEFAULT_LIMIT);
  const byType = emptyTypeCounts();
  const bySeverity = emptySeverityCounts();
  for (const finding of bounded) {
    byType[finding.type] += 1;
    bySeverity[finding.severity] += 1;
  }

  return {
    scopeId: filters.scopeId,
    generatedAt,
    filters: {
      scopeId: filters.scopeId,
      type: filters.type,
      severity: filters.severity,
      limit: filters.limit ?? DEFAULT_LIMIT
    },
    summary: {
      total: bounded.length,
      byType,
      bySeverity
    },
    findings: bounded
  };
};
