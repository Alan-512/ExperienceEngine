import type { DatabaseSync } from "node:sqlite";
import type {
  HygieneGovernanceInput,
  HygieneGovernancePlan,
  HygieneGovernancePlanAction
} from "./hygiene-governance-planner.js";
import type { HygieneGovernanceValidationResult } from "./hygiene-governance-validator.js";
import {
  GovernanceActionRepository,
  applyGovernanceActionWithSnapshot,
  computeGovernanceRowHashes,
  type GovernanceAction,
  type SnapshotRowRef
} from "../store/sqlite/repositories/hygiene-governance-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../types/domain.js";

export type HygieneGovernanceApplyResult = {
  applied: string[];
  guardedApplied: string[];
  skipped: string[];
  rejected: string[];
  queuedApprovals: string[];
};

type ApplyInput = {
  input: HygieneGovernanceInput;
  plan: HygieneGovernancePlan;
  validation: HygieneGovernanceValidationResult;
  runId?: string;
  planId?: string;
  now: string;
  maxActions?: number;
};

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort();

const maxIso = (values: Array<string | undefined>): string | undefined =>
  values.filter((value): value is string => Boolean(value)).sort().at(-1);

const nodeRowRef = (nodeId: string): SnapshotRowRef => ({
  table: "experience_nodes",
  primaryKeyColumn: "id",
  primaryKeyValue: nodeId
});

const candidateRowRef = (candidateId: string): SnapshotRowRef => ({
  table: "experience_candidates",
  primaryKeyColumn: "id",
  primaryKeyValue: candidateId
});

const mergeExactDuplicate = (
  nodeRepo: NodeRepository,
  action: HygieneGovernancePlanAction,
  now: string,
  guarded: boolean
): Record<string, unknown> => {
  const canonicalId = action.canonicalNodeId;
  if (!canonicalId) {
    throw new Error(`Cannot apply ${action.actionId}: missing canonical node`);
  }
  const nodes = action.affectedNodeIds.map((id) => nodeRepo.getById(id));
  if (nodes.some((node) => !node)) {
    throw new Error(`Cannot apply ${action.actionId}: affected node missing`);
  }
  const resolvedNodes = nodes as ExperienceNode[];
  const canonical = resolvedNodes.find((node) => node.id === canonicalId);
  if (!canonical) {
    throw new Error(`Cannot apply ${action.actionId}: canonical node missing`);
  }
  const merged: ExperienceNode = {
    ...canonical,
    origin_record_ids: unique(resolvedNodes.flatMap((node) => node.origin_record_ids)),
    helped_record_ids: unique(resolvedNodes.flatMap((node) => node.helped_record_ids)),
    harmed_record_ids: unique(resolvedNodes.flatMap((node) => node.harmed_record_ids)),
    usage_count: resolvedNodes.reduce((sum, node) => sum + node.usage_count, 0),
    helped_count: resolvedNodes.reduce((sum, node) => sum + node.helped_count, 0),
    harmed_count: resolvedNodes.reduce((sum, node) => sum + node.harmed_count, 0),
    support_count: resolvedNodes.reduce((sum, node) => sum + node.support_count, 0),
    last_used_at: maxIso(resolvedNodes.map((node) => node.last_used_at)),
    last_helped_at: maxIso(resolvedNodes.map((node) => node.last_helped_at)),
    last_harmed_at: maxIso(resolvedNodes.map((node) => node.last_harmed_at)),
    delivery_state: guarded && canonical.delivery_state === "eligible" ? "conservative_only" : canonical.delivery_state,
    merge_decision: "UPDATE",
    merge_reason: guarded
      ? `Guarded autonomous hygiene merge from ${action.affectedNodeIds.join(",")}.`
      : `Autonomous hygiene exact duplicate merge from ${action.affectedNodeIds.join(",")}.`,
    updated_at: now
  };
  nodeRepo.upsert(merged);

  for (const node of resolvedNodes) {
    if (node.id === canonicalId) {
      continue;
    }
    nodeRepo.upsert({
      ...node,
      state: "retired",
      delivery_state: "quarantined",
      merge_decision: "UPDATE",
      merge_reason: `Merged into ${canonicalId} by autonomous hygiene governance.`,
      updated_at: now
    });
  }

  return {
    canonicalNodeId: canonicalId,
    retiredNodeIds: action.affectedNodeIds.filter((id) => id !== canonicalId),
    guarded
  };
};

