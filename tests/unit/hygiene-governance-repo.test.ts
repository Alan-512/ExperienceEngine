import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import {
  GovernanceActionRepository,
  GovernanceLeaseRepository,
  GovernancePlanRepository,
  GovernanceApprovalRepository,
  GovernanceRunRepository,
  GovernanceScheduleRepository,
  GovernanceSnapshotRepository,
  applyGovernanceActionWithSnapshot,
  rollbackGovernanceSnapshot
} from "../../src/store/sqlite/repositories/hygiene-governance-repo.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeDb = (): DatabaseSync => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-hygiene-governance-"));
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

describe("autonomous hygiene governance schema", () => {
  it("creates governance storage tables during bootstrap", () => {
    const db = makeDb();
    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    const tables = new Set(tableRows.map((row) => row.name));

    expect(tables).toContain("hygiene_governance_schedules");
    expect(tables).toContain("hygiene_governance_runs");
    expect(tables).toContain("hygiene_governance_plans");
    expect(tables).toContain("hygiene_governance_actions");
    expect(tables).toContain("hygiene_governance_approvals");
    expect(tables).toContain("hygiene_governance_leases");
    expect(tables).toContain("hygiene_governance_snapshots");
  });
});

describe("GovernanceScheduleRepository", () => {
  it("returns due once and then keeps repeated host events as cheap checks until next due time", () => {
    const repo = new GovernanceScheduleRepository(makeDb());
    const first = repo.maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "host_startup",
      now: "2026-05-16T10:00:00.000Z",
      intervalMs: 86_400_000,
      findingHash: "hash-a"
    });
    const second = repo.maybeEnqueue({
      scopeId: "scope_repo",
      trigger: "prompt_lookup",
      now: "2026-05-16T10:01:00.000Z",
      intervalMs: 86_400_000,
      findingHash: "hash-a"
    });

    expect(first.enqueued).toBe(true);
    expect(second).toMatchObject({
      enqueued: false,
      reason: "not_due"
    });
    expect(repo.get("scope_repo")).toMatchObject({
      scope_id: "scope_repo",
      next_due_at: "2026-05-17T10:00:00.000Z",
      pending_reasons: ["host_startup"],
      last_finding_hash: "hash-a"
    });
  });

  it("records failure backoff and refuses drain before backoff expires", () => {
    const repo = new GovernanceScheduleRepository(makeDb());
    repo.recordFailure({
      scopeId: "scope_repo",
      failureClass: "llm_provider",
      now: "2026-05-16T10:00:00.000Z",
      backoffMs: 3_600_000
    });

    expect(
      repo.maybeEnqueue({
        scopeId: "scope_repo",
        trigger: "host_startup",
        now: "2026-05-16T10:05:00.000Z",
        intervalMs: 86_400_000,
        findingHash: "hash-a"
      })
    ).toMatchObject({
      enqueued: false,
      reason: "backoff"
    });
  });
});

describe("GovernanceLeaseRepository", () => {
  it("allows only one active lease and lets a later host acquire after expiry", () => {
    const repo = new GovernanceLeaseRepository(makeDb());

    expect(
      repo.acquire({
        scopeId: "scope_repo",
        owner: "codex-a",
        now: "2026-05-16T10:00:00.000Z",
        ttlMs: 60_000
      })?.lease_owner
    ).toBe("codex-a");

    expect(
      repo.acquire({
        scopeId: "scope_repo",
        owner: "claude-b",
        now: "2026-05-16T10:00:30.000Z",
        ttlMs: 60_000
      })
    ).toBeUndefined();

    expect(
      repo.acquire({
        scopeId: "scope_repo",
        owner: "claude-b",
        now: "2026-05-16T10:01:01.000Z",
        ttlMs: 60_000
      })?.lease_owner
    ).toBe("claude-b");
  });
});

