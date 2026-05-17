import { z } from "zod";
import { stableId } from "../utils/ids.js";
import type {
  AttributionRecord,
  ExperienceCandidate,
  ExperienceNode,
  Scope
} from "../types/domain.js";
import {
  buildHygieneReviewReport,
  type HygieneFinding,
  type HygieneReviewReport
} from "./experience-hygiene.js";

export type HygieneGovernanceScopeInput = {
  scopeId: string;
  scopeName?: string;
  scopeType?: Scope["scope_type"];
};

export type HygieneGovernanceNodeSummary = {
  id: string;
  scopeId: string;
  nodeType: ExperienceNode["node_type"];
  taskType: ExperienceNode["task_type"];
  state: ExperienceNode["state"];
  deliveryState?: ExperienceNode["delivery_state"];
  triggerPattern: string;
  compactHint: string;
  recommendedSteps: string[];
  avoidSteps: string[];
  originRecordIds: string[];
  helpedRecordIds: string[];
  harmedRecordIds: string[];
  usageCount: number;
  helpedCount: number;
  harmedCount: number;
  supportCount: number;
  updatedAt: string;
};

export type HygieneGovernanceCandidateSummary = {
  id: string;
  sourceRecordId: string;
  taskType: ExperienceCandidate["task_type"];
  nodeType: ExperienceCandidate["node_type"];
  lifecycleState: ExperienceCandidate["lifecycle_state"];
  triggerPattern: string;
  compactHint: string;
  recommendedSteps: string[];
  avoidSteps: string[];
  retryCount: number;
  updatedAt: string;
};

export type HygieneGovernanceAttributionSummary = {
  id: string;
  nodeId: string;
  delivered: boolean;
  outcome: AttributionRecord["outcome"];
  verdict: AttributionRecord["attribution_verdict"];
  confidence: AttributionRecord["confidence"];
  evidenceRefs: string[];
  createdAt: string;
};

export type HygieneGovernanceExportRiskNote = {
  nodeId: string;
  reason: string;
  evidenceRefs: string[];
};

export type BuildHygieneGovernanceInput = HygieneGovernanceScopeInput & {
  nodes: ExperienceNode[];
  candidates: ExperienceCandidate[];
  attributionRecords: AttributionRecord[];
  now?: string;
  maxFindings?: number;
  maxNodes?: number;
  maxCandidates?: number;
  maxAttributions?: number;
  exportRiskEnabled?: boolean;
};

export type HygieneGovernanceInput = {
  scope: HygieneGovernanceScopeInput;
  generatedAt: string;
  findingHash: string;
  review: HygieneReviewReport["summary"];
  findings: HygieneFinding[];
  nodes: HygieneGovernanceNodeSummary[];
  candidates: HygieneGovernanceCandidateSummary[];
  attributions: HygieneGovernanceAttributionSummary[];
  exportRiskNotes: HygieneGovernanceExportRiskNote[];
  evidenceRefs: string[];
};

export const HYGIENE_GOVERNANCE_ACTION_TYPES = [
  "merge_exact_duplicate",
  "merge_near_duplicate",
  "retire_stale_shadow",
  "downgrade_delivery",
  "quarantine",
  "promote_delivery",
  "delete_record",
  "export_guidance",
  "change_repo_policy",
  "restore_guidance",
  "rewrite_guidance"
] as const;

export type HygieneGovernanceActionType = (typeof HYGIENE_GOVERNANCE_ACTION_TYPES)[number];
export type HygieneGovernanceRiskLevel = "low" | "medium" | "high";

export type HygieneGovernancePlanAction = {
  actionId: string;
  actionType: HygieneGovernanceActionType;
  riskLevel: HygieneGovernanceRiskLevel;
  approvalRequired: boolean;
  affectedNodeIds: string[];
  affectedCandidateIds: string[];
  canonicalNodeId?: string;
  expectedEffect: string;
  rationale?: string;
};

export type HygieneGovernancePlanCluster = {
  clusterId: string;
  type: HygieneFinding["type"] | "stale_shadow";
  nodeIds: string[];
  candidateIds: string[];
  rationale: string;
};

