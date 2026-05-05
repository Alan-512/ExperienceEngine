import type {
  AttributionRecord,
  DeliveryState,
  ExperienceCandidate,
  ExperienceNode,
  ExperienceNodeType,
  ExperienceState,
  TaskType
} from "../types/domain.js";
import type { HygieneFinding, HygieneSeverity } from "./experience-hygiene.js";

export type ExportDraftRisk = "low" | "medium" | "high";
export type ExportDraftTargetType =
  | "instruction_note"
  | "repo_guidance"
  | "skill_candidate"
  | "documentation_note"
  | "do_not_export";

export type ExperienceExportDraftFilters = {
  scopeId?: string;
  nodeId?: string;
  nodeType?: ExperienceNodeType;
  taskFamily?: TaskType;
  state?: ExperienceState;
  deliveryState?: DeliveryState;
  risk?: ExportDraftRisk;
  limit?: number;
};

export type ExperienceExportDraft = {
  draftId: string;
  scopeId: string;
  nodeIds: string[];
  contextCandidateIds: string[];
  nodeType: ExperienceNodeType;
  taskFamily: TaskType;
  guidanceText: string;
  applicabilityNotes?: string;
  evidenceSummary: string;
  provenanceRefs: string[];
  risk: ExportDraftRisk;
  riskNotes: string[];
  hygieneNotes: string[];
  helpedSignals: number;
  harmedSignals: number;
  deliveryState?: DeliveryState;
  lifecycleState: ExperienceState;
  suggestedTargetType: ExportDraftTargetType;
  readinessScore: number;
  lastEvidenceAt: string;
};

export type ExperienceExportDraftReport = {
  scopeId?: string;
  generatedAt: string;
  filters: Required<Pick<ExperienceExportDraftFilters, "limit">> & Omit<ExperienceExportDraftFilters, "limit">;
  summary: {
    total: number;
    byRisk: Record<ExportDraftRisk, number>;
    byTargetType: Record<ExportDraftTargetType, number>;
  };
  drafts: ExperienceExportDraft[];
};

export type BuildExperienceExportDraftInput = {
  nodes: ExperienceNode[];
  candidates?: ExperienceCandidate[];
  attributionRecords?: AttributionRecord[];
  hygieneFindings?: HygieneFinding[];
  filters?: ExperienceExportDraftFilters;
  now?: string;
};

const DEFAULT_LIMIT = 20;
const RISKS: ExportDraftRisk[] = ["low", "medium", "high"];
const TARGET_TYPES: ExportDraftTargetType[] = [
  "instruction_note",
  "repo_guidance",
  "skill_candidate",
  "documentation_note",
  "do_not_export"
];
const HIGH_SEVERITY: HygieneSeverity = "high";

const emptyRiskCounts = (): Record<ExportDraftRisk, number> =>
  Object.fromEntries(RISKS.map((risk) => [risk, 0])) as Record<ExportDraftRisk, number>;

const emptyTargetCounts = (): Record<ExportDraftTargetType, number> =>
  Object.fromEntries(TARGET_TYPES.map((target) => [target, 0])) as Record<ExportDraftTargetType, number>;

const latestIso = (...values: Array<string | undefined>): string =>
  values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? "";

const stableDraftId = (node: ExperienceNode): string => `draft_${node.id}`;

const hasExplicitLowReadinessFilter = (filters: ExperienceExportDraftFilters): boolean =>
  Boolean(filters.nodeId || filters.risk || filters.state || filters.deliveryState);

const isDefaultExportable = (node: ExperienceNode): boolean => {
  if (node.state !== "active") {
    return false;
  }
  if (node.delivery_state && node.delivery_state !== "eligible") {
    return false;
  }
  if (node.harmed_count > node.helped_count) {
    return false;
  }
  return true;
};

const isLowReadiness = (node: ExperienceNode): boolean =>
  node.state !== "active"
  || node.delivery_state === "conservative_only"
  || node.delivery_state === "shadow_only"
  || node.delivery_state === "quarantined"
  || node.harmed_count > node.helped_count;

const addUnique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const collectAttributionByNode = (records: AttributionRecord[]): Map<string, AttributionRecord[]> => {
  const byNode = new Map<string, AttributionRecord[]>();
  for (const record of records) {
    const entries = byNode.get(record.node_id) ?? [];
    entries.push(record);
    byNode.set(record.node_id, entries);
  }
  return byNode;
};

