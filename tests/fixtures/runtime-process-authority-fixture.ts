import { DatabaseSync } from "node:sqlite";
import {
  FIXED_CONTROL_PLANE_DDL
} from "../../src/runtime/identity/control-plane-contract.js";
import {
  initializeRuntimeSchemaMetadata
} from "../../src/runtime/schema/migration-authority.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  GatewayHeartbeatRepository
} from "../../src/runtime/process/gateway-heartbeat.js";
import {
  RuntimeLaunchAttemptRepository,
  RuntimeLaunchAuthorizationIssuer
} from "../../src/runtime/process/launch-authority.js";
import {
  RuntimeSupervisorAuthorityRepository
} from "../../src/runtime/process/supervisor-authority.js";
import type {
  ExpectedSupervisorAuthority,
  S6PackageAuthorizationMutationProvider,
  S6ProductionWriteAuthorityProvider,
  S6WorkerAcquisitionAuthorityProvider,
  SupervisorLeaseRow
} from "../../src/runtime/process/types.js";
import type {
  WorkerMode
} from "../../src/runtime/process/constants.js";
import type {
  RuntimePackageGenerationIdentity
} from "../../src/runtime/identity/types.js";

export const PROCESS_FIXTURE_HOME_ID = "home-process-authority-test";
export const PROCESS_FIXTURE_PACKAGE_ID = "pkg-process-authority-test";
export const PROCESS_FIXTURE_ARTIFACT = "artifact-process-authority-test";
export const PROCESS_FIXTURE_GATEWAY_ID = "gateway-process-authority-test";
export const PROCESS_FIXTURE_GATEWAY_START = "gateway-start-token-test";
export const PROCESS_FIXTURE_SUPERVISOR_OWNER = "supervisor-process-authority-test";
export const PROCESS_FIXTURE_START = "2026-07-12T00:00:00.000Z";

export const PROCESS_FIXTURE_PACKAGE_IDENTITY: RuntimePackageGenerationIdentity = {
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
  artifact_integrity: PROCESS_FIXTURE_ARTIFACT,
  install_record_identity: "install-process-authority-test",
  plugin_entrypoint: "dist/plugin/openclaw-plugin.js",
  supervisor_entrypoint: "dist/runtime/package/supervisor-entrypoint.js",
  worker_entrypoint: "dist/runtime/package/worker-entrypoint.js",
  supervisor_protocol_version: "runtime-supervisor-v1",
  worker_protocol_version: "runtime-worker-v1",
  control_protocol_version: "runtime-control-v1",
  profile_registry_digest: "profile-registry-process-authority-test",
  min_read_schema_version: "legacy-learning-v0",
  max_read_schema_version: "runtime-schema-v1",
  min_write_schema_version: "legacy-learning-v0",
  max_write_schema_version: "runtime-schema-v1",
  target_schema_version: "legacy-learning-v0",
  published_channel: "local_test"
};

