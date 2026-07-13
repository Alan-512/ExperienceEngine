import {
  BLOCKED_BOUNDARIES,
  PACKAGE_ACTIVATION_STATE_CONTRACT,
  type PackageActivationState
} from "./constants.js";
import { RuntimeActivationError } from "./errors.js";
import type {
  ActivationWriter,
  PackageActivationAuthorityRow
} from "./types.js";

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new RuntimeActivationError("EE_PACKAGE_ACTIVATION_INVALID", message);
  }
};

const assertNever = (value: never): never => {
  throw new RuntimeActivationError(
    "EE_PACKAGE_ACTIVATION_INVALID",
    `Unknown package activation state ${String(value)}.`
  );
};

const hasCompleteAuthorizationProjection = (
  row: PackageActivationAuthorityRow
): boolean => Boolean(
  row.launch_authorization_id &&
  row.launch_authorized_generation_id &&
  row.launch_authorization_role !== "none" &&
  row.launch_authorization_state !== "none" &&
  row.launch_authorization_revision >= 1 &&
  row.launch_authorization_state_revision >= 1 &&
  row.launch_authorization_issued_at &&
  row.launch_authorization_expires_at
);

const hasEmptyAuthorizationProjection = (
  row: PackageActivationAuthorityRow
): boolean => (
  row.launch_authorization_id === null &&
  row.launch_authorized_generation_id === null &&
  row.launch_authorization_role === "none" &&
  row.launch_authorization_state === "none" &&
  Number.isSafeInteger(row.launch_authorization_revision) &&
  row.launch_authorization_revision >= 0 &&
  row.launch_authorization_state_revision === 0 &&
  row.launch_authorization_issued_at === null &&
  row.launch_authorization_expires_at === null &&
  row.launch_authorization_consumed_by_attempt_id === null &&
  row.launch_authorization_consumed_at === null
);

export const assertActivationWriterShape = (
  row: PackageActivationAuthorityRow
): void => {
  if (
    row.activation_revision === 0 &&
    row.activation_state === "uninitialized"
  ) {
    assert(
      row.updated_by_kind === null &&
      row.updated_by_gateway_instance_id === null &&
      row.updated_by_supervisor_owner_id === null &&
      row.updated_by_supervisor_lease_epoch === null,
      "Revision-zero bootstrap authority must have no runtime writer identity."
    );
    return;
  }
  if (row.updated_by_kind === "gateway_service_controller") {
    assert(
      Boolean(row.updated_by_gateway_instance_id) &&
      row.updated_by_supervisor_owner_id === null &&
      row.updated_by_supervisor_lease_epoch === null,
      "Gateway package authority must contain only gateway writer identity."
    );
    return;
  }
  if (row.updated_by_kind === "supervisor") {
    assert(
      row.updated_by_gateway_instance_id === null &&
      Boolean(row.updated_by_supervisor_owner_id) &&
      Number.isSafeInteger(row.updated_by_supervisor_lease_epoch) &&
      (row.updated_by_supervisor_lease_epoch ?? 0) >= 1,
      "Supervisor package authority must contain only supervisor owner and epoch."
    );
    return;
  }
  throw new RuntimeActivationError(
    "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
    "Non-bootstrap package authority requires exactly one persistent writer mode."
  );
};

export const assertRequestedWriterMode = (writer: ActivationWriter): void => {
  if (writer.kind === "gateway_service_controller") {
    assert(
      writer.gateway_instance_id.trim().length > 0 &&
      writer.gateway_process_start_token.trim().length > 0 &&
      writer.plugin_package_generation_id.trim().length > 0,
      "Gateway writer identity must be complete."
    );
    return;
  }
  if (writer.kind === "supervisor") {
    assert(
      writer.supervisor_owner_id.trim().length > 0 &&
      Number.isSafeInteger(writer.supervisor_lease_epoch) &&
      writer.supervisor_lease_epoch >= 1 &&
      Number.isSafeInteger(writer.supervisor_lease_state_revision) &&
      writer.supervisor_lease_state_revision >= 1,
      "Supervisor writer identity must include exact owner, epoch, and revision."
    );
    return;
  }
  return assertNever(writer);
};