export type HygieneGovernancePlan = {
  source: "llm" | "deterministic_fallback";
  scopeId: string;
  findingHash: string;
  clusters: HygieneGovernancePlanCluster[];
  actions: HygieneGovernancePlanAction[];
};

export type HygieneGovernancePlannerProvider = {
  plan(input: HygieneGovernanceInput): Promise<string>;
};

const DEFAULT_MAX_FINDINGS = 20;
const DEFAULT_MAX_NODES = 30;
const DEFAULT_MAX_CANDIDATES = 30;
const DEFAULT_MAX_ATTRIBUTIONS = 50;

const planSchema = z.object({
  source: z.enum(["llm", "deterministic_fallback"]),
  scopeId: z.string().min(1),
  findingHash: z.string().min(1),
  clusters: z.array(z.object({
    clusterId: z.string().min(1),
    type: z.union([
      z.enum(["stale_shadow"]),
      z.enum([
        "stale_experience",
        "duplicate_guidance",
        "conflicting_guidance",
        "over_generalized_guidance",
        "evidence_drift"
      ])
    ]),
    nodeIds: z.array(z.string()),
    candidateIds: z.array(z.string()),
    rationale: z.string().min(1)
  })),
  actions: z.array(z.object({
    actionId: z.string().min(1),
    actionType: z.enum(HYGIENE_GOVERNANCE_ACTION_TYPES),
    riskLevel: z.enum(["low", "medium", "high"]),
    approvalRequired: z.boolean(),
    affectedNodeIds: z.array(z.string()),
    affectedCandidateIds: z.array(z.string()),
    canonicalNodeId: z.string().optional(),
    expectedEffect: z.string().min(1),
    rationale: z.string().optional()
  }))
});

