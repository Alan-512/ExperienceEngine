import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createId } from "../../../utils/ids.js";
import { withTransaction } from "../db.js";

export type GovernanceRunStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type GovernanceActionStatus =
  | "pending"
  | "applying"
  | "applied"
  | "rejected"
  | "failed"
  | "rolled_back";

export type GovernanceSchedule = {
  scope_id: string;
  last_governed_at?: string;
  next_due_at: string;
  pending_reasons: string[];
  last_run_status?: string;
  last_failure_class?: string;
  backoff_until?: string;
  last_finding_hash?: string;
  created_at: string;
  updated_at: string;
};

export type GovernanceLease = {
  scope_id: string;
  lease_owner: string;
  lease_expires_at: string;
  acquired_at: string;
  updated_at: string;
};

export type GovernanceRun = {
  run_id: string;
  scope_id: string;
  trigger: string;
  status: GovernanceRunStatus;
  failure_class?: string;
  failure_message?: string;
  checkpoint?: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
};

export type GovernanceAction = {
  action_id: string;
  plan_id?: string;
  run_id?: string;
  scope_id: string;
  action_type: string;
  status: GovernanceActionStatus;
  affected_ids: string[];
  affected_row_hashes: Record<string, string>;
  action: Record<string, unknown>;
  validator_decision?: Record<string, unknown>;
  before_snapshot_id?: string;
  after_state?: Record<string, unknown>;
  rollback_of_action_id?: string;
  created_at: string;
  updated_at: string;
  applied_at?: string;
};

export type GovernancePlan = {
  plan_id: string;
  run_id?: string;
  scope_id: string;
  status: string;
  finding_hash?: string;
  risk?: string;
  plan: Record<string, unknown>;
  validator_result?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GovernanceApproval = {
  approval_id: string;
  action_id: string;
  plan_id?: string;
  scope_id: string;
  status: string;
  confirmation_token_hash?: string;
  token_expires_at?: string;
  diff_summary?: string;
  affected_row_hashes: Record<string, string>;
  created_at: string;
  updated_at: string;
  decided_at?: string;
};

export type GovernanceSnapshot = {
  snapshot_id: string;
  scope_id: string;
  action_id: string;
  row_refs: SnapshotRowRef[];
  snapshot: SnapshotRow[];
  row_hashes: Record<string, string>;
  created_at: string;
};

export type SnapshotRowRef = {
  table: string;
  primaryKeyColumn: string;
  primaryKeyValue: string;
};

type SnapshotRow = SnapshotRowRef & {
  row: Record<string, unknown>;
};

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  return JSON.parse(value) as T;
};

const addMs = (iso: string, ms: number): string => new Date(new Date(iso).getTime() + ms).toISOString();

const stableJson = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());

const hashRow = (row: Record<string, unknown>): string =>
  createHash("sha256").update(JSON.stringify(row, Object.keys(row).sort()), "utf8").digest("hex");

const rowKey = (ref: SnapshotRowRef): string => `${ref.table}:${ref.primaryKeyColumn}:${ref.primaryKeyValue}`;

