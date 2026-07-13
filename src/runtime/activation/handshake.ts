import type { DatabaseSync } from "node:sqlite";
import {
  CONFIGURATION_POINTER_SCHEMA_VERSION
} from "../configuration/constants.js";
import type {
  RuntimeConfigurationCapability
} from "../configuration/constants.js";
import {
  PACKAGE_ACTIVATION_TIMING_POLICY
} from "../process/constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import {
  assertCanonicalHomeExists,
  assertCurrentGatewayHeartbeat,
  changedOneRow
} from "../process/database.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  ACTIVATION_HANDSHAKE_SCHEMA_VERSION,
  ACTIVATION_HANDSHAKE_TRANSITIONS,
  DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES,
  type ActivationHandshakePurpose,
  type ActivationHandshakeState
} from "./constants.js";
import {
  readActivationHandshake,
  readConfigurationPointer,
  readLaunchAttemptById,
  readLaunchAuthorizationById,
  readMigrationState,
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import { RuntimeActivationError } from "./errors.js";
import { assertPackageActivationShape } from "./state-contract.js";
import type {
  ActivationHandshakeRow,
  ActivationWorkerAcknowledgement,
  GatewayActivationWriter,
  RuntimeCapabilityRouteAuthorityProvider,
  SupervisorActivationWriter
} from "./types.js";
import {
  UNAVAILABLE_RUNTIME_CAPABILITY_ROUTE_AUTHORITY_PROVIDER
} from "./authority.js";

const assertNonEmpty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      `${field} must not be empty.`
    );
  }
};

const minimumTimestamp = (...values: string[]): string => new Date(
  Math.min(...values.map(toProcessAuthorityEpochMs))
).toISOString();

const addMilliseconds = (timestamp: string, milliseconds: number): string =>
  new Date(toProcessAuthorityEpochMs(timestamp) + milliseconds).toISOString();

const assertCurrentSupervisorWriter = (options: {
  db: DatabaseSync;
  homeId: string;
  writer: SupervisorActivationWriter;
  observedAt: string;
}): ReturnType<typeof evaluateFreshSupervisorAuthorityInTransaction> & { available: true; fresh: true } => {
  const authority = evaluateFreshSupervisorAuthorityInTransaction({
    db: options.db,
    homeId: options.homeId,
    observedAt: options.observedAt
  });
  if (
    !authority.available ||
    !authority.fresh ||
    authority.supervisor_owner_id !== options.writer.supervisor_owner_id ||
    authority.supervisor_lease_epoch !== options.writer.supervisor_lease_epoch ||
    authority.supervisor_lease_state_revision !==
      options.writer.supervisor_lease_state_revision
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
      "Activation handshake transition requires the exact current supervisor owner, epoch, and revision."
    );
  }
  return authority;
};

const assertHistoricalLaunchChain = (options: {
  db: DatabaseSync;
  homeId: string;
  handshake: ActivationHandshakeRow;
}): void => {
  const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
  const attempt = readLaunchAttemptById(
    options.db,
    options.homeId,
    options.handshake.supervisor_launch_attempt_id
  );
  const authorization = readLaunchAuthorizationById(
    options.db,
    options.homeId,
    options.handshake.launch_authorization_id
  );
  if (
    !supervisor ||
    !attempt ||
    !authorization ||
    supervisor.launch_attempt_id !== options.handshake.supervisor_launch_attempt_id ||
    supervisor.launch_authorization_id !== options.handshake.launch_authorization_id ||
    supervisor.launch_authorization_revision !==
      options.handshake.launch_authorization_revision ||
    supervisor.launch_authorization_state_revision_at_consumption !==
      options.handshake.launch_authorization_state_revision_at_consumption ||
    supervisor.launch_authorization_role !== options.handshake.launch_authorization_role ||
    supervisor.launch_activation_revision_at_consumption !==
      options.handshake.launch_activation_revision_at_consumption ||
    attempt.launch_authorization_id !== options.handshake.launch_authorization_id ||
    attempt.launch_authorization_revision !==
      options.handshake.launch_authorization_revision ||
    attempt.launch_authorization_state_revision_at_consumption !==
      options.handshake.launch_authorization_state_revision_at_consumption ||
    attempt.launch_activation_revision_at_consumption !==
      options.handshake.launch_activation_revision_at_consumption ||
    authorization.authorization_revision !==
      options.handshake.launch_authorization_revision ||
    authorization.authorization_state_revision !==
      options.handshake.launch_authorization_state_revision_at_consumption ||
    authorization.authorization_state !== "consumed" ||
    authorization.consumed_by_launch_attempt_id !==
      options.handshake.supervisor_launch_attempt_id
  ) {
    throw new RuntimeActivationError(
      "EE_ACTIVATION_HANDSHAKE_STALE",
      "Activation handshake historical launch authorization, attempt, and supervisor lease evidence do not match."
    );
  }
};

