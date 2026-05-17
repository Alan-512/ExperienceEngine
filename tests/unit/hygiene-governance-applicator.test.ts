import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyValidatedHygieneGovernanceActions } from "../../src/maintenance/hygiene-governance-applicator.js";
import type { HygieneGovernanceInput, HygieneGovernancePlan } from "../../src/maintenance/hygiene-governance-planner.js";
import { validateHygieneGovernancePlan } from "../../src/maintenance/hygiene-governance-validator.js";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import {
  GovernanceActionRepository,
  GovernanceSnapshotRepository
} from "../../src/store/sqlite/repositories/hygiene-governance-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];
const NOW = "2026-05-17T10:00:00.000Z";

const makeDb = (): DatabaseSync => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-hygiene-applicator-"));
  tempDirs.push(runtimeDir);
  const db = new DatabaseSync(join(runtimeDir, "experienceengine.db"));
  bootstrapDatabase(db);
  return db;
};

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_a",
  node_type: "strategy",
  scope_id: "scope_repo",
  task_type: "test_debug",
  trigger_pattern: "Fix provider config mismatch",
  compact_hint: "Inspect runtime provider config before changing generated config.",
  recommended_steps: ["inspect runtime provider config"],
  avoid_steps: ["edit generated config first"],
  fallback_steps: [],
  success_signal: "provider config test passes",
  evidence_summary: "Recovered provider config mismatch in a prior task.",
  retrieval_text: "Fix provider config mismatch Inspect runtime provider config",
  source_kind: "system_derived",
  origin_record_ids: ["input_a"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 2,
  helped_count: 1,
  harmed_count: 0,
  support_count: 2,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-16T10:00:00.000Z",
  ...overrides
});

const buildInput = (nodes: ExperienceNode[]): HygieneGovernanceInput => ({
  scope: { scopeId: "scope_repo", scopeName: "repo", scopeType: "repo" },
  generatedAt: NOW,
  findingHash: "hygiene_findings_hash",
  review: {
    total: 1,
    byType: {
      stale_experience: 0,
      duplicate_guidance: 1,
      conflicting_guidance: 0,
      over_generalized_guidance: 0,
      evidence_drift: 0
    },
    bySeverity: { high: 0, medium: 1, low: 0 }
  },
  findings: [],
  nodes: nodes.map((node) => ({
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
  })),
  candidates: [],
  attributions: [],
  exportRiskNotes: [],
  evidenceRefs: nodes.flatMap((node) => [
    ...node.origin_record_ids,
    ...node.helped_record_ids,
    ...node.harmed_record_ids
  ])
});

const planWithAction = (action: HygieneGovernancePlan["actions"][number]): HygieneGovernancePlan => ({
  source: "deterministic_fallback",
  scopeId: "scope_repo",
  findingHash: "hygiene_findings_hash",
  clusters: [],
  actions: [action]
});

