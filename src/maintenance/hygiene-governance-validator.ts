import type {
  HygieneGovernanceInput,
  HygieneGovernanceNodeSummary,
  HygieneGovernancePlan,
  HygieneGovernancePlanAction
} from "./hygiene-governance-planner.js";

export type HygieneGovernanceActionDecision = "accept" | "accept_guarded" | "reject";

export type HygieneGovernanceValidatedAction = {
  actionId: string;
  actionType: HygieneGovernancePlanAction["actionType"];
  decision: HygieneGovernanceActionDecision;
  reasonCode: string;
  affectedNodeIds: string[];
};

export type HygieneGovernanceValidationResult = {
  accepted: boolean;
  actions: HygieneGovernanceValidatedAction[];
};

const STALE_SHADOW_MIN_AGE_DAYS = 90;

const sameGuidanceIdentity = (nodes: HygieneGovernanceNodeSummary[]): boolean => {
  if (nodes.length < 2) {
    return false;
  }
  const [first] = nodes;
  return nodes.every(
    (node) =>
      node.taskType === first.taskType
      && node.nodeType === first.nodeType
      && node.triggerPattern.trim().toLowerCase() === first.triggerPattern.trim().toLowerCase()
      && node.compactHint.trim().toLowerCase() === first.compactHint.trim().toLowerCase()
  );
};

const sameMergeFamily = (nodes: HygieneGovernanceNodeSummary[]): boolean => {
  if (nodes.length < 2) {
    return false;
  }
  const [first] = nodes;
  return nodes.every(
    (node) =>
      node.taskType === first.taskType
      && node.nodeType === first.nodeType
  );
};

const hasConflictedEvidence = (nodes: HygieneGovernanceNodeSummary[]): boolean =>
  nodes.some((node) => node.helpedRecordIds.length > 0 || node.helpedCount > 0)
  && nodes.some((node) => node.harmedRecordIds.length > 0 || node.harmedCount > 0);

const hasNoFeedbackHistory = (node: HygieneGovernanceNodeSummary): boolean =>
  node.helpedCount === 0
  && node.harmedCount === 0
  && node.helpedRecordIds.length === 0
  && node.harmedRecordIds.length === 0;

const nodesForAction = (
  input: HygieneGovernanceInput,
  action: HygieneGovernancePlanAction
): HygieneGovernanceNodeSummary[] | undefined => {
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const nodes = action.affectedNodeIds.map((id) => nodesById.get(id));
  return nodes.every(Boolean) ? (nodes as HygieneGovernanceNodeSummary[]) : undefined;
};

const actionCrossesScope = (input: HygieneGovernanceInput, nodes: HygieneGovernanceNodeSummary[]): boolean =>
  nodes.some((node) => node.scopeId !== input.scope.scopeId);

const missingEvidenceRefs = (input: HygieneGovernanceInput, nodes: HygieneGovernanceNodeSummary[]): boolean => {
  const provided = new Set(input.evidenceRefs);
  return nodes
    .flatMap((node) => [...node.originRecordIds, ...node.helpedRecordIds, ...node.harmedRecordIds])
    .some((ref) => !provided.has(ref));
};

const ageDays = (now: string, value: string): number => {
  const nowMs = Date.parse(now);
  const valueMs = Date.parse(value);
  if (!Number.isFinite(nowMs) || !Number.isFinite(valueMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - valueMs) / 86_400_000));
};

const validateExactMerge = (
  input: HygieneGovernanceInput,
  action: HygieneGovernancePlanAction
): HygieneGovernanceValidatedAction => {
  const nodes = nodesForAction(input, action);
  if (!nodes || !action.canonicalNodeId || !action.affectedNodeIds.includes(action.canonicalNodeId)) {
    return reject(action, "missing_or_unknown_merge_node");
  }
  if (actionCrossesScope(input, nodes)) {
    return reject(action, "scope_crossing_action");
  }
  if (missingEvidenceRefs(input, nodes)) {
    return reject(action, "missing_evidence_refs");
  }
  if (!sameGuidanceIdentity(nodes)) {
    return reject(action, "merge_identity_mismatch");
  }
  if (hasConflictedEvidence(nodes)) {
    return guarded(action, "conflicted_helped_harmed_merge_guarded");
  }
  return accept(action, "exact_duplicate_merge_validated");
};

