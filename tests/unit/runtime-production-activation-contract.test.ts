import { describe, expect, it } from "vitest";
import {
  FIXED_CONTROL_PLANE_TABLE_CONTRACTS
} from "../../src/runtime/identity/control-plane-contract.js";
import {
  ACTIVATION_HANDSHAKE_FIELDS,
  ACTIVATION_HANDSHAKE_PURPOSES,
  ACTIVATION_HANDSHAKE_STATES,
  ACTIVATION_HANDSHAKE_TRANSITIONS,
  BLOCKED_BOUNDARIES,
  BLOCKED_BOUNDARY_EXIT_CONTRACT,
  BLOCKED_FROM_STATES,
  CONTROL_IDEMPOTENCY_FIELDS,
  GATEWAY_PACKAGE_AUTHORITY_EFFECTS,
  GATEWAY_PACKAGE_AUTHORITY_OPERATIONS,
  MUTATING_OPENCLAW_NATIVE_OPERATIONS,
  OPENCLAW_NATIVE_OPERATIONS,
  PACKAGE_ACTIVATION_CONTRACT_FIXTURE,
  PACKAGE_ACTIVATION_FIELDS,
  PACKAGE_ACTIVATION_STATES,
  PACKAGE_ACTIVATION_STATE_CONTRACT,
  PACKAGE_TRANSITION_KINDS,
  PRE_IDENTITY_CANCEL_OUTCOME_CONTRACT,
  READ_ONLY_OPENCLAW_NATIVE_OPERATIONS,
  STATUS_PROJECTION_FIELDS
} from "../../src/runtime/activation/constants.js";
import {
  assertPackageActivationShape,
  isLegalPackageActivationEdge
} from "../../src/runtime/activation/state-contract.js";
import type {
  PackageActivationAuthorityRow
} from "../../src/runtime/activation/types.js";

const tableColumns = (name: string): string[] => {
  const table = FIXED_CONTROL_PLANE_TABLE_CONTRACTS.find(
    (candidate) => candidate.name === name
  );
  if (!table) {
    throw new Error(`Missing table ${name}.`);
  }
  return table.columns.map((column) => column.name);
};

const baseRow = (): PackageActivationAuthorityRow => ({
  home_id: "home-contract-test",
  activation_revision: 0,
  active_package_generation_id: null,
  pending_package_generation_id: null,
  previous_package_generation_id: null,
  pending_transition_kind: "none",
  activation_deadline_at: null,
  preactivation_handshake_id: null,
  production_activation_handshake_id: null,
  launch_authorization_id: null,
  launch_authorized_generation_id: null,
  launch_authorization_role: "none",
  launch_authorization_state: "none",
  launch_authorization_revision: 0,
  launch_authorization_state_revision: 0,
  launch_authorization_issued_at: null,
  launch_authorization_expires_at: null,
  launch_authorization_consumed_by_attempt_id: null,
  launch_authorization_consumed_at: null,
  activation_state: "uninitialized",
  blocked_boundary: "none",
  blocked_from_state: "none",
  updated_by_kind: null,
  updated_by_gateway_instance_id: null,
  updated_by_supervisor_owner_id: null,
  updated_by_supervisor_lease_epoch: null,
  updated_at: "2026-07-12T12:00:00.000Z",
  last_failure_code: null
});