describe("hygiene governance applicator", () => {
  it("applies exact duplicate merge with preserved evidence, counts, audit rows, and rollback snapshot", () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_canonical",
      origin_record_ids: ["input_a"],
      helped_record_ids: ["input_helped"],
      usage_count: 2,
      helped_count: 1,
      support_count: 2
    }));
    nodeRepo.upsert(makeNode({
      id: "node_duplicate",
      origin_record_ids: ["input_b"],
      helped_record_ids: [],
      usage_count: 1,
      helped_count: 0,
      support_count: 1,
      state: "priority_candidate",
      delivery_state: "conservative_only"
    }));
    const input = buildInput([
      nodeRepo.getById("node_canonical")!,
      nodeRepo.getById("node_duplicate")!
    ]);
    const plan = planWithAction({
      actionId: "action_merge",
      actionType: "merge_exact_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_canonical", "node_duplicate"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_canonical",
      expectedEffect: "Merge exact duplicate guidance."
    });
    const validation = validateHygieneGovernancePlan(input, plan);

    const result = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      runId: "run_1",
      planId: "plan_1",
      now: NOW
    });

    const canonical = nodeRepo.getById("node_canonical")!;
    const duplicate = nodeRepo.getById("node_duplicate")!;
    const action = new GovernanceActionRepository(db).get("action_merge")!;

    expect(result.applied).toEqual(["action_merge"]);
    expect(canonical.origin_record_ids).toEqual(["input_a", "input_b"]);
    expect(canonical.helped_record_ids).toEqual(["input_helped"]);
    expect(canonical.usage_count).toBe(3);
    expect(canonical.support_count).toBe(3);
    expect(duplicate.state).toBe("retired");
    expect(duplicate.delivery_state).toBe("quarantined");
    expect(action).toMatchObject({
      action_id: "action_merge",
      status: "applied",
      run_id: "run_1",
      plan_id: "plan_1"
    });
    expect(action.before_snapshot_id).toBeTruthy();
    expect(Object.keys(action.affected_row_hashes)).toEqual(
      expect.arrayContaining([
        "experience_nodes:id:node_canonical",
        "experience_nodes:id:node_duplicate"
      ])
    );
  });

  it("retires stale shadow-only guidance once and keeps repeated action execution idempotent", () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_shadow",
      state: "candidate",
      delivery_state: "shadow_only",
      usage_count: 0,
      helped_count: 0,
      support_count: 0,
      origin_record_ids: ["input_shadow"],
      updated_at: "2026-01-01T00:00:00.000Z"
    }));
    const input = buildInput([nodeRepo.getById("node_shadow")!]);
    const plan = planWithAction({
      actionId: "action_retire",
      actionType: "retire_stale_shadow",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_shadow"],
      affectedCandidateIds: [],
      expectedEffect: "Retire stale shadow-only guidance."
    });
    const validation = validateHygieneGovernancePlan(input, plan);

    const first = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      now: NOW
    });
    const second = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      now: "2026-05-17T10:01:00.000Z"
    });

    const node = nodeRepo.getById("node_shadow")!;
    const action = new GovernanceActionRepository(db).get("action_retire")!;
    const snapshots = db.prepare("SELECT snapshot_id FROM hygiene_governance_snapshots").all();

    expect(first.applied).toEqual(["action_retire"]);
    expect(second.skipped).toEqual(["action_retire"]);
    expect(node.state).toBe("retired");
    expect(node.delivery_state).toBe("quarantined");
    expect(action.status).toBe("applied");
    expect(snapshots).toHaveLength(1);
    expect(new GovernanceSnapshotRepository(db).get(action.before_snapshot_id!)).toBeTruthy();
  });

  it("applies near-duplicate merge into the narrower canonical node", () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_general",
      origin_record_ids: ["input_general"],
      avoid_steps: [],
      usage_count: 2,
      helped_count: 1,
      support_count: 2
    }));
    nodeRepo.upsert(makeNode({
      id: "node_canary",
      trigger_pattern: "Fix provider config mismatch in OpenRouter canary",
      compact_hint: "Inspect runtime provider config before changing generated config in canary runs.",
      origin_record_ids: ["input_canary"],
      state: "candidate",
      delivery_state: "shadow_only",
      usage_count: 0,
      helped_count: 0,
      support_count: 0
    }));
    const input = buildInput([
      nodeRepo.getById("node_general")!,
      nodeRepo.getById("node_canary")!
    ]);
    const plan = planWithAction({
      actionId: "action_near_merge",
      actionType: "merge_near_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_general", "node_canary"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_canary",
      expectedEffect: "Merge near duplicate into narrower canary guidance."
    });
    const validation = validateHygieneGovernancePlan(input, plan);

    const result = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      runId: "run_2",
      planId: "plan_2",
      now: NOW
    });

    const canonical = nodeRepo.getById("node_canary")!;
    const general = nodeRepo.getById("node_general")!;
    const action = new GovernanceActionRepository(db).get("action_near_merge")!;

    expect(result.applied).toEqual(["action_near_merge"]);
    expect(canonical.trigger_pattern).toBe("Fix provider config mismatch in OpenRouter canary");
    expect(canonical.origin_record_ids).toEqual(["input_canary", "input_general"]);
    expect(canonical.support_count).toBe(2);
    expect(general.state).toBe("retired");
    expect(action.status).toBe("applied");
    expect(action.before_snapshot_id).toBeTruthy();
  });

  it("applies safety downgrade and quarantine with audit snapshots", () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({ id: "node_downgrade", delivery_state: "eligible" }));
    nodeRepo.upsert(makeNode({ id: "node_quarantine", delivery_state: "eligible" }));
    const input = buildInput([
      nodeRepo.getById("node_downgrade")!,
      nodeRepo.getById("node_quarantine")!
    ]);
    input.attributions = [
      {
        id: "attr_weak",
        nodeId: "node_downgrade",
        delivered: true,
        outcome: "failure",
        verdict: "weak_harmed",
        confidence: "medium",
        evidenceRefs: ["input_weak_harmed"],
        createdAt: NOW
      },
      {
        id: "attr_strong",
        nodeId: "node_quarantine",
        delivered: true,
        outcome: "failure",
        verdict: "strong_harmed",
        confidence: "high",
        evidenceRefs: ["input_strong_harmed"],
        createdAt: NOW
      }
    ];
    input.evidenceRefs.push("input_weak_harmed", "input_strong_harmed");
    const plan: HygieneGovernancePlan = {
      source: "deterministic_fallback",
      scopeId: "scope_repo",
      findingHash: "hygiene_findings_hash",
      clusters: [],
      actions: [
        {
          actionId: "action_downgrade",
          actionType: "downgrade_delivery",
          riskLevel: "low",
          approvalRequired: false,
          affectedNodeIds: ["node_downgrade"],
          affectedCandidateIds: [],
          expectedEffect: "Downgrade risky guidance."
        },
        {
          actionId: "action_quarantine",
          actionType: "quarantine",
          riskLevel: "low",
          approvalRequired: false,
          affectedNodeIds: ["node_quarantine"],
          affectedCandidateIds: [],
          expectedEffect: "Quarantine harmful guidance."
        }
      ]
    };
    const validation = validateHygieneGovernancePlan(input, plan);

    const result = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      runId: "run_3",
      planId: "plan_3",
      now: NOW
    });

    expect(result.applied).toEqual(["action_downgrade", "action_quarantine"]);
    expect(nodeRepo.getById("node_downgrade")).toMatchObject({
      state: "active",
      delivery_state: "conservative_only"
    });
    expect(nodeRepo.getById("node_quarantine")).toMatchObject({
      state: "cooling",
      delivery_state: "quarantined",
      quarantined_at: NOW
    });
    expect(new GovernanceActionRepository(db).get("action_downgrade")?.before_snapshot_id).toBeTruthy();
    expect(new GovernanceActionRepository(db).get("action_quarantine")?.before_snapshot_id).toBeTruthy();
  });

  it("applies high-impact promotion as guarded conservative delivery", () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_promote",
      state: "priority_candidate",
      delivery_state: "conservative_only"
    }));
    const input = buildInput([nodeRepo.getById("node_promote")!]);
    const plan = planWithAction({
      actionId: "action_promote",
      actionType: "promote_delivery",
      riskLevel: "high",
      approvalRequired: true,
      affectedNodeIds: ["node_promote"],
      affectedCandidateIds: [],
      expectedEffect: "Promote guidance to eligible delivery."
    });
    const validation = validateHygieneGovernancePlan(input, plan);

    const result = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      runId: "run_approval",
      planId: "plan_approval",
      now: NOW
    });
    const repeated = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      runId: "run_approval",
      planId: "plan_approval",
      now: "2026-05-17T10:01:00.000Z"
    });

    const action = new GovernanceActionRepository(db).get("action_promote")!;
    const approvalRows = db.prepare("SELECT approval_id FROM hygiene_governance_approvals WHERE action_id = ?").all("action_promote");

    expect(result.applied).toEqual([]);
    expect(result.guardedApplied).toEqual(["action_promote"]);
    expect(result.queuedApprovals).toEqual([]);
    expect(repeated.skipped).toEqual(["action_promote"]);
    expect(approvalRows).toHaveLength(0);
    expect(nodeRepo.getById("node_promote")).toMatchObject({
      state: "active",
      delivery_state: "conservative_only"
    });
    expect(action).toMatchObject({
      action_id: "action_promote",
      status: "applied",
      plan_id: "plan_approval",
      run_id: "run_approval"
    });
    expect(Object.keys(action.affected_row_hashes)).toEqual(["experience_nodes:id:node_promote"]);
    expect(action.before_snapshot_id).toBeTruthy();
  });

  it("applies delete records as guarded soft-retire instead of physical deletion", () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({ id: "node_delete" }));
    const input = buildInput([nodeRepo.getById("node_delete")!]);
    const plan = planWithAction({
      actionId: "action_soft_delete",
      actionType: "delete_record",
      riskLevel: "high",
      approvalRequired: false,
      affectedNodeIds: ["node_delete"],
      affectedCandidateIds: [],
      expectedEffect: "Remove stale conflicting guidance from delivery."
    });
    const validation = validateHygieneGovernancePlan(input, plan);

    const result = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      runId: "run_soft_delete",
      planId: "plan_soft_delete",
      now: NOW
    });

    const node = nodeRepo.getById("node_delete");
    const action = new GovernanceActionRepository(db).get("action_soft_delete")!;

    expect(result.guardedApplied).toEqual(["action_soft_delete"]);
    expect(node).toMatchObject({
      state: "retired",
      delivery_state: "quarantined"
    });
    expect(action.status).toBe("applied");
    expect(action.before_snapshot_id).toBeTruthy();
  });

  it("persists rejected non-store actions as rejected instead of pending approval", () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({ id: "node_export" }));
    const input = buildInput([nodeRepo.getById("node_export")!]);
    const plan = planWithAction({
      actionId: "action_export",
      actionType: "export_guidance",
      riskLevel: "high",
      approvalRequired: false,
      affectedNodeIds: ["node_export"],
      affectedCandidateIds: [],
      expectedEffect: "Export guidance to repo instructions."
    });
    const validation = validateHygieneGovernancePlan(input, plan);

    const result = applyValidatedHygieneGovernanceActions(db, {
      input,
      plan,
      validation,
      runId: "run_export",
      planId: "plan_export",
      now: NOW
    });

    const action = new GovernanceActionRepository(db).get("action_export")!;
    const approvalRows = db.prepare("SELECT approval_id FROM hygiene_governance_approvals WHERE action_id = ?").all("action_export");

    expect(result.rejected).toEqual(["action_export"]);
    expect(result.queuedApprovals).toEqual([]);
    expect(approvalRows).toHaveLength(0);
    expect(action.status).toBe("rejected");
    expect(action.before_snapshot_id).toBeUndefined();
  });
});