const assertIdentifier = (value: string): void => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQLite identifier: ${value}`);
  }
};

const fetchRow = (db: DatabaseSync, ref: SnapshotRowRef): Record<string, unknown> => {
  assertIdentifier(ref.table);
  assertIdentifier(ref.primaryKeyColumn);
  const row = db.prepare(`SELECT * FROM ${ref.table} WHERE ${ref.primaryKeyColumn} = ? LIMIT 1`).get(ref.primaryKeyValue) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    throw new Error(`Cannot snapshot missing row ${rowKey(ref)}`);
  }
  return row;
};

export const computeGovernanceRowHashes = (
  db: DatabaseSync,
  rows: SnapshotRowRef[]
): Record<string, string> =>
  Object.fromEntries(
    rows.map((ref) => {
      const row = fetchRow(db, ref);
      return [rowKey(ref), hashRow(row)];
    })
  );

const restoreRow = (db: DatabaseSync, entry: SnapshotRow): void => {
  assertIdentifier(entry.table);
  assertIdentifier(entry.primaryKeyColumn);
  const columns = Object.keys(entry.row);
  for (const column of columns) {
    assertIdentifier(column);
  }
  const assignments = columns.map((column) => `${column} = @${column}`).join(", ");
  db.prepare(`UPDATE ${entry.table} SET ${assignments} WHERE ${entry.primaryKeyColumn} = @__pk`).run({
    ...entry.row,
    __pk: entry.primaryKeyValue
  });
};

const mapSchedule = (row: {
  scope_id: string;
  last_governed_at: string | null;
  next_due_at: string;
  pending_reasons_json: string;
  last_run_status: string | null;
  last_failure_class: string | null;
  backoff_until: string | null;
  last_finding_hash: string | null;
  created_at: string;
  updated_at: string;
}): GovernanceSchedule => ({
  scope_id: row.scope_id,
  last_governed_at: row.last_governed_at ?? undefined,
  next_due_at: row.next_due_at,
  pending_reasons: parseJson(row.pending_reasons_json, [] as string[]),
  last_run_status: row.last_run_status ?? undefined,
  last_failure_class: row.last_failure_class ?? undefined,
  backoff_until: row.backoff_until ?? undefined,
  last_finding_hash: row.last_finding_hash ?? undefined,
  created_at: row.created_at,
  updated_at: row.updated_at
});

const mapRun = (row: {
  run_id: string;
  scope_id: string;
  trigger: string;
  status: GovernanceRunStatus;
  failure_class: string | null;
  failure_message: string | null;
  checkpoint_json: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}): GovernanceRun => ({
  run_id: row.run_id,
  scope_id: row.scope_id,
  trigger: row.trigger,
  status: row.status,
  failure_class: row.failure_class ?? undefined,
  failure_message: row.failure_message ?? undefined,
  checkpoint: row.checkpoint_json ? parseJson(row.checkpoint_json, {} as Record<string, unknown>) : undefined,
  started_at: row.started_at ?? undefined,
  finished_at: row.finished_at ?? undefined,
  created_at: row.created_at,
  updated_at: row.updated_at
});

const mapPlan = (row: {
  plan_id: string;
  run_id: string | null;
  scope_id: string;
  status: string;
  finding_hash: string | null;
  risk: string | null;
  plan_json: string;
  validator_result_json: string | null;
  created_at: string;
  updated_at: string;
}): GovernancePlan => ({
  plan_id: row.plan_id,
  run_id: row.run_id ?? undefined,
  scope_id: row.scope_id,
  status: row.status,
  finding_hash: row.finding_hash ?? undefined,
  risk: row.risk ?? undefined,
  plan: parseJson(row.plan_json, {}),
  validator_result: parseJson(row.validator_result_json, undefined),
  created_at: row.created_at,
  updated_at: row.updated_at
});

const mapAction = (row: {
  action_id: string;
  plan_id: string | null;
  run_id: string | null;
  scope_id: string;
  action_type: string;
  status: GovernanceActionStatus;
  affected_ids_json: string;
  affected_row_hashes_json: string;
  action_json: string;
  validator_decision_json: string | null;
  before_snapshot_id: string | null;
  after_state_json: string | null;
  rollback_of_action_id: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}): GovernanceAction => ({
  action_id: row.action_id,
  plan_id: row.plan_id ?? undefined,
  run_id: row.run_id ?? undefined,
  scope_id: row.scope_id,
  action_type: row.action_type,
  status: row.status,
  affected_ids: parseJson(row.affected_ids_json, [] as string[]),
  affected_row_hashes: parseJson(row.affected_row_hashes_json, {} as Record<string, string>),
  action: parseJson(row.action_json, {} as Record<string, unknown>),
  validator_decision: parseJson(row.validator_decision_json, undefined),
  before_snapshot_id: row.before_snapshot_id ?? undefined,
  after_state: parseJson(row.after_state_json, undefined),
  rollback_of_action_id: row.rollback_of_action_id ?? undefined,
  created_at: row.created_at,
  updated_at: row.updated_at,
  applied_at: row.applied_at ?? undefined
});

export class GovernanceScheduleRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(scopeId: string): GovernanceSchedule | undefined {
    const row = this.db.prepare("SELECT * FROM hygiene_governance_schedules WHERE scope_id = ? LIMIT 1").get(scopeId) as
      | Parameters<typeof mapSchedule>[0]
      | undefined;
    return row ? mapSchedule(row) : undefined;
  }

  maybeEnqueue(input: {
    scopeId: string;
    trigger: string;
    now: string;
    intervalMs: number;
    findingHash?: string;
  }): { enqueued: boolean; reason: "due" | "not_due" | "backoff" } {
    const existing = this.get(input.scopeId);
    if (existing?.backoff_until && existing.backoff_until > input.now) {
      return { enqueued: false, reason: "backoff" };
    }
    const hasPendingRun = existing?.last_run_status === "pending"
      && Boolean(
        this.db
          .prepare("SELECT run_id FROM hygiene_governance_runs WHERE scope_id = ? AND status = 'pending' LIMIT 1")
          .get(input.scopeId)
      );
    if (existing && existing.next_due_at > input.now && !hasPendingRun) {
      return { enqueued: false, reason: "not_due" };
    }

    const pending = [...new Set([...(existing?.pending_reasons ?? []), input.trigger])];
    const nextDue = hasPendingRun ? existing.next_due_at : addMs(input.now, input.intervalMs);
    this.db
      .prepare(
        `INSERT INTO hygiene_governance_schedules
          (scope_id, last_governed_at, next_due_at, pending_reasons_json, last_run_status, last_failure_class, backoff_until, last_finding_hash, created_at, updated_at)
         VALUES (@scope_id, @last_governed_at, @next_due_at, @pending_reasons_json, @last_run_status, @last_failure_class, @backoff_until, @last_finding_hash, @created_at, @updated_at)
         ON CONFLICT(scope_id) DO UPDATE SET
           next_due_at = excluded.next_due_at,
           pending_reasons_json = excluded.pending_reasons_json,
           last_run_status = excluded.last_run_status,
           last_failure_class = excluded.last_failure_class,
           backoff_until = excluded.backoff_until,
           last_finding_hash = excluded.last_finding_hash,
           updated_at = excluded.updated_at`
      )
      .run({
        scope_id: input.scopeId,
        last_governed_at: existing?.last_governed_at ?? null,
        next_due_at: nextDue,
        pending_reasons_json: JSON.stringify(pending),
        last_run_status: "pending",
        last_failure_class: null,
        backoff_until: null,
        last_finding_hash: input.findingHash ?? existing?.last_finding_hash ?? null,
        created_at: existing?.created_at ?? input.now,
        updated_at: input.now
      });
    return { enqueued: true, reason: "due" };
  }

  recordFailure(input: {
    scopeId: string;
    failureClass: string;
    now: string;
    backoffMs: number;
  }): GovernanceSchedule {
    const existing = this.get(input.scopeId);
    const backoffUntil = addMs(input.now, input.backoffMs);
    this.db
      .prepare(
        `INSERT INTO hygiene_governance_schedules
          (scope_id, next_due_at, pending_reasons_json, last_run_status, last_failure_class, backoff_until, created_at, updated_at)
         VALUES (@scope_id, @next_due_at, '[]', 'failed', @last_failure_class, @backoff_until, @created_at, @updated_at)
         ON CONFLICT(scope_id) DO UPDATE SET
           last_run_status = 'failed',
           last_failure_class = excluded.last_failure_class,
           backoff_until = excluded.backoff_until,
           updated_at = excluded.updated_at`
      )
      .run({
        scope_id: input.scopeId,
        next_due_at: existing?.next_due_at ?? input.now,
        last_failure_class: input.failureClass,
        backoff_until: backoffUntil,
        created_at: existing?.created_at ?? input.now,
        updated_at: input.now
      });
    return this.get(input.scopeId)!;
  }
}

export class GovernanceLeaseRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(scopeId: string): GovernanceLease | undefined {
    const row = this.db.prepare("SELECT * FROM hygiene_governance_leases WHERE scope_id = ? LIMIT 1").get(scopeId) as
      | {
          scope_id: string;
          lease_owner: string;
          lease_expires_at: string;
          acquired_at: string;
          updated_at: string;
        }
      | undefined;
    return row;
  }

  acquire(input: { scopeId: string; owner: string; now: string; ttlMs: number }): GovernanceLease | undefined {
    return withTransaction(this.db, () => {
      const existing = this.get(input.scopeId);
      if (existing && existing.lease_expires_at > input.now && existing.lease_owner !== input.owner) {
        return undefined;
      }
      const expires = addMs(input.now, input.ttlMs);
      this.db
        .prepare(
          `INSERT INTO hygiene_governance_leases (scope_id, lease_owner, lease_expires_at, acquired_at, updated_at)
           VALUES (@scope_id, @lease_owner, @lease_expires_at, @acquired_at, @updated_at)
           ON CONFLICT(scope_id) DO UPDATE SET
             lease_owner = excluded.lease_owner,
             lease_expires_at = excluded.lease_expires_at,
             acquired_at = excluded.acquired_at,
             updated_at = excluded.updated_at`
        )
        .run({
          scope_id: input.scopeId,
          lease_owner: input.owner,
          lease_expires_at: expires,
          acquired_at: input.now,
          updated_at: input.now
        });
      return this.get(input.scopeId);
    });
  }

  release(scopeId: string, owner: string): boolean {
    const result = this.db
      .prepare("DELETE FROM hygiene_governance_leases WHERE scope_id = ? AND lease_owner = ?")
      .run(scopeId, owner);
    return result.changes > 0;
  }
}

export class GovernanceRunRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(run: Omit<GovernanceRun, "run_id"> & { run_id?: string }): GovernanceRun {
    const next: GovernanceRun = {
      ...run,
      run_id: run.run_id ?? createId("hygiene_run")
    };
    this.db
      .prepare(
        `INSERT INTO hygiene_governance_runs
          (run_id, scope_id, trigger, status, failure_class, failure_message, checkpoint_json, started_at, finished_at, created_at, updated_at)
         VALUES (@run_id, @scope_id, @trigger, @status, @failure_class, @failure_message, @checkpoint_json, @started_at, @finished_at, @created_at, @updated_at)`
      )
      .run({
        run_id: next.run_id,
        scope_id: next.scope_id,
        trigger: next.trigger,
        status: next.status,
        failure_class: next.failure_class ?? null,
        failure_message: next.failure_message ?? null,
        checkpoint_json: next.checkpoint ? JSON.stringify(next.checkpoint) : null,
        started_at: next.started_at ?? null,
        finished_at: next.finished_at ?? null,
        created_at: next.created_at,
        updated_at: next.updated_at
      });
    return next;
  }

  listByScope(scopeId: string): GovernanceRun[] {
    const rows = this.db
      .prepare("SELECT * FROM hygiene_governance_runs WHERE scope_id = ? ORDER BY created_at DESC")
      .all(scopeId) as Parameters<typeof mapRun>[0][];
    return rows.map(mapRun);
  }
}

export class GovernanceActionRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(action: Omit<GovernanceAction, "action_id"> & { action_id?: string }): GovernanceAction {
    const next: GovernanceAction = {
      ...action,
      action_id: action.action_id ?? createId("hygiene_action")
    };
    this.db
      .prepare(
        `INSERT INTO hygiene_governance_actions
          (action_id, plan_id, run_id, scope_id, action_type, status, affected_ids_json, affected_row_hashes_json, action_json,
           validator_decision_json, before_snapshot_id, after_state_json, rollback_of_action_id, created_at, updated_at, applied_at)
         VALUES
          (@action_id, @plan_id, @run_id, @scope_id, @action_type, @status, @affected_ids_json, @affected_row_hashes_json, @action_json,
           @validator_decision_json, @before_snapshot_id, @after_state_json, @rollback_of_action_id, @created_at, @updated_at, @applied_at)`
      )
      .run({
        action_id: next.action_id,
        plan_id: next.plan_id ?? null,
        run_id: next.run_id ?? null,
        scope_id: next.scope_id,
        action_type: next.action_type,
        status: next.status,
        affected_ids_json: JSON.stringify(next.affected_ids),
        affected_row_hashes_json: JSON.stringify(next.affected_row_hashes),
        action_json: JSON.stringify(next.action),
        validator_decision_json: next.validator_decision ? JSON.stringify(next.validator_decision) : null,
        before_snapshot_id: next.before_snapshot_id ?? null,
        after_state_json: next.after_state ? JSON.stringify(next.after_state) : null,
        rollback_of_action_id: next.rollback_of_action_id ?? null,
        created_at: next.created_at,
        updated_at: next.updated_at,
        applied_at: next.applied_at ?? null
      });
    return next;
  }

  get(actionId: string): GovernanceAction | undefined {
    const row = this.db.prepare("SELECT * FROM hygiene_governance_actions WHERE action_id = ? LIMIT 1").get(actionId) as
      | Parameters<typeof mapAction>[0]
      | undefined;
    return row ? mapAction(row) : undefined;
  }
}

export class GovernancePlanRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(plan: Omit<GovernancePlan, "plan_id"> & { plan_id?: string }): GovernancePlan {
    const next: GovernancePlan = {
      ...plan,
      plan_id: plan.plan_id ?? createId("hygiene_plan")
    };
    this.db
      .prepare(
        `INSERT INTO hygiene_governance_plans
          (plan_id, run_id, scope_id, status, finding_hash, risk, plan_json, validator_result_json, created_at, updated_at)
         VALUES
          (@plan_id, @run_id, @scope_id, @status, @finding_hash, @risk, @plan_json, @validator_result_json, @created_at, @updated_at)`
      )
      .run({
        plan_id: next.plan_id,
        run_id: next.run_id ?? null,
        scope_id: next.scope_id,
        status: next.status,
        finding_hash: next.finding_hash ?? null,
        risk: next.risk ?? null,
        plan_json: JSON.stringify(next.plan),
        validator_result_json: next.validator_result ? JSON.stringify(next.validator_result) : null,
        created_at: next.created_at,
        updated_at: next.updated_at
      });
    return next;
  }

  get(planId: string): GovernancePlan | undefined {
    const row = this.db.prepare("SELECT * FROM hygiene_governance_plans WHERE plan_id = ? LIMIT 1").get(planId) as
      | Parameters<typeof mapPlan>[0]
      | undefined;
    return row ? mapPlan(row) : undefined;
  }

  findReusableCompletedPlan(scopeId: string, findingHash: string): GovernancePlan | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM hygiene_governance_plans
         WHERE scope_id = ? AND finding_hash = ? AND status = 'completed'
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`
      )
      .get(scopeId, findingHash) as Parameters<typeof mapPlan>[0] | undefined;
    return row ? mapPlan(row) : undefined;
  }
}