const retireStaleShadow = (
  nodeRepo: NodeRepository,
  action: HygieneGovernancePlanAction,
  now: string
): Record<string, unknown> => {
  const nodeId = action.affectedNodeIds[0];
  const node = nodeRepo.getById(nodeId);
  if (!node) {
    throw new Error(`Cannot apply ${action.actionId}: affected node missing`);
  }
  nodeRepo.upsert({
    ...node,
    state: "retired",
    delivery_state: "quarantined",
    merge_decision: "NONE",
    merge_reason: "Retired stale shadow-only guidance by autonomous hygiene governance.",
    updated_at: now
  });
  return { retiredNodeId: nodeId };
};

const downgradeDelivery = (
  nodeRepo: NodeRepository,
  action: HygieneGovernancePlanAction,
  now: string
): Record<string, unknown> => {
  const nodeId = action.affectedNodeIds[0];
  const node = nodeRepo.getById(nodeId);
  if (!node) {
    throw new Error(`Cannot apply ${action.actionId}: affected node missing`);
  }
  nodeRepo.upsert({
    ...node,
    delivery_state: "conservative_only",
    merge_decision: "NONE",
    merge_reason: "Downgraded delivery by autonomous hygiene governance after harmed attribution.",
    updated_at: now
  });
  return { downgradedNodeId: nodeId, deliveryState: "conservative_only" };
};

const quarantineNode = (
  nodeRepo: NodeRepository,
  action: HygieneGovernancePlanAction,
  now: string
): Record<string, unknown> => {
  const nodeId = action.affectedNodeIds[0];
  const node = nodeRepo.getById(nodeId);
  if (!node) {
    throw new Error(`Cannot apply ${action.actionId}: affected node missing`);
  }
  nodeRepo.upsert({
    ...node,
    state: "cooling",
    delivery_state: "quarantined",
    quarantined_at: now,
    quarantine_reason: "Autonomous hygiene governance observed strong harmed attribution.",
    merge_decision: "NONE",
    merge_reason: "Quarantined by autonomous hygiene governance after strong harmed attribution.",
    updated_at: now
  });
  return { quarantinedNodeId: nodeId };
};

const promoteDeliveryGuarded = (
  nodeRepo: NodeRepository,
  action: HygieneGovernancePlanAction,
  now: string
): Record<string, unknown> => {
  const promoted: string[] = [];
  for (const nodeId of action.affectedNodeIds) {
    const node = nodeRepo.getById(nodeId);
    if (!node) {
      throw new Error(`Cannot apply ${action.actionId}: affected node missing`);
    }
    nodeRepo.upsert({
      ...node,
      state: "active",
      delivery_state: "conservative_only",
      merge_decision: "NONE",
      merge_reason: "Guarded autonomous hygiene promotion to conservative delivery.",
      updated_at: now
    });
    promoted.push(nodeId);
  }
  return { promotedNodeIds: promoted, deliveryState: "conservative_only", guarded: true };
};

const softRetireRecords = (
  nodeRepo: NodeRepository,
  action: HygieneGovernancePlanAction,
  now: string
): Record<string, unknown> => {
  const retired: string[] = [];
  for (const nodeId of action.affectedNodeIds) {
    const node = nodeRepo.getById(nodeId);
    if (!node) {
      throw new Error(`Cannot apply ${action.actionId}: affected node missing`);
    }
    nodeRepo.upsert({
      ...node,
      state: "retired",
      delivery_state: "quarantined",
      merge_decision: "NONE",
      merge_reason: "Guarded autonomous hygiene soft-retire; row retained for rollback and audit.",
      updated_at: now
    });
    retired.push(nodeId);
  }
  return { retiredNodeIds: retired, guarded: true };
};