const validateStaleShadowRetire = (
  input: HygieneGovernanceInput,
  action: HygieneGovernancePlanAction
): HygieneGovernanceValidatedAction => {
  const nodes = nodesForAction(input, action);
  if (!nodes || nodes.length !== 1) {
    return reject(action, "missing_or_unknown_stale_shadow_node");
  }
  const [node] = nodes;
  if (
    actionCrossesScope(input, nodes)
    || missingEvidenceRefs(input, nodes)
    || (node.state !== "candidate" && node.state !== "priority_candidate")
    || node.deliveryState !== "shadow_only"
    || node.usageCount > 0
    || node.helpedCount > 0
    || node.supportCount > 0
    || ageDays(input.generatedAt, node.updatedAt) < STALE_SHADOW_MIN_AGE_DAYS
  ) {
    return reject(action, "stale_shadow_retire_criteria_not_met");
  }
  return accept(action, "stale_shadow_retire_validated");
};

const validateNearDuplicateMerge = (
  input: HygieneGovernanceInput,
  action: HygieneGovernancePlanAction
): HygieneGovernanceValidatedAction => {
  const nodes = nodesForAction(input, action);
  if (!nodes || !action.canonicalNodeId || !action.affectedNodeIds.includes(action.canonicalNodeId)) {
    return reject(action, "missing_or_unknown_merge_node");
  }
  if (actionCrossesScope(input, nodes)) {
    return reject(action, "scope_crossing_action");
  }
  if (missingEvidenceRefs(input, nodes)) {
    return reject(action, "missing_evidence_refs");
  }
  if (!sameMergeFamily(nodes)) {
    return reject(action, "merge_identity_mismatch");
  }
  if (!nodes.some((node) => node.deliveryState === "shadow_only" || hasNoFeedbackHistory(node))) {
    return guarded(action, "near_duplicate_merge_guarded");
  }
  if (hasConflictedEvidence(nodes)) {
    return guarded(action, "conflicted_helped_harmed_merge_guarded");
  }
  return accept(action, "near_duplicate_merge_validated");
};

const hasHarmedAttribution = (
  input: HygieneGovernanceInput,
  nodeId: string,
  verdicts: Array<"weak_harmed" | "strong_harmed">
): boolean =>
  input.attributions.some(
    (record) =>
      record.nodeId === nodeId
      && verdicts.includes(record.verdict as "weak_harmed" | "strong_harmed")
      && record.evidenceRefs.every((ref) => input.evidenceRefs.includes(ref))
  );

const validateSafetyAction = (
  input: HygieneGovernanceInput,
  action: HygieneGovernancePlanAction
): HygieneGovernanceValidatedAction => {
  const nodes = nodesForAction(input, action);
  if (!nodes || nodes.length !== 1) {
    return reject(action, "missing_or_unknown_safety_node");
  }
  if (actionCrossesScope(input, nodes) || missingEvidenceRefs(input, nodes)) {
    return reject(action, actionCrossesScope(input, nodes) ? "scope_crossing_action" : "missing_evidence_refs");
  }
  const [node] = nodes;
  if (action.actionType === "downgrade_delivery") {
    if (node.deliveryState !== "eligible" || !hasHarmedAttribution(input, node.id, ["weak_harmed", "strong_harmed"])) {
      return reject(action, "safety_downgrade_criteria_not_met");
    }
    return accept(action, "safety_delivery_downgrade_validated");
  }
  if (action.actionType === "quarantine") {
    if (
      (node.deliveryState !== "eligible" && node.deliveryState !== "conservative_only")
      || !hasHarmedAttribution(input, node.id, ["strong_harmed"])
    ) {
      return reject(action, "safety_quarantine_criteria_not_met");
    }
    return accept(action, "safety_quarantine_validated");
  }
  return reject(action, "unsupported_safety_action");
};