export const createRuntimeProcessAuthorityDatabase = (): DatabaseSync => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(FIXED_CONTROL_PLANE_DDL);
  db.prepare(
    `INSERT INTO runtime_control_meta (
      control_schema_version,
      home_id,
      home_layout_version,
      path_normalization_version,
      normalized_path_fingerprint,
      integrity_key_id,
      home_path_fingerprint_key_id,
      database_relative_path,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "runtime-control-v1",
    PROCESS_FIXTURE_HOME_ID,
    "home-layout-v1",
    "home-path-normalization-v1",
    "home-fingerprint-test",
    "integrity-key-test",
    "integrity-key-test",
    "sqlite/experienceengine.db",
    PROCESS_FIXTURE_START
  );
  db.prepare(
    "INSERT INTO package_activation_state (home_id, updated_at) VALUES (?, ?)"
  ).run(PROCESS_FIXTURE_HOME_ID, PROCESS_FIXTURE_START);
  initializeRuntimeSchemaMetadata({
    db,
    homeId: PROCESS_FIXTURE_HOME_ID,
    verifyCurrentSchema() {
      return undefined;
    },
    writer: "package_local_initializer"
  });
  return db;
};

export const createAuthorizationMutationProvider = (options: {
  observedAt?: string;
  expiresAt?: string;
  activationRevision?: number;
  expectedAuthorizationRevision?: number;
  expectedAuthorizationStateRevision?: number;
} = {}): S6PackageAuthorizationMutationProvider => ({
  getAuthorizationMutationEvidenceInTransaction(input) {
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-package-authorization-mutation-v1",
      operation_kind: "gateway_whitelist_operation",
      operation_name: "initialize_package_candidate",
      home_id: input.homeId,
      authorized_package_generation_id: input.packageGenerationId,
      authorization_role: input.authorizationRole,
      activation_revision: options.activationRevision ?? 0,
      expected_authorization_revision: options.expectedAuthorizationRevision ?? 1,
      expected_authorization_state_revision:
        options.expectedAuthorizationStateRevision ?? 0,
      writer_gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
      writer_supervisor_owner_id: null,
      writer_supervisor_lease_epoch: null,
      writer_supervisor_lease_state_revision: null,
      observed_at: options.observedAt ?? PROCESS_FIXTURE_START,
      expires_at: options.expiresAt ?? "2026-07-12T01:00:00.000Z"
    };
  }
});

export const createSupervisorAuthorizationMutationProvider = (options: {
  observedAt: string;
  expiresAt?: string;
  activationRevision: number;
  expectedAuthorizationRevision: number;
  expectedAuthorizationStateRevision: number;
  expectedSupervisor: ExpectedSupervisorAuthority;
}): S6PackageAuthorizationMutationProvider => ({
  getAuthorizationMutationEvidenceInTransaction(input) {
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-package-authorization-mutation-v1",
      operation_kind: "supervisor_activation_transition",
      operation_name: "prepare_next_package_launch",
      home_id: input.homeId,
      authorized_package_generation_id: input.packageGenerationId,
      authorization_role: input.authorizationRole,
      activation_revision: options.activationRevision,
      expected_authorization_revision: options.expectedAuthorizationRevision,
      expected_authorization_state_revision:
        options.expectedAuthorizationStateRevision,
      writer_gateway_instance_id: null,
      writer_supervisor_owner_id: options.expectedSupervisor.owner_id,
      writer_supervisor_lease_epoch: options.expectedSupervisor.lease_epoch,
      writer_supervisor_lease_state_revision:
        options.expectedSupervisor.lease_state_revision,
      observed_at: options.observedAt,
      expires_at: options.expiresAt ?? "2026-07-12T01:00:00.000Z"
    };
  }
});

export const seedGatewayHeartbeat = (
  db: DatabaseSync,
  observedAt = PROCESS_FIXTURE_START
): void => {
  new GatewayHeartbeatRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    createFixedProcessAuthorityClock(observedAt)
  ).publish({
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessId: 4001,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    heartbeatDurationMs: 3_600_000
  });
};

export const createCurrentSupervisorFixture = (options: {
  observedAt?: string;
  authorizationId?: string;
  attemptId?: string;
  supervisorOwnerId?: string;
  childProcessId?: number;
  childProcessStartToken?: string;
} = {}): {
  db: DatabaseSync;
  lease: SupervisorLeaseRow;
  expectedSupervisor: ExpectedSupervisorAuthority;
  authorizationId: string;
  attemptId: string;
  launchRevision: number;
  attemptStateRevision: number;
} => {
  const observedAt = options.observedAt ?? PROCESS_FIXTURE_START;
  const authorizationId = options.authorizationId ?? "launch-auth-test";
  const attemptId = options.attemptId ?? "launch-attempt-test";
  const supervisorOwnerId = options.supervisorOwnerId ?? PROCESS_FIXTURE_SUPERVISOR_OWNER;
  const db = createRuntimeProcessAuthorityDatabase();
  seedGatewayHeartbeat(db, observedAt);
  const clock = createFixedProcessAuthorityClock(observedAt);
  const issued = new RuntimeLaunchAuthorizationIssuer(
    db,
    PROCESS_FIXTURE_HOME_ID,
    createAuthorizationMutationProvider({ observedAt }),
    clock
  ).issue({
    authorizationId,
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    authorizationRole: "initial_candidate",
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    expectedLaunchRevision: 0,
    issuer: {
      kind: "gateway_service_controller",
      gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
    }
  });
  const attempts = new RuntimeLaunchAttemptRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    clock
  );
  const reserved = attempts.reserveByConsumingAuthorization({
    authorizationId,
    expectedAuthorizationRevision: issued.authorization.authorization_revision,
    expectedAuthorizationStateRevision: issued.authorization.authorization_state_revision,
    attemptId,
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    authorizationRole: "initial_candidate",
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    expectedLaunchRevision: issued.launchState.launch_revision
  });
  const bound = attempts.bindChildIdentity({
    attemptId,
    expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
    expectedLaunchRevision: reserved.launchState.launch_revision,
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    childProcessId: options.childProcessId ?? 5001,
    childProcessStartToken: options.childProcessStartToken ?? "supervisor-start-token-test"
  });
  const launchRevision = db.prepare(
    "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
  ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
  const lease = new RuntimeSupervisorAuthorityRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    clock
  ).acquireFromBoundAttempt({
    leaseKey: "supervisor-lease-test",
    ownerId: supervisorOwnerId,
    ownerProcessId: bound.child_process_id!,
    ownerProcessStartToken: bound.child_process_start_token!,
    packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
    attemptId,
    expectedAttemptStateRevision: bound.attempt_state_revision,
    expectedLaunchRevision: launchRevision.launch_revision,
    expectedAuthorizationRevision: issued.authorization.authorization_revision,
    expectedAuthorizationStateRevision:
      reserved.attempt.launch_authorization_state_revision_at_consumption
  });
  db.prepare(
    `UPDATE package_activation_state
     SET activation_revision = 1,
         pending_package_generation_id = ?,
         pending_transition_kind = 'initial',
         activation_deadline_at = '2026-07-12T00:10:00.000Z',
         activation_state = 'preactivation_verifying',
         updated_by_kind = 'supervisor',
         updated_by_gateway_instance_id = NULL,
         updated_by_supervisor_owner_id = ?,
         updated_by_supervisor_lease_epoch = ?,
         updated_at = '2026-07-12T00:00:00.000Z'
     WHERE home_id = ? AND activation_revision = 0`
  ).run(
    PROCESS_FIXTURE_PACKAGE_ID,
    lease.owner_id,
    lease.lease_epoch,
    PROCESS_FIXTURE_HOME_ID
  );
  const currentAttempt = db.prepare(
    "SELECT attempt_state_revision FROM supervisor_launch_attempts WHERE home_id = ? AND launch_attempt_id = ?"
  ).get(PROCESS_FIXTURE_HOME_ID, attemptId) as { attempt_state_revision: number };
  const currentLaunch = db.prepare(
    "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
  ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
  return {
    db,
    lease,
    expectedSupervisor: {
      owner_id: lease.owner_id,
      owner_process_id: lease.owner_process_id,
      owner_process_start_token: lease.owner_process_start_token,
      lease_epoch: lease.lease_epoch,
      lease_state_revision: lease.lease_state_revision
    },
    authorizationId,
    attemptId,
    launchRevision: currentLaunch.launch_revision,
    attemptStateRevision: currentAttempt.attempt_state_revision
  };
};

export const createWorkerAcquisitionProvider = (options: {
  observedAt: string;
  expiresAt?: string;
  mode?: WorkerMode;
  transitionRole?: "initial_candidate" | "active" | "pending" | "rollback_candidate";
}): S6WorkerAcquisitionAuthorityProvider => ({
  getWorkerAcquisitionAuthorityInTransaction(input) {
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-worker-acquisition-authority-v1",
      home_id: input.homeId,
      package_generation_id: input.packageGenerationId,
      artifact_integrity: PROCESS_FIXTURE_ARTIFACT,
      schema_version: "legacy-learning-v0",
      worker_mode: options.mode ?? input.workerMode,
      transition_role: options.transitionRole ?? "initial_candidate",
      activation_revision: 1,
      activation_state: "preactivation_verifying",
      pending_transition_kind: "initial",
      expected_active_package_generation_id: null,
      expected_pending_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
      activation_deadline_at: "2026-07-12T00:10:00.000Z",
      supervisor_owner_id: input.supervisorOwnerId,
      supervisor_lease_epoch: input.supervisorLeaseEpoch,
      observed_at: options.observedAt,
      expires_at: options.expiresAt ?? "2026-07-12T01:00:00.000Z"
    };
  }
});

export const createProductionWriteProvider = (options: {
  observedAt: string;
  expiresAt?: string;
  operation: "queue_claim" | "node_write";
}): S6ProductionWriteAuthorityProvider => ({
  getProductionWriteAuthorityInTransaction(input) {
    if (input.operation !== options.operation) {
      return {
        available: false,
        fresh: false,
        authority_contract_version: "s6-production-write-authority-v1",
        reason: "production_activation_not_current"
      };
    }
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-production-write-authority-v1",
      home_id: input.homeId,
      worker_owner_id: input.workerOwnerId,
      worker_fencing_token: input.workerFencingToken,
      supervisor_owner_id: PROCESS_FIXTURE_SUPERVISOR_OWNER,
      supervisor_lease_epoch: 1,
      package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
      schema_version: "legacy-learning-v0",
      operation: options.operation,
      observed_at: options.observedAt,
      expires_at: options.expiresAt ?? "2026-07-12T01:00:00.000Z"
    };
  }
});