const collectHygieneByNode = (findings: HygieneFinding[]): Map<string, HygieneFinding[]> => {
  const byNode = new Map<string, HygieneFinding[]>();
  for (const finding of findings) {
    for (const nodeId of finding.affectedNodeIds) {
      const entries = byNode.get(nodeId) ?? [];
      entries.push(finding);
      byNode.set(nodeId, entries);
    }
  }
  return byNode;
};

const contextCandidateIdsForNode = (node: ExperienceNode, candidates: ExperienceCandidate[], findings: HygieneFinding[]): string[] => {
  const fromFindings = findings.flatMap((finding) => finding.affectedCandidateIds);
  const overlapping = candidates
    .filter((candidate) => candidate.scope_id === node.scope_id && candidate.task_type === node.task_type)
    .filter((candidate) => fromFindings.includes(candidate.id))
    .map((candidate) => candidate.id);
  return addUnique(overlapping);
};

const buildGuidanceText = (node: ExperienceNode): string => {
  const lines = [node.compact_hint];
  if (node.recommended_steps?.length) {
    lines.push(`Recommended: ${node.recommended_steps.join(" | ")}`);
  }
  if (node.avoid_steps?.length) {
    lines.push(`Avoid: ${node.avoid_steps.join(" | ")}`);
  }
  if (node.success_signal) {
    lines.push(`Success: ${node.success_signal}`);
  }
  return lines.join("\n");
};

const riskForNode = (node: ExperienceNode, hygiene: HygieneFinding[], attribution: AttributionRecord[]): ExportDraftRisk => {
  if (
    hygiene.some((finding) => finding.severity === HIGH_SEVERITY)
    || node.delivery_state === "quarantined"
    || node.state === "retired"
    || node.harmed_count > node.helped_count
    || attribution.some((record) => record.attribution_verdict === "strong_harmed")
  ) {
    return "high";
  }
  if (
    node.state === "candidate"
    || node.state === "priority_candidate"
    || node.state === "cooling"
    || node.delivery_state === "conservative_only"
    || node.delivery_state === "shadow_only"
    || node.harmed_count > 0
    || hygiene.some((finding) => finding.severity === "medium")
  ) {
    return "medium";
  }
  return "low";
};

const targetTypeForNode = (node: ExperienceNode, risk: ExportDraftRisk, hygiene: HygieneFinding[]): ExportDraftTargetType => {
  if (risk === "high" || hygiene.some((finding) => finding.severity === HIGH_SEVERITY) || isLowReadiness(node)) {
    return "do_not_export";
  }
  if (node.node_type === "warning") {
    return "instruction_note";
  }
  if (node.validation_state === "validated_by_reuse" || node.helped_count > 0) {
    return "repo_guidance";
  }
  if ((node.recommended_steps?.length ?? 0) >= 2 && node.applicability_notes) {
    return "skill_candidate";
  }
  return "documentation_note";
};

const riskNotesForNode = (node: ExperienceNode, hygiene: HygieneFinding[], attribution: AttributionRecord[]): string[] => {
  const notes: string[] = [];
  if (!isDefaultExportable(node)) {
    notes.push(`Not default-exportable: lifecycle=${node.state}, delivery=${node.delivery_state ?? "eligible"}.`);
  }
  if (node.harmed_count > 0) {
    notes.push(`Has ${node.harmed_count} harmed signal(s).`);
  }
  for (const finding of hygiene) {
    notes.push(`${finding.severity} hygiene ${finding.type}: ${finding.evidenceSummary}`);
  }
  const harmed = attribution.filter(
    (record) => record.attribution_verdict === "strong_harmed" || record.attribution_verdict === "weak_harmed"
  );
  if (harmed.length) {
    notes.push(`Has ${harmed.length} recent harmed attribution record(s).`);
  }
  return addUnique(notes);
};

const readinessScoreForNode = (node: ExperienceNode, risk: ExportDraftRisk): number => {
  const riskPenalty: Record<ExportDraftRisk, number> = { low: 0, medium: 20, high: 50 };
  const deliveryBonus = node.delivery_state === "eligible" || !node.delivery_state ? 20 : 0;
  const stateBonus = node.state === "active" ? 25 : node.state === "cooling" ? 5 : 0;
  const validationBonus = node.validation_state === "validated_by_reuse" ? 15 : 0;
  const feedbackScore = node.helped_count * 8 - node.harmed_count * 12;
  return stateBonus + deliveryBonus + validationBonus + feedbackScore + node.support_count - riskPenalty[risk];
};