describe("runtime production activation contract", () => {
  it("materializes every imported state, boundary, operation, handshake, and timing member", () => {
    expect(PACKAGE_ACTIVATION_STATES).toEqual([
      "uninitialized",
      "preparing",
      "draining_old",
      "migrating",
      "preactivation_verifying",
      "production_activating",
      "active",
      "blocked"
    ]);
    expect(PACKAGE_TRANSITION_KINDS).toEqual(["none", "initial", "upgrade", "rollback"]);
    expect(BLOCKED_BOUNDARIES).toEqual([
      "none",
      "pre_identity_initial",
      "pre_identity_upgrade",
      "pre_identity_rollback",
      "post_identity"
    ]);
    expect(BLOCKED_FROM_STATES).toEqual([
      "none",
      "preparing",
      "draining_old",
      "migrating",
      "preactivation_verifying",
      "production_activating"
    ]);
    expect(GATEWAY_PACKAGE_AUTHORITY_OPERATIONS).toEqual([
      "bootstrap_package_activation_authority",
      "initialize_package_activation",
      "consume_launch_authorization_and_reserve_attempt",
      "expire_or_cancel_unconsumed_authorization",
      "issue_active_restart_authorization",
      "issue_deterministic_replacement_authorization",
      "enter_blocked_transition",
      "retry_package_activation",
      "cancel_package_transition",
      "retry_production_activation",
      "prepare_package_rollback"
    ]);
    expect(ACTIVATION_HANDSHAKE_PURPOSES).toEqual([
      "preactivation_verification",
      "production_activation"
    ]);
    expect(ACTIVATION_HANDSHAKE_STATES).toEqual([
      "requested",
      "supervisor_acknowledged",
      "worker_acknowledged",
      "complete",
      "expired",
      "rejected"
    ]);
    expect(PACKAGE_ACTIVATION_CONTRACT_FIXTURE.timing_policy).toEqual({
      policy_version: "package-activation-v1",
      activation_deadline_ms: 600_000,
      launch_authorization_ttl_ms: 60_000,
      launch_attempt_timeout_ms: 30_000,
      preactivation_handshake_ttl_ms: 60_000,
      production_handshake_ttl_ms: 60_000
    });
  });

  it("keeps exhaustive matrices keyed by the exact enum members", () => {
    expect(Object.keys(PACKAGE_ACTIVATION_STATE_CONTRACT)).toEqual(PACKAGE_ACTIVATION_STATES);
    expect(Object.keys(BLOCKED_BOUNDARY_EXIT_CONTRACT)).toEqual(BLOCKED_BOUNDARIES);
    expect(Object.keys(PRE_IDENTITY_CANCEL_OUTCOME_CONTRACT)).toEqual(
      BLOCKED_BOUNDARIES
    );
    expect(Object.keys(GATEWAY_PACKAGE_AUTHORITY_EFFECTS)).toEqual(
      GATEWAY_PACKAGE_AUTHORITY_OPERATIONS
    );
    expect(Object.keys(ACTIVATION_HANDSHAKE_TRANSITIONS)).toEqual(
      ACTIVATION_HANDSHAKE_STATES
    );
    expect(BLOCKED_BOUNDARY_EXIT_CONTRACT.post_identity).toEqual([
      "retry_production_activation",
      "prepare_package_rollback"
    ]);
    expect(PRE_IDENTITY_CANCEL_OUTCOME_CONTRACT).toMatchObject({
      pre_identity_initial: {
        target_state: "uninitialized"
      },
      pre_identity_upgrade: {
        target_state: "active_with_preserved_handshake_or_production_activating",
        gateway_replacement_authorization:
          "required_without_preserved_handshake"
      },
      pre_identity_rollback: {
        target_state: "production_activating",
        gateway_replacement_authorization:
          "required_without_selected_active_supervisor"
      },
      post_identity: { legal: false }
    });
    expect(BLOCKED_BOUNDARY_EXIT_CONTRACT.post_identity).not.toContain(
      "cancel_package_transition"
    );
  });

  it("matches the mechanically bootstrapped table field sets", () => {
    expect(PACKAGE_ACTIVATION_FIELDS).toEqual(tableColumns("package_activation_state"));
    expect(ACTIVATION_HANDSHAKE_FIELDS).toEqual(tableColumns("activation_handshakes"));
    expect(CONTROL_IDEMPOTENCY_FIELDS).toEqual(tableColumns("control_request_idempotency"));
    expect(STATUS_PROJECTION_FIELDS).toHaveLength(32);
  });

  it("partitions read-only and mutating native operations without omissions", () => {
    const combined = [
      ...READ_ONLY_OPENCLAW_NATIVE_OPERATIONS,
      ...MUTATING_OPENCLAW_NATIVE_OPERATIONS
    ];
    expect(new Set(combined)).toEqual(new Set(OPENCLAW_NATIVE_OPERATIONS));
    expect(combined).toHaveLength(OPENCLAW_NATIVE_OPERATIONS.length);
  });

  it("validates revision-zero uninitialized identity and rejects residue", () => {
    expect(assertPackageActivationShape(baseRow()).activation_state).toBe("uninitialized");
    expect(() => assertPackageActivationShape({
      ...baseRow(),
      pending_package_generation_id: "pkg-residue"
    })).toThrowError(/no package or current authority residue/u);
  });

  it("validates legal state edges mechanically", () => {
    expect(isLegalPackageActivationEdge("uninitialized", "preparing")).toBe(true);
    expect(isLegalPackageActivationEdge("preactivation_verifying", "production_activating")).toBe(true);
    expect(isLegalPackageActivationEdge("production_activating", "active")).toBe(true);
    expect(isLegalPackageActivationEdge("blocked", "active")).toBe(true);
    expect(isLegalPackageActivationEdge("blocked", "draining_old")).toBe(false);
    expect(isLegalPackageActivationEdge("uninitialized", "active")).toBe(false);
  });
});