const uniqueSorted = (values: Array<string | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

const summarizeNode = (node: ExperienceNode): HygieneGovernanceNodeSummary => ({
  id: node.id,
  scopeId: node.scope_id,
  nodeType: node.node_type,
  taskType: node.task_type,
  state: node.state,
  deliveryState: node.delivery_state,
  triggerPattern: node.trigger_pattern,
  compactHint: node.compact_hint,
  recommendedSteps: node.recommended_steps ?? [],
  avoidSteps: node.avoid_steps ?? [],
  originRecordIds: node.origin_record_ids,
  helpedRecordIds: node.helped_record_ids,
  harmedRecordIds: node.harmed_record_ids,
  usageCount: node.usage_count,
  helpedCount: node.helped_count,
  harmedCount: node.harmed_count,
  supportCount: node.support_count,
  updatedAt: node.updated_at
});

const summarizeCandidate = (candidate: ExperienceCandidate): HygieneGovernanceCandidateSummary => ({
  id: candidate.id,
  sourceRecordId: candidate.source_record_id,
  taskType: candidate.task_type,
  nodeType: candidate.node_type,
  lifecycleState: candidate.lifecycle_state,
  triggerPattern: candidate.trigger_pattern,
  compactHint: candidate.compact_hint,
  recommendedSteps: candidate.recommended_steps ?? [],
  avoidSteps: candidate.avoid_steps ?? [],
  retryCount: candidate.retry_count,
  updatedAt: candidate.updated_at
});

const summarizeAttribution = (record: AttributionRecord): HygieneGovernanceAttributionSummary => ({
  id: record.id,
  nodeId: record.node_id,
  delivered: record.delivered,
  outcome: record.outcome,
  verdict: record.attribution_verdict,
  confidence: record.confidence,
  evidenceRefs: record.evidence_refs,
  createdAt: record.created_at
});

const normalizeFindingForHash = (finding: HygieneFinding): Record<string, unknown> => ({
  type: finding.type,
  severity: finding.severity,
  affectedNodeIds: uniqueSorted(finding.affectedNodeIds),
  affectedCandidateIds: uniqueSorted(finding.affectedCandidateIds),
  evidenceRefs: uniqueSorted(finding.evidenceRefs)
});

const buildFindingHash = (scopeId: string, findings: HygieneFinding[]): string =>
  stableId(
    "hygiene_findings",
    JSON.stringify({
      scopeId,
      findings: findings
        .map(normalizeFindingForHash)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    })
  );

const compareByRisk = (
  left: Pick<ExperienceNode, "harmed_count" | "helped_count" | "updated_at">,
  right: Pick<ExperienceNode, "harmed_count" | "helped_count" | "updated_at">
): number =>
  (right.harmed_count - left.harmed_count)
  || (right.helped_count - left.helped_count)
  || right.updated_at.localeCompare(left.updated_at);

const buildExportRiskNotes = (
  nodes: ExperienceNode[],
  attributionRecords: AttributionRecord[],
  enabled: boolean
): HygieneGovernanceExportRiskNote[] => {
  if (!enabled) {
    return [];
  }
  const harmfulEvidenceByNode = new Map<string, string[]>();
  for (const record of attributionRecords) {
    if (record.attribution_verdict !== "strong_harmed" && record.attribution_verdict !== "weak_harmed") {
      continue;
    }
    harmfulEvidenceByNode.set(record.node_id, [
      ...(harmfulEvidenceByNode.get(record.node_id) ?? []),
      ...record.evidence_refs
    ]);
  }

  return nodes
    .filter((node) => node.delivery_state === "eligible" && harmfulEvidenceByNode.has(node.id))
    .sort(compareByRisk)
    .map((node) => ({
      nodeId: node.id,
      reason: "eligible guidance has recent harmed attribution",
      evidenceRefs: uniqueSorted([...(harmfulEvidenceByNode.get(node.id) ?? []), ...node.harmed_record_ids])
    }));
};

export const buildHygieneGovernanceInput = (input: BuildHygieneGovernanceInput): HygieneGovernanceInput => {
  const maxFindings = input.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const report = buildHygieneReviewReport({
    nodes: input.nodes,
    candidates: input.candidates,
    attributionRecords: input.attributionRecords,
    filters: {
      scopeId: input.scopeId,
      now: input.now,
      limit: maxFindings
    }
  });
  const findings = report.findings.slice(0, maxFindings);
  const findingNodeIds = new Set(findings.flatMap((finding) => finding.affectedNodeIds));
  const findingCandidateIds = new Set(findings.flatMap((finding) => finding.affectedCandidateIds));
  const nodes = input.nodes
    .filter((node) => node.scope_id === input.scopeId && (findingNodeIds.size === 0 || findingNodeIds.has(node.id)))
    .sort(compareByRisk)
    .slice(0, input.maxNodes ?? DEFAULT_MAX_NODES)
    .map(summarizeNode);
  const candidates = input.candidates
    .filter((candidate) => candidate.scope_id === input.scopeId && (findingCandidateIds.size === 0 || findingCandidateIds.has(candidate.id)))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, input.maxCandidates ?? DEFAULT_MAX_CANDIDATES)
    .map(summarizeCandidate);
  const attributions = input.attributionRecords
    .filter((record) => !findingNodeIds.size || findingNodeIds.has(record.node_id))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, input.maxAttributions ?? DEFAULT_MAX_ATTRIBUTIONS)
    .map(summarizeAttribution);
  const exportRiskNotes = buildExportRiskNotes(input.nodes, input.attributionRecords, input.exportRiskEnabled ?? false);
  const evidenceRefs = uniqueSorted([
    ...findings.flatMap((finding) => finding.evidenceRefs),
    ...nodes.flatMap((node) => [...node.originRecordIds, ...node.helpedRecordIds, ...node.harmedRecordIds]),
    ...candidates.map((candidate) => candidate.sourceRecordId),
    ...attributions.flatMap((record) => record.evidenceRefs),
    ...exportRiskNotes.flatMap((note) => note.evidenceRefs)
  ]);

  return {
    scope: {
      scopeId: input.scopeId,
      scopeName: input.scopeName,
      scopeType: input.scopeType
    },
    generatedAt: report.generatedAt,
    findingHash: buildFindingHash(input.scopeId, findings),
    review: report.summary,
    findings,
    nodes,
    candidates,
    attributions,
    exportRiskNotes,
    evidenceRefs
  };
};

const parseStrictJsonPlan = (raw: string): HygieneGovernancePlan => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid hygiene governance plan JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid hygiene governance plan: ${result.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return result.data;
};

