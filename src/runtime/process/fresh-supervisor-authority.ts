import type { DatabaseSync } from "node:sqlite";
import type {
  SupervisorMigrationAuthorityEvidence,
  SupervisorMigrationAuthorityProvider
} from "../schema/types.js";
import {
  FRESH_SUPERVISOR_LEASE_STATES,
  RUNTIME_SUPERVISOR_PROTOCOL_VERSION
} from "./constants.js";
import {
  readLaunchAttempt,
  readLaunchAuthorization,
  readSupervisorLaunchState,
  readSupervisorLease
} from "./database.js";
import type {
  RuntimeProcessAuthorityClock,
  SupervisorAuthorityEvidence
} from "./types.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "./clock.js";

const freshStates = new Set<string>(FRESH_SUPERVISOR_LEASE_STATES);

export const evaluateFreshSupervisorAuthorityInTransaction = (options: {
  db: DatabaseSync;
  homeId: string;
  observedAt: string;
}): SupervisorAuthorityEvidence => {
  const observedAtMs = toProcessAuthorityEpochMs(options.observedAt);
  const lease = readSupervisorLease(options.db, options.homeId);
  if (!lease) {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "runtime-supervisor-authority-v1",
      reason: "supervisor_not_current",
      observed_at: options.observedAt
    };
  }
  const leaseExpiresAtMs = toProcessAuthorityEpochMs(lease.expires_at);
  if (
    !freshStates.has(lease.state) ||
    lease.lease_terminal_at !== null ||
    leaseExpiresAtMs <= observedAtMs
  ) {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "runtime-supervisor-authority-v1",
      reason: leaseExpiresAtMs <= observedAtMs
        ? "supervisor_authority_expired"
        : "supervisor_not_current",
      observed_at: options.observedAt
    };
  }

  const launchState = readSupervisorLaunchState(options.db, options.homeId);
  const attempt = readLaunchAttempt(options.db, options.homeId, lease.launch_attempt_id);
  const authorization = readLaunchAuthorization(
    options.db,
    options.homeId,
    lease.launch_authorization_id
  );
  const consistent = Boolean(
    lease.owner_id &&
    lease.owner_process_id > 0 &&
    lease.owner_process_start_token &&
    lease.package_generation_id &&
    lease.artifact_integrity &&
    lease.supervisor_protocol_version === RUNTIME_SUPERVISOR_PROTOCOL_VERSION &&
    launchState?.current_launch_attempt_id === lease.launch_attempt_id &&
    attempt?.attempt_state === "lease_acquired" &&
    attempt.attempt_state_revision === lease.launch_attempt_state_revision_at_acquisition &&
    authorization?.authorization_state === "consumed" &&
    authorization.consumed_by_launch_attempt_id === lease.launch_attempt_id &&
    authorization.authorization_revision === lease.launch_authorization_revision &&
    authorization.authorization_state_revision ===
      lease.launch_authorization_state_revision_at_consumption &&
    authorization.authorized_package_generation_id === lease.package_generation_id &&
    authorization.authorization_role === lease.launch_authorization_role &&
    attempt.supervisor_owner_id === lease.owner_id &&
    attempt.supervisor_lease_epoch === lease.lease_epoch &&
    attempt.child_process_id === lease.owner_process_id &&
    attempt.child_process_start_token === lease.owner_process_start_token &&
    attempt.launch_authorization_id === lease.launch_authorization_id &&
    attempt.launch_authorization_revision === lease.launch_authorization_revision &&
    attempt.launch_authorization_state_revision_at_consumption ===
      lease.launch_authorization_state_revision_at_consumption &&
    attempt.launch_authorization_role === lease.launch_authorization_role &&
    attempt.launch_activation_revision_at_consumption ===
      lease.launch_activation_revision_at_consumption &&
    attempt.package_generation_id === lease.package_generation_id
  );
  if (!consistent || !attempt) {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "runtime-supervisor-authority-v1",
      reason: "supervisor_authority_inconsistent",
      observed_at: options.observedAt
    };
  }

  return {
    available: true,
    fresh: true,
    authority_contract_version: "runtime-supervisor-authority-v1",
    authority_source: "s3_objective_database_predicate",
    home_id: lease.home_id,
    supervisor_owner_id: lease.owner_id,
    supervisor_owner_process_id: lease.owner_process_id,
    supervisor_owner_process_start_token: lease.owner_process_start_token,
    supervisor_lease_epoch: lease.lease_epoch,
    supervisor_lease_state_revision: lease.lease_state_revision,
    launch_attempt_id: lease.launch_attempt_id,
    launch_attempt_state_revision: attempt.attempt_state_revision,
    package_generation_id: lease.package_generation_id,
    artifact_integrity: lease.artifact_integrity,
    observed_at: options.observedAt,
    expires_at: lease.expires_at
  };
};

export const createSupervisorMigrationAuthorityProvider = (
  clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
): SupervisorMigrationAuthorityProvider => Object.freeze({
  getFreshSupervisorAuthorityInTransaction(input: {
    db: DatabaseSync;
    homeId: string;
    packageGenerationId: string;
    supervisorOwnerId: string;
    expectedSupervisorLeaseEpoch?: number;
  }): SupervisorMigrationAuthorityEvidence {
    const observedAt = clock.captureObservedNowInTransaction(input.db);
    const evidence = evaluateFreshSupervisorAuthorityInTransaction({
      db: input.db,
      homeId: input.homeId,
      observedAt
    });
    if (!evidence.available || !evidence.fresh) {
      return {
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: evidence.reason === "supervisor_authority_expired"
          ? "supervisor_authority_expired"
          : "supervisor_not_current"
      };
    }
    if (
      evidence.supervisor_owner_id !== input.supervisorOwnerId ||
      evidence.package_generation_id !== input.packageGenerationId ||
      (
        input.expectedSupervisorLeaseEpoch !== undefined &&
        evidence.supervisor_lease_epoch !== input.expectedSupervisorLeaseEpoch
      )
    ) {
      return {
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: "supervisor_not_current"
      };
    }
    return {
      available: true,
      fresh: true,
      authority_contract_version: "runtime-supervisor-authority-v1",
      authority_source: "s3_objective_database_predicate",
      home_id: evidence.home_id,
      supervisor_owner_id: evidence.supervisor_owner_id,
      supervisor_lease_epoch: evidence.supervisor_lease_epoch,
      package_generation_id: evidence.package_generation_id,
      observed_at: evidence.observed_at,
      expires_at: evidence.expires_at
    };
  }
});
