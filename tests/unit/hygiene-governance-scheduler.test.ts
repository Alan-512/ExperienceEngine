import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  drainDueHygieneGovernance,
  HygieneGovernanceScheduler,
  type GovernanceDrainWorker
} from "../../src/maintenance/hygiene-governance-scheduler.js";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import {
  GovernanceActionRepository,
  GovernanceLeaseRepository,
  GovernancePlanRepository,
  GovernanceScheduleRepository
} from "../../src/store/sqlite/repositories/hygiene-governance-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeDb = (): DatabaseSync => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-hygiene-scheduler-"));
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
  avoid_steps: [],
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
  usage_count: 1,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-15T00:00:00.000Z",
  ...overrides
});

describe("HygieneGovernanceScheduler", () => {
  it("canonicalizes Windows and WSL paths before schedule writes", () => {
    const db = makeDb();
    const scheduler = new HygieneGovernanceScheduler(db, {
      now: () => "2026-05-16T10:00:00.000Z",
      intervalMs: 86_400_000
    });

    const windows = scheduler.maybeEnqueue({
      cwd: "D:\\project\\ExperienceEngine",
      trigger: "host_startup",
      findingHash: "hash-a"
    });
    const wsl = scheduler.maybeEnqueue({
      cwd: "/mnt/d/project/ExperienceEngine",
      trigger: "prompt_lookup",
      findingHash: "hash-a"
    });

    const schedules = db.prepare("SELECT scope_id FROM hygiene_governance_schedules").all() as Array<{ scope_id: string }>;
    expect(windows.scopeId).toBe(wsl.scopeId);
    expect(schedules).toHaveLength(1);
    expect(wsl.enqueued).toBe(false);
    expect(wsl.reason).toBe("not_due");
  });

  it("drains only after acquiring the per-scope lease", async () => {
    const db = makeDb();
    const calls: string[] = [];
    const worker: GovernanceDrainWorker = {
      drain: async ({ scopeId }) => {
        calls.push(scopeId);
        return { status: "completed" };
      }
    };
    const scheduler = new HygieneGovernanceScheduler(db, {
      now: () => "2026-05-16T10:00:00.000Z",
      intervalMs: 86_400_000,
      leaseTtlMs: 60_000,
      hostInstanceId: "codex-a",
      worker
    });
    new GovernanceScheduleRepository(db).maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "host_startup",
      now: "2026-05-16T09:59:00.000Z",
      intervalMs: 1,
      findingHash: "hash-a"
    });
    new GovernanceLeaseRepository(db).acquire({
      scopeId: "scope_repo",
      owner: "claude-b",
      now: "2026-05-16T09:59:30.000Z",
      ttlMs: 60_000
    });

    const result = await scheduler.drainDueScope("scope_repo");

    expect(result).toMatchObject({ status: "deferred", reason: "lease_held" });
    expect(calls).toEqual([]);
  });

  it("sets backoff when the worker fails", async () => {
    const db = makeDb();
    const scheduler = new HygieneGovernanceScheduler(db, {
      now: () => "2026-05-16T10:00:00.000Z",
      intervalMs: 86_400_000,
      backoffMs: 3_600_000,
      worker: {
        drain: async () => {
          throw new Error("planner unavailable");
        }
      }
    });
    new GovernanceScheduleRepository(db).maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "host_startup",
      now: "2026-05-16T09:59:00.000Z",
      intervalMs: 1,
      findingHash: "hash-a"
    });

    const result = await scheduler.drainDueScope("scope_repo");

    expect(result).toMatchObject({ status: "failed", failureClass: "worker_error" });
    expect(new GovernanceScheduleRepository(db).get("scope_repo")).toMatchObject({
      last_run_status: "failed",
      last_failure_class: "worker_error",
      backoff_until: "2026-05-16T11:00:00.000Z"
    });
  });

  it("records checkpoint state when worker exhausts budget", async () => {
    const db = makeDb();
    const scheduler = new HygieneGovernanceScheduler(db, {
      now: () => "2026-05-16T10:00:00.000Z",
      intervalMs: 86_400_000,
      maxActions: 2,
      maxRuntimeMs: 250,
      worker: {
        drain: async ({ budget }) => ({
          status: "checkpointed",
          checkpoint: { nextActionOffset: budget.maxActions }
        })
      }
    });
    new GovernanceScheduleRepository(db).maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "host_startup",
      now: "2026-05-16T09:59:00.000Z",
      intervalMs: 1,
      findingHash: "hash-a"
    });

    const result = await scheduler.drainDueScope("scope_repo");
    const run = db.prepare("SELECT status, checkpoint_json FROM hygiene_governance_runs LIMIT 1").get() as {
      status: string;
      checkpoint_json: string;
    };

    expect(result).toMatchObject({ status: "checkpointed" });
    expect(run.status).toBe("pending");
    expect(JSON.parse(run.checkpoint_json)).toEqual({ nextActionOffset: 2 });
  });

  it("uses the same scheduler path from the keeper entrypoint", async () => {
    const db = makeDb();
    const calls: string[] = [];
    new GovernanceScheduleRepository(db).maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "keeper",
      now: "2026-05-16T09:59:00.000Z",
      intervalMs: 1,
      findingHash: "hash-a"
    });

    const result = await drainDueHygieneGovernance(db, {
      scopeId: "scope_repo",
      now: () => "2026-05-16T10:00:00.000Z",
      worker: {
        drain: async ({ scopeId }) => {
          calls.push(scopeId);
          return { status: "completed" };
        }
      }
    });

    expect(result).toMatchObject({ status: "completed" });
    expect(calls).toEqual(["scope_repo"]);
  });

  it("uses the default worker to plan, validate, and apply due governance", async () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_canonical",
      helped_record_ids: ["input_helped"],
      helped_count: 1,
      support_count: 2
    }));
    nodeRepo.upsert(makeNode({
      id: "node_duplicate",
      origin_record_ids: ["input_b"],
      state: "priority_candidate",
      delivery_state: "conservative_only"
    }));
    new GovernanceScheduleRepository(db).maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "keeper",
      now: "2026-05-17T09:59:00.000Z",
      intervalMs: 1,
      findingHash: "stale-hash"
    });

    const result = await drainDueHygieneGovernance(db, {
      scopeId: "scope_repo",
      now: () => "2026-05-17T10:00:00.000Z",
      maxActions: 5
    });

    const duplicate = nodeRepo.getById("node_duplicate")!;
    const plan = new GovernancePlanRepository(db).findReusableCompletedPlan(
      "scope_repo",
      new GovernanceScheduleRepository(db).get("scope_repo")!.last_finding_hash!
    );
    const actions = db.prepare("SELECT action_id FROM hygiene_governance_actions WHERE status = 'applied'").all() as Array<{ action_id: string }>;

    expect(result).toMatchObject({ status: "completed" });
    expect(duplicate.state).toBe("retired");
    expect(plan).toMatchObject({ status: "completed" });
    expect(actions.map((row) => row.action_id)).toHaveLength(1);
    expect(new GovernanceActionRepository(db).get(actions[0].action_id)?.before_snapshot_id).toBeTruthy();
  });

  it("uses an injected LLM planner in the default worker before validation and application", async () => {
    const db = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_canonical",
      helped_record_ids: ["input_helped"],
      helped_count: 1,
      support_count: 2
    }));
    nodeRepo.upsert(makeNode({
      id: "node_duplicate",
      origin_record_ids: ["input_b"],
      state: "priority_candidate",
      delivery_state: "conservative_only"
    }));
    new GovernanceScheduleRepository(db).maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "keeper",
      now: "2026-05-17T09:59:00.000Z",
      intervalMs: 1,
      findingHash: "stale-hash"
    });

    const result = await drainDueHygieneGovernance(db, {
      scopeId: "scope_repo",
      now: () => "2026-05-17T10:00:00.000Z",
      maxActions: 5,
      planner: {
        plan: async (input) => JSON.stringify({
          source: "llm",
          scopeId: input.scope.scopeId,
          findingHash: input.findingHash,
          clusters: [
            {
              clusterId: "cluster_llm_duplicate",
              type: "duplicate_guidance",
              nodeIds: ["node_canonical", "node_duplicate"],
              candidateIds: [],
              rationale: "LLM grouped the duplicate nodes."
            }
          ],
          actions: [
            {
              actionId: "action_llm_merge",
              actionType: "merge_exact_duplicate",
              riskLevel: "low",
              approvalRequired: false,
              affectedNodeIds: ["node_canonical", "node_duplicate"],
              affectedCandidateIds: [],
              canonicalNodeId: "node_canonical",
              expectedEffect: "Merge duplicate nodes while preserving evidence."
            }
          ]
        })
      }
    });

    const duplicate = nodeRepo.getById("node_duplicate")!;
    const planRows = db.prepare("SELECT plan_json FROM hygiene_governance_plans").all() as Array<{ plan_json: string }>;

    expect(result).toMatchObject({ status: "completed" });
    expect(duplicate.state).toBe("retired");
    expect(JSON.parse(planRows[0].plan_json)).toMatchObject({ source: "llm" });
  });
});