export class GovernanceApprovalRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(approval: Omit<GovernanceApproval, "approval_id"> & { approval_id?: string }): GovernanceApproval {
    const next: GovernanceApproval = {
      ...approval,
      approval_id: approval.approval_id ?? createId("hygiene_approval")
    };
    this.db
      .prepare(
        `INSERT INTO hygiene_governance_approvals
          (approval_id, action_id, plan_id, scope_id, status, confirmation_token_hash, token_expires_at, diff_summary,
           affected_row_hashes_json, created_at, updated_at, decided_at)
         VALUES
          (@approval_id, @action_id, @plan_id, @scope_id, @status, @confirmation_token_hash, @token_expires_at, @diff_summary,
           @affected_row_hashes_json, @created_at, @updated_at, @decided_at)`
      )
      .run({
        approval_id: next.approval_id,
        action_id: next.action_id,
        plan_id: next.plan_id ?? null,
        scope_id: next.scope_id,
        status: next.status,
        confirmation_token_hash: next.confirmation_token_hash ?? null,
        token_expires_at: next.token_expires_at ?? null,
        diff_summary: next.diff_summary ?? null,
        affected_row_hashes_json: JSON.stringify(next.affected_row_hashes),
        created_at: next.created_at,
        updated_at: next.updated_at,
        decided_at: next.decided_at ?? null
      });
    return next;
  }

  get(approvalId: string): GovernanceApproval | undefined {
    const row = this.db.prepare("SELECT * FROM hygiene_governance_approvals WHERE approval_id = ? LIMIT 1").get(approvalId) as
      | {
          approval_id: string;
          action_id: string;
          plan_id: string | null;
          scope_id: string;
          status: string;
          confirmation_token_hash: string | null;
          token_expires_at: string | null;
          diff_summary: string | null;
          affected_row_hashes_json: string;
          created_at: string;
          updated_at: string;
          decided_at: string | null;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      approval_id: row.approval_id,
      action_id: row.action_id,
      plan_id: row.plan_id ?? undefined,
      scope_id: row.scope_id,
      status: row.status,
      confirmation_token_hash: row.confirmation_token_hash ?? undefined,
      token_expires_at: row.token_expires_at ?? undefined,
      diff_summary: row.diff_summary ?? undefined,
      affected_row_hashes: parseJson(row.affected_row_hashes_json, {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
      decided_at: row.decided_at ?? undefined
    };
  }

  getByActionId(actionId: string): GovernanceApproval | undefined {
    const row = this.db
      .prepare("SELECT * FROM hygiene_governance_approvals WHERE action_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(actionId) as
      | {
          approval_id: string;
          action_id: string;
          plan_id: string | null;
          scope_id: string;
          status: string;
          confirmation_token_hash: string | null;
          token_expires_at: string | null;
          diff_summary: string | null;
          affected_row_hashes_json: string;
          created_at: string;
          updated_at: string;
          decided_at: string | null;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      approval_id: row.approval_id,
      action_id: row.action_id,
      plan_id: row.plan_id ?? undefined,
      scope_id: row.scope_id,
      status: row.status,
      confirmation_token_hash: row.confirmation_token_hash ?? undefined,
      token_expires_at: row.token_expires_at ?? undefined,
      diff_summary: row.diff_summary ?? undefined,
      affected_row_hashes: parseJson(row.affected_row_hashes_json, {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
      decided_at: row.decided_at ?? undefined
    };
  }
}

export class GovernanceSnapshotRepository {
  constructor(private readonly db: DatabaseSync) {}

  createForRows(input: {
    scope_id: string;
    action_id: string;
    rows: SnapshotRowRef[];
    created_at: string;
    snapshot_id?: string;
  }): GovernanceSnapshot {
    const snapshotRows: SnapshotRow[] = input.rows.map((ref) => ({
      ...ref,
      row: fetchRow(this.db, ref)
    }));
    const rowHashes = Object.fromEntries(snapshotRows.map((entry) => [rowKey(entry), hashRow(entry.row)]));
    const snapshot: GovernanceSnapshot = {
      snapshot_id: input.snapshot_id ?? createId("hygiene_snapshot"),
      scope_id: input.scope_id,
      action_id: input.action_id,
      row_refs: input.rows,
      snapshot: snapshotRows,
      row_hashes: rowHashes,
      created_at: input.created_at
    };
    this.db
      .prepare(
        `INSERT INTO hygiene_governance_snapshots
          (snapshot_id, scope_id, action_id, row_refs_json, snapshot_json, row_hashes_json, created_at)
         VALUES (@snapshot_id, @scope_id, @action_id, @row_refs_json, @snapshot_json, @row_hashes_json, @created_at)`
      )
      .run({
        snapshot_id: snapshot.snapshot_id,
        scope_id: snapshot.scope_id,
        action_id: snapshot.action_id,
        row_refs_json: JSON.stringify(snapshot.row_refs),
        snapshot_json: JSON.stringify(snapshot.snapshot),
        row_hashes_json: JSON.stringify(snapshot.row_hashes),
        created_at: snapshot.created_at
      });
    return snapshot;
  }

  get(snapshotId: string): GovernanceSnapshot | undefined {
    const row = this.db.prepare("SELECT * FROM hygiene_governance_snapshots WHERE snapshot_id = ? LIMIT 1").get(snapshotId) as
      | {
          snapshot_id: string;
          scope_id: string;
          action_id: string;
          row_refs_json: string;
          snapshot_json: string;
          row_hashes_json: string;
          created_at: string;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      snapshot_id: row.snapshot_id,
      scope_id: row.scope_id,
      action_id: row.action_id,
      row_refs: parseJson(row.row_refs_json, [] as SnapshotRowRef[]),
      snapshot: parseJson(row.snapshot_json, [] as SnapshotRow[]),
      row_hashes: parseJson(row.row_hashes_json, {} as Record<string, string>),
      created_at: row.created_at
    };
  }
}

export const applyGovernanceActionWithSnapshot = <T extends Record<string, unknown>>(
  db: DatabaseSync,
  input: {
    actionId: string;
    scopeId: string;
    rows: SnapshotRowRef[];
    now: string;
    apply: () => T;
  }
): T & { snapshot_id: string } =>
  withTransaction(db, () => {
    const snapshot = new GovernanceSnapshotRepository(db).createForRows({
      scope_id: input.scopeId,
      action_id: input.actionId,
      rows: input.rows,
      created_at: input.now
    });
    const afterState = input.apply();
    db.prepare(
      `UPDATE hygiene_governance_actions
       SET status = 'applied',
           before_snapshot_id = ?,
           affected_row_hashes_json = ?,
           after_state_json = ?,
           updated_at = ?,
           applied_at = ?
       WHERE action_id = ?`
    ).run(snapshot.snapshot_id, JSON.stringify(snapshot.row_hashes), JSON.stringify(afterState), input.now, input.now, input.actionId);
    return { ...afterState, snapshot_id: snapshot.snapshot_id };
  });

export const rollbackGovernanceSnapshot = (db: DatabaseSync, snapshotId: string, now: string): void => {
  const repo = new GovernanceSnapshotRepository(db);
  const snapshot = repo.get(snapshotId);
  if (!snapshot) {
    throw new Error(`Cannot rollback missing governance snapshot ${snapshotId}`);
  }

  withTransaction(db, () => {
    for (const entry of snapshot.snapshot) {
      const current = fetchRow(db, entry);
      const key = rowKey(entry);
      if (hashRow(current) !== snapshot.row_hashes[key]) {
        throw new Error(`Cannot rollback ${key}: current row changed after snapshot`);
      }
    }

    for (const entry of snapshot.snapshot) {
      restoreRow(db, entry);
    }

    db.prepare(
      `INSERT INTO hygiene_governance_actions
        (action_id, scope_id, action_type, status, affected_ids_json, affected_row_hashes_json, action_json,
         rollback_of_action_id, created_at, updated_at, applied_at)
       VALUES (@action_id, @scope_id, 'rollback_snapshot', 'applied', @affected_ids_json, @affected_row_hashes_json, @action_json,
         @rollback_of_action_id, @created_at, @updated_at, @applied_at)`
    ).run({
      action_id: createId("hygiene_action"),
      scope_id: snapshot.scope_id,
      affected_ids_json: JSON.stringify(snapshot.row_refs.map((ref) => ref.primaryKeyValue)),
      affected_row_hashes_json: JSON.stringify(snapshot.row_hashes),
      action_json: stableJson({ snapshotId }),
      rollback_of_action_id: snapshot.action_id,
      created_at: now,
      updated_at: now,
      applied_at: now
    });
  });
};
