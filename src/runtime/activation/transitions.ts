import type { DatabaseSync } from "node:sqlite";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import {
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
  readActivationHandshake,
  readPackageActivationAuthority,
  readWorkerLeaseByHome
} from "./database.js";
import { RuntimeActivationError } from "./errors.js";
import {
  assertPackageActivationShape,
  assertRequestedWriterMode,
  isLegalPackageActivationEdge
} from "./state-contract.js";
import type {
  PackageActivationAuthorityRow,
  SupervisorActivationWriter
} from "./types.js";

const assertCurrentSupervisor = (options: {
  db: DatabaseSync;
  homeId: string;
  writer: SupervisorActivationWriter;
  observedAt: string;
}): void => {
  assertRequestedWriterMode(options.writer);
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
      "Package transition requires the exact current supervisor owner, epoch, and revision."
    );
  }
};

const assertExpectedActivation = (options: {
  row: PackageActivationAuthorityRow | undefined;
  expectedRevision: number;
  expectedState: PackageActivationAuthorityRow["activation_state"];
}): PackageActivationAuthorityRow => {
  if (
    !options.row ||
    options.row.activation_revision !== options.expectedRevision ||
    options.row.activation_state !== options.expectedState
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_STALE",
      `Expected ${options.expectedState} at activation revision ${options.expectedRevision}.`
    );
  }
  return assertPackageActivationShape(options.row);
};

const assertFreshWorker = (options: {
  db: DatabaseSync;
  homeId: string;
  ownerId: string;
  fencingToken: number;
  mode: "activation_only" | "production";
  packageGenerationId: string;
  supervisorOwnerId: string;
  supervisorLeaseEpoch: number;
  observedAt: string;
}) => {
  const worker = readWorkerLeaseByHome(options.db, options.homeId);
  if (
    !worker ||
    worker.owner_id !== options.ownerId ||
    worker.fencing_token !== options.fencingToken ||
    worker.worker_mode !== options.mode ||
    worker.package_generation_id !== options.packageGenerationId ||
    worker.supervisor_owner_id !== options.supervisorOwnerId ||
    worker.supervisor_lease_epoch !== options.supervisorLeaseEpoch ||
    worker.state === "stopped" ||
    toProcessAuthorityEpochMs(worker.expires_at) <=
      toProcessAuthorityEpochMs(options.observedAt)
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_STALE",
      "Package transition requires the exact fresh worker owner, fence, mode, package, and supervisor binding."
    );
  }
  return worker;
};

export class RuntimePackageActivationTransitionRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  enterMigrating(options: {
    expectedActivationRevision: number;
    writer: SupervisorActivationWriter;
  }): PackageActivationAuthorityRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentSupervisor({
          db: this.db,
          homeId: this.homeId,
          writer: options.writer,
          observedAt
        });
        const activation = assertExpectedActivation({
          row: readPackageActivationAuthority(this.db, this.homeId),
          expectedRevision: options.expectedActivationRevision,
          expectedState: "preparing"
        });
        if (activation.active_package_generation_id !== null) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Upgrade and rollback cannot enter migration before the old generation drain completes."
          );
        }
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_state = 'migrating',
               updated_by_kind = 'supervisor',
               updated_by_gateway_instance_id = NULL,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'preparing'
             AND active_package_generation_id IS NULL`
        ).run(
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt,
          this.homeId,
          options.expectedActivationRevision
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Initial migration entry lost the exact preparing revision CAS."
          );
        }
        return assertPackageActivationShape(
          readPackageActivationAuthority(this.db, this.homeId)!
        );
      }
    });
  }

  enterMigratingAfterDrain(options: {
    expectedActivationRevision: number;
    writer: SupervisorActivationWriter;
  }): PackageActivationAuthorityRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentSupervisor({
          db: this.db,
          homeId: this.homeId,
          writer: options.writer,
          observedAt
        });
        const activation = assertExpectedActivation({
          row: readPackageActivationAuthority(this.db, this.homeId),
          expectedRevision: options.expectedActivationRevision,
          expectedState: "draining_old"
        });
        const supervisor = this.db.prepare(
          `SELECT package_generation_id
           FROM supervisor_leases
           WHERE home_id = ?
             AND owner_id = ?
             AND lease_epoch = ?
           LIMIT 1`
        ).get(
          this.homeId,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch
        ) as { package_generation_id: string } | undefined;
        const oldWorker = readWorkerLeaseByHome(this.db, this.homeId);
        if (
          !supervisor ||
          supervisor.package_generation_id !== activation.pending_package_generation_id ||
          oldWorker && oldWorker.state !== "stopped"
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Post-drain migration requires the pending supervisor and a terminal old worker fence."
          );
        }
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_state = 'migrating',
               updated_by_kind = 'supervisor',
               updated_by_gateway_instance_id = NULL,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'draining_old'
             AND pending_package_generation_id = ?`
        ).run(
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt,
          this.homeId,
          options.expectedActivationRevision,
          activation.pending_package_generation_id
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Post-drain migration entry lost the exact package revision CAS."
          );
        }
        return assertPackageActivationShape(
          readPackageActivationAuthority(this.db, this.homeId)!
        );
      }
    });
  }

  beginPreactivationVerification(options: {
    expectedActivationRevision: number;
    handshakeId: string;
    expectedWorkerOwnerId: string;
    expectedWorkerFencingToken: number;
    writer: SupervisorActivationWriter;
  }): PackageActivationAuthorityRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentSupervisor({
          db: this.db,
          homeId: this.homeId,
          writer: options.writer,
          observedAt
        });
        const activation = assertExpectedActivation({
          row: readPackageActivationAuthority(this.db, this.homeId),
          expectedRevision: options.expectedActivationRevision,
          expectedState: "migrating"
        });
        const handshake = readActivationHandshake(
          this.db,
          this.homeId,
          options.handshakeId
        );
        if (
          !handshake ||
          handshake.status !== "requested" ||
          handshake.handshake_purpose !== "preactivation_verification" ||
          handshake.current_activation_revision !== activation.activation_revision ||
          handshake.pending_package_generation_id !==
            activation.pending_package_generation_id ||
          handshake.supervisor_owner_id !== options.writer.supervisor_owner_id ||
          handshake.supervisor_lease_epoch !== options.writer.supervisor_lease_epoch
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Preactivation state entry requires the exact requested handshake binding."
          );
        }
        assertFreshWorker({
          db: this.db,
          homeId: this.homeId,
          ownerId: options.expectedWorkerOwnerId,
          fencingToken: options.expectedWorkerFencingToken,
          mode: "activation_only",
          packageGenerationId: activation.pending_package_generation_id!,
          supervisorOwnerId: options.writer.supervisor_owner_id,
          supervisorLeaseEpoch: options.writer.supervisor_lease_epoch,
          observedAt
        });
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_state = 'preactivation_verifying',
               preactivation_handshake_id = ?,
               updated_by_kind = 'supervisor',
               updated_by_gateway_instance_id = NULL,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'migrating'
             AND pending_package_generation_id = ?
             AND preactivation_handshake_id IS NULL`
        ).run(
          options.handshakeId,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt,
          this.homeId,
          options.expectedActivationRevision,
          activation.pending_package_generation_id
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Preactivation state entry lost its exact package revision CAS."
          );
        }
        return assertPackageActivationShape(
          readPackageActivationAuthority(this.db, this.homeId)!
        );
      }
    });
  }

  publishPendingIdentity(options: {
    expectedActivationRevision: number;
    preactivationHandshakeId: string;
    expectedWorkerOwnerId: string;
    expectedWorkerFencingToken: number;
    writer: SupervisorActivationWriter;
  }): PackageActivationAuthorityRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentSupervisor({
          db: this.db,
          homeId: this.homeId,
          writer: options.writer,
          observedAt
        });
        const activation = assertExpectedActivation({
          row: readPackageActivationAuthority(this.db, this.homeId),
          expectedRevision: options.expectedActivationRevision,
          expectedState: "preactivation_verifying"
        });
        const handshake = readActivationHandshake(
          this.db,
          this.homeId,
          options.preactivationHandshakeId
        );
        if (
          !handshake ||
          handshake.status !== "complete" ||
          handshake.handshake_purpose !== "preactivation_verification" ||
          activation.preactivation_handshake_id !== handshake.activation_id ||
          handshake.current_activation_revision !== activation.activation_revision ||
          handshake.pending_package_generation_id !==
            activation.pending_package_generation_id ||
          handshake.worker_owner_id !== options.expectedWorkerOwnerId ||
          handshake.worker_fencing_token !== options.expectedWorkerFencingToken
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Pending-to-active identity CAS requires the exact complete preactivation handshake."
          );
        }
        const worker = assertFreshWorker({
          db: this.db,
          homeId: this.homeId,
          ownerId: options.expectedWorkerOwnerId,
          fencingToken: options.expectedWorkerFencingToken,
          mode: "activation_only",
          packageGenerationId: activation.pending_package_generation_id!,
          supervisorOwnerId: options.writer.supervisor_owner_id,
          supervisorLeaseEpoch: options.writer.supervisor_lease_epoch,
          observedAt
        });
        const workerStop = this.db.prepare(
          `UPDATE worker_leases
           SET state = 'stopped',
               shutdown_requested_at = ?,
               drain_deadline_at = NULL,
               heartbeat_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND owner_id = ?
             AND fencing_token = ?
             AND worker_mode = 'activation_only'
             AND state <> 'stopped'
             AND expires_at > ?`
        ).run(
          observedAt,
          observedAt,
          this.homeId,
          worker.owner_id,
          worker.fencing_token,
          observedAt
        );
        const nextRevision = activation.activation_revision + 1;
        const packageUpdate = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_revision = ?,
               previous_package_generation_id = active_package_generation_id,
               active_package_generation_id = pending_package_generation_id,
               pending_package_generation_id = NULL,
               pending_transition_kind = 'none',
               production_activation_handshake_id = NULL,
               activation_state = 'production_activating',
               blocked_boundary = 'none',
               blocked_from_state = 'none',
               updated_by_kind = 'supervisor',
               updated_by_gateway_instance_id = NULL,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'preactivation_verifying'
             AND preactivation_handshake_id = ?
             AND pending_package_generation_id = ?`
        ).run(
          nextRevision,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt,
          this.homeId,
          options.expectedActivationRevision,
          options.preactivationHandshakeId,
          activation.pending_package_generation_id
        );
        if (!changedOneRow(workerStop) || !changedOneRow(packageUpdate)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Pending identity CAS did not atomically invalidate the activation-only worker and advance package authority."
          );
        }
        return assertPackageActivationShape(
          readPackageActivationAuthority(this.db, this.homeId)!
        );
      }
    });
  }

  publishProductionActive(options: {
    expectedActivationRevision: number;
    productionHandshakeId: string;
    expectedWorkerOwnerId: string;
    expectedWorkerFencingToken: number;
    writer: SupervisorActivationWriter;
  }): PackageActivationAuthorityRow {
    return this.publishProductionHandshake({
      ...options,
      expectedState: "production_activating",
      allowRevisionChange: false
    });
  }

  replaceActiveProductionHandshake(options: {
    expectedActivationRevision: number;
    productionHandshakeId: string;
    expectedWorkerOwnerId: string;
    expectedWorkerFencingToken: number;
    writer: SupervisorActivationWriter;
  }): PackageActivationAuthorityRow {
    return this.publishProductionHandshake({
      ...options,
      expectedState: "active",
      allowRevisionChange: false
    });
  }

  private publishProductionHandshake(options: {
    expectedActivationRevision: number;
    productionHandshakeId: string;
    expectedWorkerOwnerId: string;
    expectedWorkerFencingToken: number;
    writer: SupervisorActivationWriter;
    expectedState: "production_activating" | "active";
    allowRevisionChange: false;
  }): PackageActivationAuthorityRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentSupervisor({
          db: this.db,
          homeId: this.homeId,
          writer: options.writer,
          observedAt
        });
        const activation = assertExpectedActivation({
          row: readPackageActivationAuthority(this.db, this.homeId),
          expectedRevision: options.expectedActivationRevision,
          expectedState: options.expectedState
        });
        const handshake = readActivationHandshake(
          this.db,
          this.homeId,
          options.productionHandshakeId
        );
        if (
          !handshake ||
          handshake.status !== "complete" ||
          handshake.handshake_purpose !== "production_activation" ||
          handshake.current_activation_revision !== activation.activation_revision ||
          handshake.active_package_generation_id !==
            activation.active_package_generation_id ||
          handshake.pending_package_generation_id !== null ||
          handshake.worker_owner_id !== options.expectedWorkerOwnerId ||
          handshake.worker_fencing_token !== options.expectedWorkerFencingToken ||
          handshake.worker_mode !== "production"
        ) {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Active publication requires the exact complete production activation handshake."
          );
        }
        assertFreshWorker({
          db: this.db,
          homeId: this.homeId,
          ownerId: options.expectedWorkerOwnerId,
          fencingToken: options.expectedWorkerFencingToken,
          mode: "production",
          packageGenerationId: activation.active_package_generation_id!,
          supervisorOwnerId: options.writer.supervisor_owner_id,
          supervisorLeaseEpoch: options.writer.supervisor_lease_epoch,
          observedAt
        });
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET production_activation_handshake_id = ?,
               activation_state = 'active',
               activation_deadline_at = NULL,
               blocked_boundary = 'none',
               blocked_from_state = 'none',
               updated_by_kind = 'supervisor',
               updated_by_gateway_instance_id = NULL,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = ?
             AND active_package_generation_id = ?
             AND pending_package_generation_id IS NULL`
        ).run(
          options.productionHandshakeId,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt,
          this.homeId,
          options.expectedActivationRevision,
          options.expectedState,
          activation.active_package_generation_id
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Production activation publication lost its exact package CAS."
          );
        }
        return assertPackageActivationShape(
          readPackageActivationAuthority(this.db, this.homeId)!
        );
      }
    });
  }

  private supervisorStateTransition(options: {
    expectedActivationRevision: number;
    expectedState: PackageActivationAuthorityRow["activation_state"];
    nextState: PackageActivationAuthorityRow["activation_state"];
    writer: SupervisorActivationWriter;
    mutate: (row: PackageActivationAuthorityRow) => {
      sql: string;
      params: Array<string | number | null>;
    };
  }): PackageActivationAuthorityRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentSupervisor({
          db: this.db,
          homeId: this.homeId,
          writer: options.writer,
          observedAt
        });
        const activation = assertExpectedActivation({
          row: readPackageActivationAuthority(this.db, this.homeId),
          expectedRevision: options.expectedActivationRevision,
          expectedState: options.expectedState
        });
        if (!isLegalPackageActivationEdge(options.expectedState, options.nextState)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            `Illegal activation edge ${options.expectedState} -> ${options.nextState}.`
          );
        }
        const extra = options.mutate(activation);
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_state = ?,
               updated_by_kind = 'supervisor',
               updated_by_gateway_instance_id = NULL,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
               ${extra.sql}
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = ?`
        ).run(
          options.nextState,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt,
          ...extra.params,
          this.homeId,
          options.expectedActivationRevision,
          options.expectedState
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Supervisor package transition lost its exact revision and state CAS."
          );
        }
        return assertPackageActivationShape(
          readPackageActivationAuthority(this.db, this.homeId)!
        );
      }
    });
  }
}
