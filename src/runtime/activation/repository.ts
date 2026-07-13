import type { DatabaseSync } from "node:sqlite";
import {
  RUNTIME_CONTROL_SCHEMA_VERSION
} from "../identity/constants.js";
import type {
  PackageLaunchAuthorizationRow,
  RuntimeProcessAuthorityClock,
  S6PackageAuthorizationMutationProvider,
  SupervisorLaunchStateRow
} from "../process/types.js";
import {
  PACKAGE_ACTIVATION_TIMING_POLICY,
  RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
  RUNTIME_WORKER_PROTOCOL_VERSION
} from "../process/constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import {
  assertCanonicalHomeExists,
  assertCurrentGatewayHeartbeat,
  changedOneRow,
  readSupervisorLaunchState
} from "../process/database.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import {
  RuntimeLaunchAuthorizationIssuer
} from "../process/launch-authority.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import { RuntimeActivationError } from "./errors.js";
import {
  assertPackageActivationShape,
  assertRequestedWriterMode
} from "./state-contract.js";
import type {
  GatewayActivationWriter,
  PackageActivationAuthorityRow,
  VerifiedPackageClosureEvidence
} from "./types.js";

const ACTIVATION_RESIDUE_TABLES = [
  "package_launch_authorizations",
  "supervisor_launch_attempts",
  "supervisor_launch_state",
  "supervisor_leases",
  "worker_leases",
  "activation_handshakes",
  "control_request_idempotency"
] as const;

const assertNonEmpty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      `${field} must not be empty.`
    );
  }
};

const addMilliseconds = (timestamp: string, milliseconds: number): string =>
  new Date(toProcessAuthorityEpochMs(timestamp) + milliseconds).toISOString();

const readActivation = (
  db: DatabaseSync,
  homeId: string
): PackageActivationAuthorityRow | undefined => db.prepare(
  "SELECT * FROM package_activation_state WHERE home_id = ? LIMIT 1"
).get(homeId) as PackageActivationAuthorityRow | undefined;

export const assertVerifiedPackageClosure = (
  evidence: VerifiedPackageClosureEvidence,
  observedAt: string
): void => {
  if (!evidence.verified) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_CLOSURE_REQUIRED",
      "Package activation requires verified immutable package closure evidence."
    );
  }
  const identity = evidence.package_identity;
  for (const [field, value] of Object.entries(identity)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_CLOSURE_REQUIRED",
        `Verified package identity field ${field} must not be empty.`
      );
    }
  }
  assertNonEmpty(evidence.closure_manifest_digest, "closure_manifest_digest");
  if (
    identity.supervisor_protocol_version !== RUNTIME_SUPERVISOR_PROTOCOL_VERSION ||
    identity.worker_protocol_version !== RUNTIME_WORKER_PROTOCOL_VERSION ||
    identity.control_protocol_version !== RUNTIME_CONTROL_SCHEMA_VERSION
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_CLOSURE_REQUIRED",
      "Verified package protocols are incompatible with the current activation runtime."
    );
  }
  if (toProcessAuthorityEpochMs(evidence.verified_at) > toProcessAuthorityEpochMs(observedAt)) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_CLOSURE_REQUIRED",
      "Package closure evidence cannot be observed in the future."
    );
  }
};