const buildDraft = (
  node: ExperienceNode,
  candidates: ExperienceCandidate[],
  hygiene: HygieneFinding[],
  attribution: AttributionRecord[]
): ExperienceExportDraft => {
  const risk = riskForNode(node, hygiene, attribution);
  const targetType = targetTypeForNode(node, risk, hygiene);
  const provenanceRefs = addUnique([
    ...node.origin_record_ids,
    ...node.helped_record_ids,
    ...node.harmed_record_ids,
    ...hygiene.flatMap((finding) => finding.evidenceRefs),
    ...attribution.flatMap((record) => record.evidence_refs)
  ]);
  const lastEvidenceAt = latestIso(
    node.last_helped_at,
    node.last_harmed_at,
    node.last_used_at,
    node.updated_at,
    ...hygiene.map((finding) => finding.createdAt),
    ...attribution.map((record) => record.created_at)
  );
  return {
    draftId: stableDraftId(node),
    scopeId: node.scope_id,
    nodeIds: [node.id],
    contextCandidateIds: contextCandidateIdsForNode(node, candidates, hygiene),
    nodeType: node.node_type,
    taskFamily: node.task_type,
    guidanceText: buildGuidanceText(node),
    applicabilityNotes: node.applicability_notes,
    evidenceSummary: node.evidence_summary,
    provenanceRefs,
    risk,
    riskNotes: riskNotesForNode(node, hygiene, attribution),
    hygieneNotes: hygiene.map((finding) => finding.recommendation),
    helpedSignals: node.helped_count,
    harmedSignals: node.harmed_count,
    deliveryState: node.delivery_state,
    lifecycleState: node.state,
    suggestedTargetType: targetType,
    readinessScore: readinessScoreForNode(node, risk),
    lastEvidenceAt
  };
};

export const buildExperienceExportDraftReport = (input: BuildExperienceExportDraftInput): ExperienceExportDraftReport => {
  const filters = input.filters ?? {};
  const limit = filters.limit ?? DEFAULT_LIMIT;
  const attributionByNode = collectAttributionByNode(input.attributionRecords ?? []);
  const hygieneByNode = collectHygieneByNode(input.hygieneFindings ?? []);
  const explicitLowReadiness = hasExplicitLowReadinessFilter(filters);

  const drafts = input.nodes
    .filter((node) => !filters.scopeId || node.scope_id === filters.scopeId)
    .filter((node) => !filters.nodeId || node.id === filters.nodeId)
    .filter((node) => !filters.nodeType || node.node_type === filters.nodeType)
    .filter((node) => !filters.taskFamily || node.task_type === filters.taskFamily)
    .filter((node) => !filters.state || node.state === filters.state)
    .filter((node) => !filters.deliveryState || node.delivery_state === filters.deliveryState)
    .filter((node) => explicitLowReadiness || isDefaultExportable(node))
    .map((node) =>
      buildDraft(
        node,
        (input.candidates ?? []).filter((candidate) => !filters.scopeId || candidate.scope_id === filters.scopeId),
        hygieneByNode.get(node.id) ?? [],
        attributionByNode.get(node.id) ?? []
      )
    )
    .filter((draft) => !filters.risk || draft.risk === filters.risk)
    .sort((left, right) => {
      const readinessDelta = right.readinessScore - left.readinessScore;
      if (readinessDelta !== 0) {
        return readinessDelta;
      }
      const evidenceDelta = right.lastEvidenceAt.localeCompare(left.lastEvidenceAt);
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }
      return left.draftId.localeCompare(right.draftId);
    })
    .slice(0, limit);

  const byRisk = emptyRiskCounts();
  const byTargetType = emptyTargetCounts();
  for (const draft of drafts) {
    byRisk[draft.risk] += 1;
    byTargetType[draft.suggestedTargetType] += 1;
  }

  return {
    scopeId: filters.scopeId,
    generatedAt: input.now ?? new Date().toISOString(),
    filters: {
      ...filters,
      limit
    },
    summary: {
      total: drafts.length,
      byRisk,
      byTargetType
    },
    drafts
  };
};