const chooseCanonicalNode = (nodes: HygieneGovernanceNodeSummary[]): HygieneGovernanceNodeSummary =>
  [...nodes].sort(
    (left, right) =>
      (right.helpedCount - left.helpedCount)
      || (right.supportCount - left.supportCount)
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.id.localeCompare(right.id)
  )[0];

const exactDuplicateKey = (node: HygieneGovernanceNodeSummary): string =>
  JSON.stringify({
    taskType: node.taskType,
    nodeType: node.nodeType,
    triggerPattern: node.triggerPattern.trim().toLowerCase(),
    compactHint: node.compactHint.trim().toLowerCase()
  });

const buildDeterministicFallbackPlan = (input: HygieneGovernanceInput): HygieneGovernancePlan => {
  const clusters: HygieneGovernancePlanCluster[] = [];
  const actions: HygieneGovernancePlanAction[] = [];
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const duplicateGroups = new Map<string, HygieneGovernanceNodeSummary[]>();

  for (const node of input.nodes) {
    if (node.deliveryState === "shadow_only") {
      continue;
    }
    const group = duplicateGroups.get(exactDuplicateKey(node)) ?? [];
    group.push(node);
    duplicateGroups.set(exactDuplicateKey(node), group);
  }

  for (const nodes of duplicateGroups.values()) {
    if (nodes.length < 2) {
      continue;
    }
    const sortedIds = uniqueSorted(nodes.map((node) => node.id));
    const canonical = chooseCanonicalNode(nodes);
    const clusterId = stableId("hygiene_cluster", `${input.scope.scopeId}:exact:${sortedIds.join(",")}`);
    clusters.push({
      clusterId,
      type: "duplicate_guidance",
      nodeIds: sortedIds,
      candidateIds: [],
      rationale: "Nodes have identical task type, node type, trigger, and compact hint."
    });
    actions.push({
      actionId: stableId("hygiene_action", `${clusterId}:merge_exact_duplicate:${canonical.id}`),
      actionType: "merge_exact_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: sortedIds,
      affectedCandidateIds: [],
      canonicalNodeId: canonical.id,
      expectedEffect: "Consolidate exact duplicate guidance while preserving evidence on the canonical node.",
      rationale: "Exact duplicate guidance can be safely proposed for automatic merge subject to validators."
    });
  }

  for (const node of input.nodes) {
    if (
      (node.state !== "candidate" && node.state !== "priority_candidate")
      || node.deliveryState !== "shadow_only"
      || node.usageCount > 0
      || node.helpedCount > 0
      || node.supportCount > 0
    ) {
      continue;
    }
    const clusterId = stableId("hygiene_cluster", `${input.scope.scopeId}:stale_shadow:${node.id}`);
    if (!nodesById.has(node.id)) {
      continue;
    }
    clusters.push({
      clusterId,
      type: "stale_shadow",
      nodeIds: [node.id],
      candidateIds: [],
      rationale: "Shadow-only guidance has no usage, helped, or support evidence."
    });
    actions.push({
      actionId: stableId("hygiene_action", `${clusterId}:retire_stale_shadow`),
      actionType: "retire_stale_shadow",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: [node.id],
      affectedCandidateIds: [],
      expectedEffect: "Retire stale shadow-only guidance that has no supporting runtime evidence.",
      rationale: "The action remains subject to stale-retire validators before mutation."
    });
  }

  return {
    source: "deterministic_fallback",
    scopeId: input.scope.scopeId,
    findingHash: input.findingHash,
    clusters,
    actions
  };
};

export const planHygieneGovernance = async (
  input: HygieneGovernanceInput,
  options: { planner?: HygieneGovernancePlannerProvider } = {}
): Promise<HygieneGovernancePlan> => {
  if (!options.planner) {
    return buildDeterministicFallbackPlan(input);
  }
  const plan = parseStrictJsonPlan(await options.planner.plan(input));
  if (plan.scopeId !== input.scope.scopeId || plan.findingHash !== input.findingHash) {
    throw new Error("Invalid hygiene governance plan: scopeId or findingHash does not match the planner input");
  }
  return plan;
};