const accept = (
  action: HygieneGovernancePlanAction,
  reasonCode: string
): HygieneGovernanceValidatedAction => ({
  actionId: action.actionId,
  actionType: action.actionType,
  decision: "accept",
  reasonCode,
  affectedNodeIds: action.affectedNodeIds
});

const reject = (
  action: HygieneGovernancePlanAction,
  reasonCode: string
): HygieneGovernanceValidatedAction => ({
  actionId: action.actionId,
  actionType: action.actionType,
  decision: "reject",
  reasonCode,
  affectedNodeIds: action.affectedNodeIds
});

const guarded = (
  action: HygieneGovernancePlanAction,
  reasonCode: string
): HygieneGovernanceValidatedAction => ({
  actionId: action.actionId,
  actionType: action.actionType,
  decision: "accept_guarded",
  reasonCode,
  affectedNodeIds: action.affectedNodeIds
});

const validateGuardedNodeAction = (
  input: HygieneGovernanceInput,
  action: HygieneGovernancePlanAction
): HygieneGovernanceValidatedAction => {
  const nodes = nodesForAction(input, action);
  if (!nodes || nodes.length < 1) {
    return reject(action, "missing_or_unknown_guarded_node");
  }
  if (actionCrossesScope(input, nodes) || missingEvidenceRefs(input, nodes)) {
    return reject(action, actionCrossesScope(input, nodes) ? "scope_crossing_action" : "missing_evidence_refs");
  }
  if (action.actionType === "promote_delivery") {
    return guarded(action, "promotion_guarded_to_conservative_delivery");
  }
  if (action.actionType === "delete_record") {
    return guarded(action, "delete_record_guarded_soft_retire");
  }
  return reject(action, "unsupported_guarded_action");
};

const validateAction = (
  input: HygieneGovernanceInput,
  action: HygieneGovernancePlanAction
): HygieneGovernanceValidatedAction => {
  if (
    (action.actionType === "downgrade_delivery" || action.actionType === "quarantine")
    && action.affectedNodeIds.length !== 1
  ) {
    return reject(action, "safety_action_requires_single_node");
  }
  if (
    (action.actionType === "merge_exact_duplicate" || action.actionType === "merge_near_duplicate")
    && action.affectedNodeIds.length < 2
  ) {
    return reject(action, "merge_requires_multiple_nodes");
  }
  switch (action.actionType) {
    case "merge_exact_duplicate":
      return validateExactMerge(input, action);
    case "retire_stale_shadow":
      return validateStaleShadowRetire(input, action);
    case "merge_near_duplicate":
      return validateNearDuplicateMerge(input, action);
    case "downgrade_delivery":
    case "quarantine":
      return validateSafetyAction(input, action);
    case "promote_delivery":
    case "delete_record":
      return validateGuardedNodeAction(input, action);
    case "rewrite_guidance":
      return reject(action, "rewrite_requires_replacement_contract");
    case "export_guidance":
    case "change_repo_policy":
    case "restore_guidance":
      return reject(action, "non_experience_store_action_not_auto_governed");
    default:
      return reject(action, "unsupported_automatic_action");
  }
};

export const validateHygieneGovernancePlan = (
  input: HygieneGovernanceInput,
  plan: HygieneGovernancePlan
): HygieneGovernanceValidationResult => {
  if (plan.scopeId !== input.scope.scopeId || plan.findingHash !== input.findingHash) {
    const actions = plan.actions.map((action) => reject(action, "plan_scope_or_hash_mismatch"));
    return { accepted: false, actions };
  }

  const actions = plan.actions.map((action) => validateAction(input, action));
  return {
    accepted: actions.length > 0 && actions.every((action) => action.decision === "accept" || action.decision === "accept_guarded"),
    actions
  };
};