const ensurePendingAction = (
  db: DatabaseSync,
  repo: GovernanceActionRepository,
  action: HygieneGovernancePlanAction,
  input: ApplyInput,
  validatorDecision: Record<string, unknown>,
  rows: SnapshotRowRef[]
): GovernanceAction => {
  const existing = repo.get(action.actionId);
  if (existing) {
    return existing;
  }
  const decision = typeof validatorDecision.decision === "string" ? validatorDecision.decision : "reject";
  return repo.create({
    action_id: action.actionId,
    plan_id: input.planId,
    run_id: input.runId,
    scope_id: input.input.scope.scopeId,
    action_type: action.actionType,
    status: decision === "accept" || decision === "accept_guarded" ? "pending" : "rejected",
    affected_ids: [...action.affectedNodeIds, ...action.affectedCandidateIds],
    affected_row_hashes: computeGovernanceRowHashes(db, rows),
    action: action as unknown as Record<string, unknown>,
    validator_decision: validatorDecision,
    created_at: input.now,
    updated_at: input.now
  });
};

export const applyValidatedHygieneGovernanceActions = (
  db: DatabaseSync,
  input: ApplyInput
): HygieneGovernanceApplyResult => {
  const actionRepo = new GovernanceActionRepository(db);
  const nodeRepo = new NodeRepository(db);
  const validationByActionId = new Map(input.validation.actions.map((action) => [action.actionId, action]));
  const result: HygieneGovernanceApplyResult = { applied: [], guardedApplied: [], skipped: [], rejected: [], queuedApprovals: [] };
  const budget = input.maxActions ?? input.plan.actions.length;

  for (const action of input.plan.actions) {
    if (result.applied.length + result.guardedApplied.length >= budget) {
      break;
    }
    const validatorDecision = validationByActionId.get(action.actionId);
    if (!validatorDecision) {
      result.rejected.push(action.actionId);
      continue;
    }
    const affectedRows = [
      ...action.affectedNodeIds.map(nodeRowRef),
      ...action.affectedCandidateIds.map(candidateRowRef)
    ];
    const stored = ensurePendingAction(db, actionRepo, action, input, validatorDecision, affectedRows);
    if (validatorDecision.decision !== "accept" && validatorDecision.decision !== "accept_guarded") {
      db.prepare(
        `UPDATE hygiene_governance_actions
         SET status = 'rejected', validator_decision_json = ?, updated_at = ?
         WHERE action_id = ? AND status != 'applied'`
      ).run(JSON.stringify(validatorDecision), input.now, action.actionId);
      result.rejected.push(action.actionId);
      continue;
    }
    if (stored.status === "applied") {
      result.skipped.push(action.actionId);
      continue;
    }
    if (stored.status !== "pending") {
      result.rejected.push(action.actionId);
      continue;
    }

    applyGovernanceActionWithSnapshot(db, {
      actionId: action.actionId,
      scopeId: input.input.scope.scopeId,
      rows: affectedRows,
      now: input.now,
      apply: () => {
        const guarded = validatorDecision.decision === "accept_guarded";
        switch (action.actionType) {
          case "merge_exact_duplicate":
          case "merge_near_duplicate":
            return mergeExactDuplicate(nodeRepo, action, input.now, guarded);
          case "retire_stale_shadow":
            return retireStaleShadow(nodeRepo, action, input.now);
          case "downgrade_delivery":
            return downgradeDelivery(nodeRepo, action, input.now);
          case "quarantine":
            return quarantineNode(nodeRepo, action, input.now);
          case "promote_delivery":
            return promoteDeliveryGuarded(nodeRepo, action, input.now);
          case "delete_record":
            return softRetireRecords(nodeRepo, action, input.now);
          default:
            throw new Error(`Unsupported automatic hygiene governance action: ${action.actionType}`);
        }
      }
    });
    if (validatorDecision.decision === "accept_guarded") {
      result.guardedApplied.push(action.actionId);
    } else {
      result.applied.push(action.actionId);
    }
  }

  return result;
};
