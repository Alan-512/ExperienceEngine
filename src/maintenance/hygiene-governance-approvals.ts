import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  GovernanceActionRepository,
  GovernanceApprovalRepository,
  type GovernanceApproval
} from "../store/sqlite/repositories/hygiene-governance-repo.js";
import { createId } from "../utils/ids.js";

type ApprovalPlan = {
  approvalId: string;
  actionId: string;
  planId?: string;
  scopeId: string;
  diffSummary?: string;
  affectedRowHashes: Record<string, string>;
  confirmationToken: string;
  tokenExpiresAt: string;
};

const TOKEN_TTL_MS = 10 * 60 * 1000;

const hashValue = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const stableRowHash = (row: Record<string, unknown>): string =>
  createHash("sha256").update(JSON.stringify(row, Object.keys(row).sort()), "utf8").digest("hex");

const parseRowRef = (ref: string): { table: string; primaryKeyColumn: string; primaryKeyValue: string } => {
  const parts = ref.split(":");
  if (parts.length !== 3) {
    throw new Error(`Invalid governance row ref: ${ref}`);
  }
  return {
    table: parts[0],
    primaryKeyColumn: parts[1],
    primaryKeyValue: parts[2]
  };
};

const assertIdentifier = (value: string): void => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQLite identifier: ${value}`);
  }
};

const currentAffectedRowHashes = (db: DatabaseSync, refs: Record<string, string>): Record<string, string> => {
  const hashes: Record<string, string> = {};
  for (const key of Object.keys(refs)) {
    const ref = parseRowRef(key);
    assertIdentifier(ref.table);
    assertIdentifier(ref.primaryKeyColumn);
    const row = db.prepare(`SELECT * FROM ${ref.table} WHERE ${ref.primaryKeyColumn} = ? LIMIT 1`).get(ref.primaryKeyValue) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      hashes[key] = "missing";
      continue;
    }
    hashes[key] = stableRowHash(row);
  }
  return hashes;
};

const hashesMatch = (left: Record<string, string>, right: Record<string, string>): boolean => {
  const keys = Object.keys(left).sort();
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  return keys.every((key) => left[key] === right[key]);
};

export class HygieneGovernanceApprovalService {
  constructor(private readonly db: DatabaseSync, private readonly now: () => string = () => new Date().toISOString()) {}

  planApproval(approvalId: string): ApprovalPlan {
    const approval = new GovernanceApprovalRepository(this.db).get(approvalId);
    if (!approval) {
      throw new Error(`Governance approval not found: ${approvalId}`);
    }
    if (approval.status !== "pending") {
      throw new Error(`Governance approval is not pending: ${approval.status}`);
    }

    const token = createId("governance_confirm");
    const expiresAt = new Date(new Date(this.now()).getTime() + TOKEN_TTL_MS).toISOString();
    this.db
      .prepare(
        `UPDATE hygiene_governance_approvals
         SET confirmation_token_hash = ?, token_expires_at = ?, updated_at = ?
         WHERE approval_id = ? AND status = 'pending'`
      )
      .run(hashValue(token), expiresAt, this.now(), approvalId);

    return {
      approvalId: approval.approval_id,
      actionId: approval.action_id,
      planId: approval.plan_id,
      scopeId: approval.scope_id,
      diffSummary: approval.diff_summary,
      affectedRowHashes: approval.affected_row_hashes,
      confirmationToken: token,
      tokenExpiresAt: expiresAt
    };
  }

  executeApproval(input: { approvalId: string; confirmationToken: string }):
    | { approvalId: string; actionId: string; status: "approved" }
    | { approvalId: string; actionId: string; status: "already_approved" }
    | { approvalId: string; actionId: string; status: "stale_replan_required"; reason: "affected_rows_changed" } {
    const approvalRepo = new GovernanceApprovalRepository(this.db);
    const approval = approvalRepo.get(input.approvalId);
    if (!approval) {
      throw new Error(`Governance approval not found: ${input.approvalId}`);
    }
    if (approval.status === "approved") {
      return { approvalId: approval.approval_id, actionId: approval.action_id, status: "already_approved" };
    }
    this.assertToken(approval, input.confirmationToken);

    const currentHashes = currentAffectedRowHashes(this.db, approval.affected_row_hashes);
    if (!hashesMatch(currentHashes, approval.affected_row_hashes)) {
      this.db
        .prepare("UPDATE hygiene_governance_approvals SET status = 'stale', updated_at = ? WHERE approval_id = ?")
        .run(this.now(), approval.approval_id);
      return {
        approvalId: approval.approval_id,
        actionId: approval.action_id,
        status: "stale_replan_required",
        reason: "affected_rows_changed"
      };
    }

    this.db
      .prepare(
        `UPDATE hygiene_governance_approvals
         SET status = 'approved', decided_at = ?, updated_at = ?
         WHERE approval_id = ? AND status = 'pending'`
      )
      .run(this.now(), this.now(), approval.approval_id);
    const action = new GovernanceActionRepository(this.db).get(approval.action_id);
    if (action) {
      this.db
        .prepare("UPDATE hygiene_governance_actions SET status = 'applied', applied_at = ?, updated_at = ? WHERE action_id = ? AND status != 'applied'")
        .run(this.now(), this.now(), action.action_id);
    }
    return { approvalId: approval.approval_id, actionId: approval.action_id, status: "approved" };
  }

  rejectApproval(approvalId: string): { approvalId: string; actionId: string; status: "rejected" | "already_rejected" } {
    const approval = new GovernanceApprovalRepository(this.db).get(approvalId);
    if (!approval) {
      throw new Error(`Governance approval not found: ${approvalId}`);
    }
    if (approval.status === "rejected") {
      return { approvalId: approval.approval_id, actionId: approval.action_id, status: "already_rejected" };
    }
    this.db
      .prepare(
        `UPDATE hygiene_governance_approvals
         SET status = 'rejected', decided_at = ?, updated_at = ?
         WHERE approval_id = ?`
      )
      .run(this.now(), this.now(), approval.approval_id);
    this.db
      .prepare("UPDATE hygiene_governance_actions SET status = 'rejected', updated_at = ? WHERE action_id = ? AND status != 'applied'")
      .run(this.now(), approval.action_id);
    return { approvalId: approval.approval_id, actionId: approval.action_id, status: "rejected" };
  }

  private assertToken(approval: GovernanceApproval, token: string): void {
    if (approval.status !== "pending") {
      throw new Error(`Governance approval is not pending: ${approval.status}`);
    }
    if (!approval.confirmation_token_hash || approval.confirmation_token_hash !== hashValue(token)) {
      throw new Error("Invalid or expired governance approval confirmation token.");
    }
    if (approval.token_expires_at && approval.token_expires_at <= this.now()) {
      throw new Error("Invalid or expired governance approval confirmation token.");
    }
  }
}