describe("governance run, action, and snapshot repositories", () => {
  it("applies an action in one transaction with before snapshot and after state audit", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO scopes (scope_id, scope_type, scope_name, root_path, is_disabled, created_at, updated_at)
      VALUES ('scope_repo', 'workspace', 'Repo', '/repo', 0, '2026-05-16T10:00:00.000Z', '2026-05-16T10:00:00.000Z')
    `);
    const action = new GovernanceActionRepository(db).create({
      scope_id: "scope_repo",
      action_type: "rename_scope",
      status: "pending",
      action: { scopeName: "Renamed" },
      affected_ids: ["scope_repo"],
      affected_row_hashes: {},
      created_at: "2026-05-16T10:00:01.000Z",
      updated_at: "2026-05-16T10:00:01.000Z"
    });

    const result = applyGovernanceActionWithSnapshot(db, {
      actionId: action.action_id,
      scopeId: "scope_repo",
      rows: [{ table: "scopes", primaryKeyColumn: "scope_id", primaryKeyValue: "scope_repo" }],
      now: "2026-05-16T10:00:02.000Z",
      apply: () => {
        db.prepare("UPDATE scopes SET scope_name = 'Renamed' WHERE scope_id = 'scope_repo'").run();
        return { renamed: true };
      }
    });

    const row = db.prepare("SELECT scope_name FROM scopes WHERE scope_id = 'scope_repo'").get() as { scope_name: string };
    const storedAction = db.prepare("SELECT status, before_snapshot_id, after_state_json FROM hygiene_governance_actions WHERE action_id = ?").get(action.action_id) as {
      status: string;
      before_snapshot_id: string;
      after_state_json: string;
    };

    expect(row.scope_name).toBe("Renamed");
    expect(result.snapshot_id).toBe(storedAction.before_snapshot_id);
    expect(storedAction.status).toBe("applied");
    expect(JSON.parse(storedAction.after_state_json)).toEqual({ renamed: true });
  });

  it("stores governance plans and approval records with affected row hashes", () => {
    const db = makeDb();
    const planRepo = new GovernancePlanRepository(db);
    const approvalRepo = new GovernanceApprovalRepository(db);

    const plan = planRepo.create({
      scope_id: "scope_repo",
      status: "proposed",
      finding_hash: "hash-a",
      risk: "high",
      plan: { clusterId: "cluster_1", actions: [] },
      validator_result: { accepted: false },
      created_at: "2026-05-16T10:00:00.000Z",
      updated_at: "2026-05-16T10:00:00.000Z"
    });
    const approval = approvalRepo.create({
      action_id: "action_1",
      plan_id: plan.plan_id,
      scope_id: "scope_repo",
      status: "pending",
      confirmation_token_hash: "token-hash",
      token_expires_at: "2026-05-16T10:05:00.000Z",
      diff_summary: "Downgrade risky node",
      affected_row_hashes: { "experience_nodes:id:node_1": "hash-1" },
      created_at: "2026-05-16T10:00:01.000Z",
      updated_at: "2026-05-16T10:00:01.000Z"
    });

    expect(planRepo.get(plan.plan_id)).toMatchObject({
      plan_id: plan.plan_id,
      scope_id: "scope_repo",
      status: "proposed",
      plan: { clusterId: "cluster_1", actions: [] }
    });
    expect(approvalRepo.get(approval.approval_id)).toMatchObject({
      approval_id: approval.approval_id,
      action_id: "action_1",
      status: "pending",
      affected_row_hashes: { "experience_nodes:id:node_1": "hash-1" }
    });
  });

  it("finds a reusable completed plan for an unchanged hygiene finding hash", () => {
    const db = makeDb();
    const planRepo = new GovernancePlanRepository(db);
    planRepo.create({
      plan_id: "plan_old",
      run_id: "run_old",
      scope_id: "scope_repo",
      status: "completed",
      finding_hash: "hash-a",
      risk: "low",
      plan: { actions: [] },
      created_at: "2026-05-16T09:00:00.000Z",
      updated_at: "2026-05-16T09:00:00.000Z"
    });
    planRepo.create({
      plan_id: "plan_new",
      run_id: "run_new",
      scope_id: "scope_repo",
      status: "completed",
      finding_hash: "hash-a",
      risk: "low",
      plan: { actions: [{ actionId: "action_new" }] },
      created_at: "2026-05-16T10:00:00.000Z",
      updated_at: "2026-05-16T10:00:00.000Z"
    });
    planRepo.create({
      plan_id: "plan_pending",
      run_id: "run_pending",
      scope_id: "scope_repo",
      status: "pending",
      finding_hash: "hash-a",
      risk: "low",
      plan: { actions: [{ actionId: "action_pending" }] },
      created_at: "2026-05-16T11:00:00.000Z",
      updated_at: "2026-05-16T11:00:00.000Z"
    });

    expect(planRepo.findReusableCompletedPlan("scope_repo", "hash-a")).toMatchObject({
      plan_id: "plan_new",
      finding_hash: "hash-a"
    });
    expect(planRepo.findReusableCompletedPlan("scope_repo", "hash-b")).toBeUndefined();
  });

  it("records run/action audit rows and prevents blind rollback when affected rows changed", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO scopes (scope_id, scope_type, scope_name, root_path, is_disabled, created_at, updated_at)
      VALUES ('scope_repo', 'workspace', 'Repo', '/repo', 0, '2026-05-16T10:00:00.000Z', '2026-05-16T10:00:00.000Z')
    `);
    const runRepo = new GovernanceRunRepository(db);
    const actionRepo = new GovernanceActionRepository(db);
    const snapshotRepo = new GovernanceSnapshotRepository(db);
    const run = runRepo.create({
      scope_id: "scope_repo",
      trigger: "host_startup",
      status: "running",
      created_at: "2026-05-16T10:00:00.000Z",
      updated_at: "2026-05-16T10:00:00.000Z"
    });
    const action = actionRepo.create({
      scope_id: "scope_repo",
      run_id: run.run_id,
      action_type: "retire_node",
      status: "pending",
      action: { nodeId: "node_1" },
      affected_ids: ["scope_repo"],
      affected_row_hashes: {},
      created_at: "2026-05-16T10:00:01.000Z",
      updated_at: "2026-05-16T10:00:01.000Z"
    });
    const snapshot = snapshotRepo.createForRows({
      scope_id: "scope_repo",
      action_id: action.action_id,
      rows: [{ table: "scopes", primaryKeyColumn: "scope_id", primaryKeyValue: "scope_repo" }],
      created_at: "2026-05-16T10:00:02.000Z"
    });

    db.prepare("UPDATE scopes SET scope_name = 'Changed' WHERE scope_id = 'scope_repo'").run();

    expect(() => rollbackGovernanceSnapshot(db, snapshot.snapshot_id, "2026-05-16T10:00:03.000Z")).toThrow(
      /Cannot rollback/
    );
  });
});