const assertHandshakeCurrentBindings = (options: {
  db: DatabaseSync;
  homeId: string;
  handshake: ActivationHandshakeRow;
  observedAt: string;
  requireWorker: boolean;
}): void => {
  const activation = readPackageActivationAuthority(options.db, options.homeId);
  const worker = readWorkerLeaseByHome(options.db, options.homeId);
  const pointer = readConfigurationPointer(options.db, options.homeId);
  const migration = readMigrationState(options.db, options.homeId);
  if (
    !activation ||
    activation.activation_revision !== options.handshake.current_activation_revision ||
    !pointer ||
    pointer.pointer_schema_version !== CONFIGURATION_POINTER_SCHEMA_VERSION ||
    pointer.generation_id !== options.handshake.configuration_generation_id ||
    !migration ||
    migration.migration_status !== "ready" ||
    migration.current_schema_version !== options.handshake.schema_version ||
    migration.target_schema_version !== options.handshake.schema_version
  ) {
    throw new RuntimeActivationError(
      "EE_ACTIVATION_HANDSHAKE_STALE",
      "Activation handshake lost current package revision, configuration generation, or ready schema binding."
    );
  }
  assertPackageActivationShape(activation);
  if (options.requireWorker && (
    !worker ||
    worker.owner_id !== options.handshake.worker_owner_id ||
    worker.fencing_token !== options.handshake.worker_fencing_token ||
    worker.worker_mode !== options.handshake.worker_mode ||
    worker.package_generation_id !== options.handshake.plugin_package_generation_id ||
    worker.schema_version !== options.handshake.schema_version ||
    worker.state === "stopped" ||
    toProcessAuthorityEpochMs(worker.expires_at) <=
      toProcessAuthorityEpochMs(options.observedAt)
  )) {
    throw new RuntimeActivationError(
      "EE_ACTIVATION_HANDSHAKE_STALE",
      "Activation handshake lost the exact current worker owner, fence, mode, package, or schema."
    );
  }
  assertHistoricalLaunchChain(options);
};

const transitionAllowed = (
  from: ActivationHandshakeState,
  to: ActivationHandshakeState
): boolean => Object.prototype.hasOwnProperty.call(
  ACTIVATION_HANDSHAKE_TRANSITIONS[from],
  to
);

export class RuntimeActivationHandshakeRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK,
    private readonly routeAuthorityProvider:
      RuntimeCapabilityRouteAuthorityProvider =
        UNAVAILABLE_RUNTIME_CAPABILITY_ROUTE_AUTHORITY_PROVIDER,
    private readonly requiredCapabilities:
      readonly RuntimeConfigurationCapability[] =
        DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES
  ) {}

  read(activationId: string): ActivationHandshakeRow | undefined {
    return readActivationHandshake(this.db, this.homeId, activationId);
  }

  request(options: {
    activationId: string;
    nonceDigest: string;
    purpose: ActivationHandshakePurpose;
    configurationGenerationId: string;
    effectiveRouteSetId: string;
    workerOwnerId: string;
    workerFencingToken: number;
    writer: GatewayActivationWriter;
  }): ActivationHandshakeRow {
    for (const [field, value] of Object.entries({
      activationId: options.activationId,
      nonceDigest: options.nonceDigest,
      configurationGenerationId: options.configurationGenerationId,
      effectiveRouteSetId: options.effectiveRouteSetId,
      workerOwnerId: options.workerOwnerId
    })) {
      assertNonEmpty(value, field);
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        assertCanonicalHomeExists(this.db, this.homeId);
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const activation = readPackageActivationAuthority(this.db, this.homeId);
        const supervisor = readSupervisorLeaseByHome(this.db, this.homeId);
        const worker = readWorkerLeaseByHome(this.db, this.homeId);
        const pointer = readConfigurationPointer(this.db, this.homeId);
        const migration = readMigrationState(this.db, this.homeId);
        if (!activation || !supervisor || !worker || !pointer || !migration) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Activation handshake request requires current package, supervisor, worker, configuration, and schema authority."
          );
        }
        assertPackageActivationShape(activation);
        assertCurrentGatewayHeartbeat({
          db: this.db,
          homeId: this.homeId,
          gatewayInstanceId: options.writer.gateway_instance_id,
          gatewayProcessStartToken: options.writer.gateway_process_start_token,
          packageGenerationId: options.writer.plugin_package_generation_id,
          observedAt
        });
        const freshSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        if (
          !freshSupervisor.available ||
          !freshSupervisor.fresh ||
          freshSupervisor.supervisor_owner_id !== supervisor.owner_id ||
          freshSupervisor.supervisor_lease_epoch !== supervisor.lease_epoch ||
          worker.supervisor_owner_id !== supervisor.owner_id ||
          worker.supervisor_lease_epoch !== supervisor.lease_epoch ||
          worker.owner_id !== options.workerOwnerId ||
          worker.fencing_token !== options.workerFencingToken ||
          worker.state === "stopped" ||
          toProcessAuthorityEpochMs(worker.expires_at) <= toProcessAuthorityEpochMs(observedAt) ||
          pointer.generation_id !== options.configurationGenerationId ||
          migration.migration_status !== "ready" ||
          migration.current_schema_version !== worker.schema_version ||
          migration.target_schema_version !== worker.schema_version ||
          options.writer.plugin_package_generation_id !== supervisor.package_generation_id ||
          worker.package_generation_id !== supervisor.package_generation_id
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Activation handshake request authority bindings are not current."
          );
        }
        if (options.purpose === "preactivation_verification") {
          if (
            worker.worker_mode !== "activation_only" ||
            activation.pending_package_generation_id !== supervisor.package_generation_id ||
            !["migrating", "preactivation_verifying"].includes(activation.activation_state) ||
            !activation.activation_deadline_at
          ) {
            throw new RuntimeActivationError(
              "EE_ACTIVATION_HANDSHAKE_STALE",
              "Preactivation request requires pending generation, activation-only worker, and live pre-identity transition."
            );
          }
        } else if (
          worker.worker_mode !== "production" ||
          activation.active_package_generation_id !== supervisor.package_generation_id ||
          activation.pending_package_generation_id !== null ||
          !["production_activating", "active"].includes(activation.activation_state)
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Production request requires selected active generation and a fresh production worker."
          );
        }
        for (const capability of this.requiredCapabilities) {
          const route = this.routeAuthorityProvider
            .getCapabilityRouteAuthorityInTransaction({
              db: this.db,
              homeId: this.homeId,
              configurationGenerationId: options.configurationGenerationId,
              packageGenerationId: supervisor.package_generation_id,
              effectiveRouteSetId: options.effectiveRouteSetId,
              capability,
              observedAt
            });
          if (
            !route.available ||
            !route.fresh ||
            route.home_id !== this.homeId ||
            route.configuration_generation_id !==
              options.configurationGenerationId ||
            route.package_generation_id !== supervisor.package_generation_id ||
            route.effective_route_set_id !== options.effectiveRouteSetId ||
            route.capability !== capability ||
            route.validation_current !== true ||
            toProcessAuthorityEpochMs(route.observed_at) >
              toProcessAuthorityEpochMs(observedAt) ||
            toProcessAuthorityEpochMs(route.expires_at) <=
              toProcessAuthorityEpochMs(observedAt)
          ) {
            throw new RuntimeActivationError(
              "EE_ACTIVATION_HANDSHAKE_STALE",
              `Activation handshake requires current authoritative route evidence for ${capability}.`
            );
          }
        }
        if (readActivationHandshake(this.db, this.homeId, options.activationId)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_CONFLICT",
            "Activation id is single-use and already exists."
          );
        }
        const ttl = options.purpose === "preactivation_verification"
          ? PACKAGE_ACTIVATION_TIMING_POLICY.preactivation_handshake_ttl_ms
          : PACKAGE_ACTIVATION_TIMING_POLICY.production_handshake_ttl_ms;
        const ttlExpiry = addMilliseconds(observedAt, ttl);
        const expiresAt = activation.activation_deadline_at
          ? minimumTimestamp(ttlExpiry, activation.activation_deadline_at)
          : ttlExpiry;
        this.db.prepare(
          `INSERT INTO activation_handshakes (
            activation_record_schema_version,
            activation_id,
            state_revision,
            handshake_purpose,
            nonce_digest,
            home_id,
            gateway_instance_id,
            plugin_package_generation_id,
            current_activation_revision,
            launch_activation_revision_at_consumption,
            active_package_generation_id,
            pending_package_generation_id,
            launch_authorization_id,
            launch_authorization_revision,
            launch_authorization_state_revision_at_consumption,
            launch_authorization_role,
            supervisor_launch_attempt_id,
            configuration_generation_id,
            effective_route_set_id,
            supervisor_owner_id,
            supervisor_lease_epoch,
            worker_owner_id,
            worker_fencing_token,
            worker_mode,
            schema_version,
            requested_at,
            expires_at,
            status,
            last_writer_kind,
            last_writer_owner_id,
            last_writer_supervisor_lease_epoch
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 'plugin', ?, NULL)`
        ).run(
          ACTIVATION_HANDSHAKE_SCHEMA_VERSION,
          options.activationId,
          options.purpose,
          options.nonceDigest,
          this.homeId,
          options.writer.gateway_instance_id,
          options.writer.plugin_package_generation_id,
          activation.activation_revision,
          supervisor.launch_activation_revision_at_consumption,
          activation.active_package_generation_id,
          activation.pending_package_generation_id,
          supervisor.launch_authorization_id,
          supervisor.launch_authorization_revision,
          supervisor.launch_authorization_state_revision_at_consumption,
          supervisor.launch_authorization_role,
          supervisor.launch_attempt_id,
          options.configurationGenerationId,
          options.effectiveRouteSetId,
          supervisor.owner_id,
          supervisor.lease_epoch,
          worker.owner_id,
          worker.fencing_token,
          worker.worker_mode,
          worker.schema_version,
          observedAt,
          expiresAt,
          options.writer.gateway_instance_id
        );
        return readActivationHandshake(this.db, this.homeId, options.activationId)!;
      }
    });
  }

  acknowledgeSupervisor(options: {
    activationId: string;
    expectedStateRevision: number;
    writer: SupervisorActivationWriter;
  }): ActivationHandshakeRow {
    return this.transitionWithSupervisor({
      ...options,
      expectedStatus: "requested",
      nextStatus: "supervisor_acknowledged",
      validate: ({ handshake, observedAt }) => {
        assertHandshakeCurrentBindings({
          db: this.db,
          homeId: this.homeId,
          handshake,
          observedAt,
          requireWorker: true
        });
      }
    });
  }

  acknowledgeWorker(options: {
    activationId: string;
    expectedStateRevision: number;
    acknowledgement: ActivationWorkerAcknowledgement;
    writer: SupervisorActivationWriter;
  }): ActivationHandshakeRow {
    return this.transitionWithSupervisor({
      activationId: options.activationId,
      expectedStateRevision: options.expectedStateRevision,
      expectedStatus: "supervisor_acknowledged",
      nextStatus: "worker_acknowledged",
      writer: options.writer,
      validate: ({ handshake, observedAt }) => {
        const acknowledgement = options.acknowledgement;
        const exact = (
          acknowledgement.activation_id === handshake.activation_id &&
          acknowledgement.nonce_digest === handshake.nonce_digest &&
          acknowledgement.home_id === handshake.home_id &&
          acknowledgement.worker_owner_id === handshake.worker_owner_id &&
          acknowledgement.worker_fencing_token === handshake.worker_fencing_token &&
          acknowledgement.worker_mode === handshake.worker_mode &&
          acknowledgement.schema_version === handshake.schema_version &&
          acknowledgement.configuration_generation_id ===
            handshake.configuration_generation_id &&
          acknowledgement.effective_route_set_id === handshake.effective_route_set_id &&
          acknowledgement.package_generation_id ===
            handshake.plugin_package_generation_id &&
          acknowledgement.current_activation_revision ===
            handshake.current_activation_revision &&
          acknowledgement.launch_activation_revision_at_consumption ===
            handshake.launch_activation_revision_at_consumption &&
          acknowledgement.launch_authorization_id === handshake.launch_authorization_id &&
          acknowledgement.launch_authorization_revision ===
            handshake.launch_authorization_revision &&
          acknowledgement.launch_authorization_state_revision_at_consumption ===
            handshake.launch_authorization_state_revision_at_consumption &&
          acknowledgement.launch_authorization_role === handshake.launch_authorization_role &&
          acknowledgement.supervisor_launch_attempt_id ===
            handshake.supervisor_launch_attempt_id
        );
        if (!exact) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Worker IPC acknowledgement does not match the exact nonce and authority binding."
          );
        }
        assertHandshakeCurrentBindings({
          db: this.db,
          homeId: this.homeId,
          handshake,
          observedAt,
          requireWorker: true
        });
      }
    });
  }

  complete(options: {
    activationId: string;
    expectedStateRevision: number;
    writer: SupervisorActivationWriter;
  }): ActivationHandshakeRow {
    return this.transitionWithSupervisor({
      ...options,
      expectedStatus: "worker_acknowledged",
      nextStatus: "complete",
      validate: ({ handshake, observedAt }) => {
        assertHandshakeCurrentBindings({
          db: this.db,
          homeId: this.homeId,
          handshake,
          observedAt,
          requireWorker: true
        });
        const activation = readPackageActivationAuthority(this.db, this.homeId)!;
        if (handshake.handshake_purpose === "preactivation_verification") {
          if (
            activation.activation_state !== "preactivation_verifying" ||
            activation.preactivation_handshake_id !== handshake.activation_id ||
            activation.pending_package_generation_id !==
              handshake.pending_package_generation_id ||
            handshake.worker_mode !== "activation_only" ||
            !activation.activation_deadline_at ||
            toProcessAuthorityEpochMs(activation.activation_deadline_at) <=
              toProcessAuthorityEpochMs(observedAt)
          ) {
            throw new RuntimeActivationError(
              "EE_ACTIVATION_HANDSHAKE_STALE",
              "Preactivation completion predicate is not current."
            );
          }
        } else if (
          !["production_activating", "active"].includes(activation.activation_state) ||
          activation.active_package_generation_id !==
            handshake.active_package_generation_id ||
          activation.pending_package_generation_id !== null ||
          handshake.worker_mode !== "production"
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Production completion predicate is not current."
          );
        }
      }
    });
  }

  expireOrReject(options: {
    activationId: string;
    expectedStateRevision: number;
    targetStatus: "expired" | "rejected";
    failureCode: string;
    writer: SupervisorActivationWriter;
  }): ActivationHandshakeRow {
    return this.transitionWithSupervisor({
      ...options,
      expectedStatus: undefined,
      nextStatus: options.targetStatus,
      validate: ({ handshake, observedAt }) => {
        if (["complete", "expired", "rejected"].includes(handshake.status)) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Terminal activation handshakes cannot transition again."
          );
        }
        if (
          options.targetStatus === "expired" &&
          toProcessAuthorityEpochMs(handshake.expires_at) >
            toProcessAuthorityEpochMs(observedAt)
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Activation handshake cannot expire before its exact deadline."
          );
        }
      },
      failureCode: options.failureCode
    });
  }

  private transitionWithSupervisor(options: {
    activationId: string;
    expectedStateRevision: number;
    expectedStatus: ActivationHandshakeState | undefined;
    nextStatus: ActivationHandshakeState;
    writer: SupervisorActivationWriter;
    validate: (context: {
      handshake: ActivationHandshakeRow;
      observedAt: string;
    }) => void;
    failureCode?: string;
  }): ActivationHandshakeRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentSupervisorWriter({
          db: this.db,
          homeId: this.homeId,
          writer: options.writer,
          observedAt
        });
        const handshake = readActivationHandshake(
          this.db,
          this.homeId,
          options.activationId
        );
        if (
          !handshake ||
          handshake.state_revision !== options.expectedStateRevision ||
          (options.expectedStatus !== undefined &&
            handshake.status !== options.expectedStatus) ||
          !transitionAllowed(handshake.status, options.nextStatus) ||
          toProcessAuthorityEpochMs(handshake.expires_at) <=
            toProcessAuthorityEpochMs(observedAt) && options.nextStatus !== "expired"
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Activation handshake transition lost its exact revision, state, or expiry CAS."
          );
        }
        if (
          handshake.supervisor_owner_id !== options.writer.supervisor_owner_id ||
          handshake.supervisor_lease_epoch !== options.writer.supervisor_lease_epoch
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Activation handshake is bound to a different supervisor owner or epoch."
          );
        }
        options.validate({ handshake, observedAt });
        const update = this.db.prepare(
          `UPDATE activation_handshakes
           SET state_revision = state_revision + 1,
               status = ?,
               supervisor_acknowledged_at = CASE
                 WHEN ? = 'supervisor_acknowledged' THEN ?
                 ELSE supervisor_acknowledged_at
               END,
               worker_acknowledged_at = CASE
                 WHEN ? = 'worker_acknowledged' THEN ?
                 ELSE worker_acknowledged_at
               END,
               acknowledged_at = CASE
                 WHEN ? = 'complete' THEN ?
                 ELSE acknowledged_at
               END,
               failure_code = ?,
               last_writer_kind = 'supervisor',
               last_writer_owner_id = ?,
               last_writer_supervisor_lease_epoch = ?
           WHERE home_id = ?
             AND activation_id = ?
             AND state_revision = ?
             AND status = ?`
        ).run(
          options.nextStatus,
          options.nextStatus,
          observedAt,
          options.nextStatus,
          observedAt,
          options.nextStatus,
          observedAt,
          options.failureCode ?? null,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          this.homeId,
          options.activationId,
          options.expectedStateRevision,
          handshake.status
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Activation handshake transition changed zero rows."
          );
        }
        return readActivationHandshake(this.db, this.homeId, options.activationId)!;
      }
    });
  }
}