export const assertPackageActivationShape = (
  row: PackageActivationAuthorityRow
): PackageActivationAuthorityRow => {
  assert(
    Number.isSafeInteger(row.activation_revision) && row.activation_revision >= 0,
    "Activation revision must be a non-negative safe integer."
  );
  const authorizationShapeValid =
    hasEmptyAuthorizationProjection(row) || hasCompleteAuthorizationProjection(row);
  assert(
    authorizationShapeValid,
    "Current launch authorization projection must be completely empty or completely bound."
  );
  assertActivationWriterShape(row);

  const contract = PACKAGE_ACTIVATION_STATE_CONTRACT[row.activation_state];
  assert(
    contract.pendingTransitionKinds.includes(row.pending_transition_kind as never),
    `Transition kind ${row.pending_transition_kind} is invalid for ${row.activation_state}.`
  );
  if (contract.deadline === "required") {
    assert(Boolean(row.activation_deadline_at), `${row.activation_state} requires a deadline.`);
  } else if (contract.deadline === "forbidden") {
    assert(row.activation_deadline_at === null, `${row.activation_state} forbids a deadline.`);
  }
  if (contract.blockedBoundary === "none") {
    assert(
      row.blocked_boundary === "none" && row.blocked_from_state === "none",
      `${row.activation_state} forbids blocked boundary residue.`
    );
  } else {
    assert(
      row.blocked_boundary !== "none" && row.blocked_from_state !== "none",
      "Blocked activation requires an exact non-none boundary and source state."
    );
  }

  switch (row.activation_state) {
    case "uninitialized":
      assert(
        row.active_package_generation_id === null &&
        row.pending_package_generation_id === null &&
        row.previous_package_generation_id === null &&
        row.preactivation_handshake_id === null &&
        row.production_activation_handshake_id === null &&
        hasEmptyAuthorizationProjection(row),
        "Uninitialized activation must contain no package or current authority residue."
      );
      break;
    case "preparing":
    case "migrating":
      assert(Boolean(row.pending_package_generation_id), `${row.activation_state} requires a pending generation.`);
      if (row.pending_transition_kind === "initial") {
        assert(
          row.active_package_generation_id === null &&
          row.previous_package_generation_id === null,
          "Initial pre-identity activation cannot contain active or previous package identity."
        );
      } else {
        assert(Boolean(row.active_package_generation_id), "Upgrade or rollback requires the selected active generation.");
      }
      break;
    case "draining_old":
      assert(
        Boolean(row.active_package_generation_id) &&
        Boolean(row.pending_package_generation_id) &&
        Boolean(row.previous_package_generation_id) &&
        (row.pending_transition_kind === "upgrade" || row.pending_transition_kind === "rollback"),
        "Old-generation drain requires active, previous, and pending upgrade/rollback identities."
      );
      break;
    case "preactivation_verifying":
      assert(
        Boolean(row.pending_package_generation_id) &&
        Boolean(row.preactivation_handshake_id),
        "Preactivation verification requires pending identity and current preactivation handshake."
      );
      break;
    case "production_activating":
      assert(
        Boolean(row.active_package_generation_id) &&
        row.pending_package_generation_id === null &&
        row.pending_transition_kind === "none",
        "Production activation requires selected active identity with no pending transition."
      );
      break;
    case "active":
      assert(
        Boolean(row.active_package_generation_id) &&
        row.pending_package_generation_id === null &&
        row.pending_transition_kind === "none" &&
        Boolean(row.production_activation_handshake_id),
        "Active package authority requires selected identity and current production handshake."
      );
      break;
    case "blocked":
      assert(
        BLOCKED_BOUNDARIES.includes(row.blocked_boundary),
        "Blocked boundary must be exhaustive."
      );
      if (row.blocked_boundary === "pre_identity_initial") {
        assert(
          row.active_package_generation_id === null &&
          Boolean(row.pending_package_generation_id) &&
          row.pending_transition_kind === "initial",
          "Initial blocked boundary must preserve only the pending initial identity."
        );
      } else if (
        row.blocked_boundary === "pre_identity_upgrade" ||
        row.blocked_boundary === "pre_identity_rollback"
      ) {
        assert(
          Boolean(row.active_package_generation_id) &&
          Boolean(row.pending_package_generation_id),
          "Pre-identity upgrade/rollback block must preserve active and pending identities."
        );
      } else if (row.blocked_boundary === "post_identity") {
        assert(
          Boolean(row.active_package_generation_id) &&
          row.pending_package_generation_id === null &&
          row.pending_transition_kind === "none" &&
          row.blocked_from_state === "production_activating",
          "Post-identity block must preserve selected active identity and production source state."
        );
      }
      break;
    default:
      return assertNever(row.activation_state as never);
  }
  return row;
};

export const isLegalPackageActivationEdge = (
  from: PackageActivationState,
  to: PackageActivationState
): boolean => PACKAGE_ACTIVATION_STATE_CONTRACT[from].exits.includes(to as never);