export class RuntimePackageActivationRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  read(): PackageActivationAuthorityRow | undefined {
    const row = readActivation(this.db, this.homeId);
    return row ? assertPackageActivationShape(row) : undefined;
  }

  bootstrapPackageActivationAuthority(): PackageActivationAuthorityRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        assertCanonicalHomeExists(this.db, this.homeId);
        const existing = readActivation(this.db, this.homeId);
        if (existing) {
          return assertPackageActivationShape(existing);
        }
        for (const table of ACTIVATION_RESIDUE_TABLES) {
          const row = this.db.prepare(
            `SELECT 1 AS present FROM ${table} WHERE home_id = ? LIMIT 1`
          ).get(this.homeId) as { present: number } | undefined;
          if (row) {
            throw new RuntimeActivationError(
              "EE_PACKAGE_ACTIVATION_NOT_EMPTY",
              `Revision-zero activation bootstrap is forbidden because ${table} contains authority residue.`
            );
          }
        }
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        this.db.prepare(
          "INSERT INTO package_activation_state (home_id, updated_at) VALUES (?, ?)"
        ).run(this.homeId, observedAt);
        return assertPackageActivationShape(readActivation(this.db, this.homeId)!);
      }
    });
  }

  initializePackageActivation(options: {
    expectedActivationRevision: number;
    expectedLaunchRevision: number;
    authorizationId: string;
    packageClosure: VerifiedPackageClosureEvidence;
    writer: GatewayActivationWriter;
  }): {
    activation: PackageActivationAuthorityRow;
    authorization: PackageLaunchAuthorizationRow;
    launchState: SupervisorLaunchStateRow;
  } {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => this.initializePackageActivationInTransaction(options)
    });
  }

  initializePackageActivationInTransaction(options: {
    expectedActivationRevision: number;
    expectedLaunchRevision: number;
    authorizationId: string;
    packageClosure: VerifiedPackageClosureEvidence;
    writer: GatewayActivationWriter;
  }): {
    activation: PackageActivationAuthorityRow;
    authorization: PackageLaunchAuthorizationRow;
    launchState: SupervisorLaunchStateRow;
  } {
    assertRequestedWriterMode(options.writer);
    assertNonEmpty(options.authorizationId, "authorizationId");
    if (
      !Number.isSafeInteger(options.expectedActivationRevision) ||
      options.expectedActivationRevision < 0 ||
      !Number.isSafeInteger(options.expectedLaunchRevision) ||
      options.expectedLaunchRevision < 0
    ) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Expected activation and launch revisions must be non-negative safe integers."
      );
    }
    if (!this.db.isTransaction) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "In-transaction initialization requires an active SQLite authority transaction."
      );
    }
    assertCanonicalHomeExists(this.db, this.homeId);
    const observedAt = this.clock.captureObservedNowInTransaction(this.db);
    assertVerifiedPackageClosure(options.packageClosure, observedAt);
    const packageIdentity = options.packageClosure.package_identity;
    if (
      options.writer.plugin_package_generation_id !==
      packageIdentity.package_generation_id
    ) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
        "Initial activation must be requested by the exact plugin package generation being verified."
      );
    }
    assertCurrentGatewayHeartbeat({
      db: this.db,
      homeId: this.homeId,
      gatewayInstanceId: options.writer.gateway_instance_id,
      gatewayProcessStartToken: options.writer.gateway_process_start_token,
      packageGenerationId: packageIdentity.package_generation_id,
      observedAt
    });
    const supervisor = evaluateFreshSupervisorAuthorityInTransaction({
      db: this.db,
      homeId: this.homeId,
      observedAt
    });
    if (supervisor.available && supervisor.fresh) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_SUPERVISOR_FRESH",
        "Gateway initialization is forbidden while objective fresh supervisor authority exists."
      );
    }
    const current = readActivation(this.db, this.homeId);
    if (!current) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_STALE",
        "Package activation authority must be bootstrapped before initialization."
      );
    }
    assertPackageActivationShape(current);
    if (
      current.activation_revision !== options.expectedActivationRevision ||
      current.activation_state !== "uninitialized"
    ) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_STALE",
        "Initialization requires the exact current uninitialized activation revision."
      );
    }
    const launchState = readSupervisorLaunchState(this.db, this.homeId);
    if ((launchState?.launch_revision ?? 0) !== options.expectedLaunchRevision) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_STALE",
        "Initialization lost the expected supervisor launch projection revision."
      );
    }
    const nextRevision = options.expectedActivationRevision + 1;
    const deadline = addMilliseconds(
      observedAt,
      PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
    );
    const update = this.db.prepare(
      `UPDATE package_activation_state
       SET activation_revision = ?,
           active_package_generation_id = NULL,
           pending_package_generation_id = ?,
           previous_package_generation_id = NULL,
           pending_transition_kind = 'initial',
           activation_deadline_at = ?,
           preactivation_handshake_id = NULL,
           production_activation_handshake_id = NULL,
           activation_state = 'preparing',
           blocked_boundary = 'none',
           blocked_from_state = 'none',
           updated_by_kind = 'gateway_service_controller',
           updated_by_gateway_instance_id = ?,
           updated_by_supervisor_owner_id = NULL,
           updated_by_supervisor_lease_epoch = NULL,
           updated_at = ?,
           last_failure_code = NULL
       WHERE home_id = ?
         AND activation_revision = ?
         AND activation_state = 'uninitialized'
         AND active_package_generation_id IS NULL
         AND pending_package_generation_id IS NULL
         AND previous_package_generation_id IS NULL
         AND pending_transition_kind = 'none'
         AND activation_deadline_at IS NULL
         AND preactivation_handshake_id IS NULL
         AND production_activation_handshake_id IS NULL
         AND launch_authorization_id IS NULL
         AND launch_authorization_state_revision = 0
         AND blocked_boundary = 'none'
         AND blocked_from_state = 'none'`
    ).run(
      nextRevision,
      packageIdentity.package_generation_id,
      deadline,
      options.writer.gateway_instance_id,
      observedAt,
      this.homeId,
      options.expectedActivationRevision
    );
    if (!changedOneRow(update)) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_STALE",
        "Initialization lost the exact residue-free uninitialized CAS."
      );
    }

    const provider: S6PackageAuthorizationMutationProvider = {
      getAuthorizationMutationEvidenceInTransaction: (input) => ({
        available: true,
        fresh: true,
        authority_contract_version: "s6-package-authorization-mutation-v1",
        operation_kind: "gateway_whitelist_operation",
        operation_name: "initialize_package_activation",
        home_id: input.homeId,
        authorized_package_generation_id: input.packageGenerationId,
        authorization_role: input.authorizationRole,
        activation_revision: nextRevision,
        expected_authorization_revision:
          current.launch_authorization_revision + 1,
        expected_authorization_state_revision: 0,
        writer_gateway_instance_id: options.writer.gateway_instance_id,
        writer_supervisor_owner_id: null,
        writer_supervisor_lease_epoch: null,
        writer_supervisor_lease_state_revision: null,
        observed_at: observedAt,
        expires_at: deadline
      })
    };
    const issued = new RuntimeLaunchAuthorizationIssuer(
      this.db,
      this.homeId,
      provider,
      this.clock
    ).issueInTransaction({
      authorizationId: options.authorizationId,
      packageGenerationId: packageIdentity.package_generation_id,
      authorizationRole: "initial_candidate",
      gatewayInstanceId: options.writer.gateway_instance_id,
      gatewayProcessStartToken: options.writer.gateway_process_start_token,
      expectedLaunchRevision: options.expectedLaunchRevision,
      resetLaunchBudget: true,
      issuer: {
        kind: "gateway_service_controller",
        gatewayInstanceId: options.writer.gateway_instance_id
      }
    });
    const activation = assertPackageActivationShape(
      readActivation(this.db, this.homeId)!
    );
    return {
      activation,
      authorization: issued.authorization,
      launchState: issued.launchState
    };
  }
}
