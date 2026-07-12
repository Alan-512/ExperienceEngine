import type { DatabaseSync } from "node:sqlite";
import type {
  RuntimePackageGenerationIdentity
} from "../identity/types.js";
import {
  RUNTIME_SCHEMA_VERSION_ORDER
} from "../schema/constants.js";
import {
  readRuntimeMigrationState
} from "../schema/migration-authority.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  ACTIVATION_ONLY_WORKER_OPERATIONS,
  PRODUCTION_SEMANTIC_WORKER_OPERATIONS,
  RUNTIME_WORKER_PROTOCOL_VERSION,
  SUPERVISOR_RUNTIME_POLICY,
  type ActivationOnlyWorkerOperation,
  type ProductionSemanticWorkerOperation,
  type WorkerLeaseState,
  type WorkerMode
} from "./constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "./clock.js";
import {
  changedOneRow,
  readSupervisorLease,
  readWorkerLease
} from "./database.js";
import { RuntimeProcessAuthorityError } from "./errors.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "./fresh-supervisor-authority.js";
import {
  computeBoundedRestartDecision,
  computeGracefulDrainDeadline,
  evaluateWorkerOperation
} from "./lifecycle.js";
import type {
  ExpectedSupervisorAuthority,
  ExpectedWorkerAuthority,
  ProcessExitEvidence,
  RuntimeProcessAuthorityClock,
  S6ProductionWriteAuthorityProvider,
  S6WorkerAcquisitionAuthorityProvider,
  WorkerLeaseRow,
  WorkerOperation
} from "./types.js";

const activationOnlyOperations = new Set<string>(ACTIVATION_ONLY_WORKER_OPERATIONS);
const semanticOperations = new Set<string>(PRODUCTION_SEMANTIC_WORKER_OPERATIONS);

type PackageActivationWorkerProjection = {
  activation_revision: number;
  active_package_generation_id: string | null;
  pending_package_generation_id: string | null;
  pending_transition_kind: "none" | "initial" | "upgrade" | "rollback";
  activation_deadline_at: string | null;
  activation_state:
    | "uninitialized"
    | "preparing"
    | "draining_old"
    | "migrating"
    | "preactivation_verifying"
    | "production_activating"
    | "active"
    | "blocked";
};

const readPackageActivationWorkerProjection = (
  db: DatabaseSync,
  homeId: string
): PackageActivationWorkerProjection | undefined => db.prepare(
  `SELECT
    activation_revision,
    active_package_generation_id,
    pending_package_generation_id,
    pending_transition_kind,
    activation_deadline_at,
    activation_state
   FROM package_activation_state
   WHERE home_id = ? LIMIT 1`
).get(homeId) as PackageActivationWorkerProjection | undefined;

export const UNAVAILABLE_S6_WORKER_ACQUISITION_AUTHORITY_PROVIDER:
S6WorkerAcquisitionAuthorityProvider = Object.freeze({
  getWorkerAcquisitionAuthorityInTransaction(): {
    available: false;
    fresh: false;
    authority_contract_version: "s6-worker-acquisition-authority-v1";
    reason: "s6_not_connected";
  } {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "s6-worker-acquisition-authority-v1",
      reason: "s6_not_connected"
    };
  }
});

export const UNAVAILABLE_S6_PRODUCTION_WRITE_AUTHORITY_PROVIDER:
S6ProductionWriteAuthorityProvider = Object.freeze({
  getProductionWriteAuthorityInTransaction(): {
    available: false;
    fresh: false;
    authority_contract_version: "s6-production-write-authority-v1";
    reason: "s6_not_connected";
  } {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "s6-production-write-authority-v1",
      reason: "s6_not_connected"
    };
  }
});

const assertSupervisorExpectation = (options: {
  evidence: ReturnType<typeof evaluateFreshSupervisorAuthorityInTransaction>;
  expected: ExpectedSupervisorAuthority;
}): void => {
  const evidence = options.evidence;
  if (
    !evidence.available ||
    !evidence.fresh ||
    evidence.supervisor_owner_id !== options.expected.owner_id ||
    evidence.supervisor_owner_process_id !== options.expected.owner_process_id ||
    evidence.supervisor_owner_process_start_token !==
      options.expected.owner_process_start_token ||
    evidence.supervisor_lease_epoch !== options.expected.lease_epoch ||
    evidence.supervisor_lease_state_revision !== options.expected.lease_state_revision
  ) {
    throw new RuntimeProcessAuthorityError(
      "EE_SUPERVISOR_AUTHORITY_STALE",
      "Worker lifecycle mutation requires the exact current supervisor owner, epoch, and revision."
    );
  }
};

const assertCurrentWorker = (options: {
  worker: WorkerLeaseRow | undefined;
  expected: ExpectedWorkerAuthority;
  observedAt: string;
}): WorkerLeaseRow => {
  const worker = options.worker;
  if (
    !worker ||
    worker.owner_id !== options.expected.owner_id ||
    worker.owner_process_id !== options.expected.owner_process_id ||
    worker.owner_process_start_token !== options.expected.owner_process_start_token ||
    worker.fencing_token !== options.expected.fencing_token ||
    worker.state === "stopped" ||
    toProcessAuthorityEpochMs(worker.expires_at) <=
      toProcessAuthorityEpochMs(options.observedAt)
  ) {
    throw new RuntimeProcessAuthorityError(
      "EE_WORKER_AUTHORITY_STALE",
      "Worker owner or fencing token is not current."
    );
  }
  return worker;
};

const assertWorkerStateTransition = (
  current: WorkerLeaseState,
  next: WorkerLeaseState
): void => {
  const transitions: Record<WorkerLeaseState, readonly WorkerLeaseState[]> = {
    starting: ["starting", "active", "draining", "blocked", "stopped"],
    active: ["active", "draining", "blocked", "stopped"],
    draining: ["draining", "blocked", "stopped"],
    blocked: ["blocked", "draining", "stopped"],
    stopped: []
  };
  if (!transitions[current].includes(next)) {
    throw new RuntimeProcessAuthorityError(
      "EE_PROCESS_AUTHORITY_INVALID",
      `Worker lease cannot transition from ${current} to ${next}.`
    );
  }
};

export class RuntimeWorkerAuthorityRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly acquisitionProvider: S6WorkerAcquisitionAuthorityProvider =
      UNAVAILABLE_S6_WORKER_ACQUISITION_AUTHORITY_PROVIDER,
    private readonly productionWriteProvider: S6ProductionWriteAuthorityProvider =
      UNAVAILABLE_S6_PRODUCTION_WRITE_AUTHORITY_PROVIDER,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  acquire(options: {
    leaseKey: string;
    ownerId: string;
    ownerProcessId: number;
    ownerProcessStartToken: string;
    expectedSupervisor: ExpectedSupervisorAuthority;
    packageIdentity: RuntimePackageGenerationIdentity;
    schemaVersion: string;
    workerMode: WorkerMode;
    transitionRole: "initial_candidate" | "active" | "pending" | "rollback_candidate";
  }): WorkerLeaseRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const evidence = this.acquisitionProvider.getWorkerAcquisitionAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          packageGenerationId: options.packageIdentity.package_generation_id,
          workerMode: options.workerMode,
          supervisorOwnerId: options.expectedSupervisor.owner_id,
          supervisorLeaseEpoch: options.expectedSupervisor.lease_epoch
        });
        if (!evidence.available || !evidence.fresh) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_ACQUISITION_AUTHORITY_REQUIRED",
            "Runtime worker acquisition requires an exact current S6 authority envelope."
          );
        }
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const observedAtMs = toProcessAuthorityEpochMs(observedAt);
        if (
          evidence.home_id !== this.homeId ||
          evidence.package_generation_id !== options.packageIdentity.package_generation_id ||
          evidence.artifact_integrity !== options.packageIdentity.artifact_integrity ||
          evidence.schema_version !== options.schemaVersion ||
          evidence.worker_mode !== options.workerMode ||
          evidence.transition_role !== options.transitionRole ||
          evidence.supervisor_owner_id !== options.expectedSupervisor.owner_id ||
          evidence.supervisor_lease_epoch !== options.expectedSupervisor.lease_epoch ||
          toProcessAuthorityEpochMs(evidence.observed_at) > observedAtMs ||
          toProcessAuthorityEpochMs(evidence.expires_at) <= observedAtMs
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_ACQUISITION_AUTHORITY_REQUIRED",
            "S6 worker authority does not match the exact home, generation, artifact, schema, mode, role, supervisor, or deadline."
          );
        }
        const supervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        assertSupervisorExpectation({
          evidence: supervisor,
          expected: options.expectedSupervisor
        });
        if (
          !supervisor.available ||
          !supervisor.fresh ||
          supervisor.package_generation_id !== options.packageIdentity.package_generation_id ||
          supervisor.artifact_integrity !== options.packageIdentity.artifact_integrity ||
          options.packageIdentity.worker_protocol_version !== RUNTIME_WORKER_PROTOCOL_VERSION
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_ACQUISITION_AUTHORITY_REQUIRED",
            "Worker generation and artifact must match current supervisor authority."
          );
        }
        const activation = readPackageActivationWorkerProjection(this.db, this.homeId);
        if (
          !activation ||
          activation.activation_revision !== evidence.activation_revision ||
          activation.activation_state !== evidence.activation_state ||
          activation.pending_transition_kind !== evidence.pending_transition_kind ||
          activation.active_package_generation_id !==
            evidence.expected_active_package_generation_id ||
          activation.pending_package_generation_id !==
            evidence.expected_pending_package_generation_id ||
          activation.activation_deadline_at !== evidence.activation_deadline_at
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_ACQUISITION_AUTHORITY_REQUIRED",
            "S6 worker authority lost the exact package activation revision, identity, state, transition, or deadline CAS."
          );
        }
        const migration = readRuntimeMigrationState(this.db, this.homeId);
        const currentSchemaIndex = RUNTIME_SCHEMA_VERSION_ORDER.indexOf(
          options.schemaVersion as typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
        );
        const minWriteIndex = RUNTIME_SCHEMA_VERSION_ORDER.indexOf(
          options.packageIdentity.min_write_schema_version as
            typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
        );
        const maxWriteIndex = RUNTIME_SCHEMA_VERSION_ORDER.indexOf(
          options.packageIdentity.max_write_schema_version as
            typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
        );
        if (
          !migration ||
          migration.migration_status !== "ready" ||
          migration.current_schema_version !== options.schemaVersion ||
          migration.target_schema_version !== options.schemaVersion ||
          migration.migration_owner_id !== null ||
          migration.migration_supervisor_lease_epoch !== null ||
          currentSchemaIndex < 0 ||
          minWriteIndex < 0 ||
          maxWriteIndex < minWriteIndex ||
          currentSchemaIndex < minWriteIndex ||
          currentSchemaIndex > maxWriteIndex
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_ACQUISITION_AUTHORITY_REQUIRED",
            "Worker acquisition requires a physically verified ready schema with no active migration owner."
          );
        }
        if (
          !options.leaseKey ||
          !options.ownerId ||
          !Number.isSafeInteger(options.ownerProcessId) ||
          options.ownerProcessId <= 0 ||
          !options.ownerProcessStartToken
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_INVALID",
            "Worker acquisition requires complete owner and process identity."
          );
        }
        const current = readWorkerLease(this.db, this.homeId);
        const currentIsFresh = current &&
          current.state !== "stopped" &&
          toProcessAuthorityEpochMs(current.expires_at) > observedAtMs;
        if (currentIsFresh) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_CONFLICT",
            "A fresh worker already owns the canonical home."
          );
        }
        const nextFence = (current?.fencing_token ?? 0) + 1;
        const expiresAt = new Date(
          observedAtMs + SUPERVISOR_RUNTIME_POLICY.lease_duration_ms
        ).toISOString();
        if (!current) {
          this.db.prepare(
            `INSERT INTO worker_leases (
              worker_lease_key,
              home_id,
              owner_id,
              owner_process_id,
              owner_process_start_token,
              supervisor_owner_id,
              supervisor_lease_epoch,
              package_generation_id,
              artifact_integrity,
              worker_protocol_version,
              schema_version,
              fencing_token,
              worker_mode,
              state,
              started_at,
              heartbeat_at,
              expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'starting', ?, ?, ?)`
          ).run(
            options.leaseKey,
            this.homeId,
            options.ownerId,
            options.ownerProcessId,
            options.ownerProcessStartToken,
            options.expectedSupervisor.owner_id,
            options.expectedSupervisor.lease_epoch,
            options.packageIdentity.package_generation_id,
            options.packageIdentity.artifact_integrity,
            RUNTIME_WORKER_PROTOCOL_VERSION,
            options.schemaVersion,
            nextFence,
            options.workerMode,
            observedAt,
            observedAt,
            expiresAt
          );
        } else {
          const update = this.db.prepare(
            `UPDATE worker_leases
             SET worker_lease_key = ?,
                 owner_id = ?,
                 owner_process_id = ?,
                 owner_process_start_token = ?,
                 supervisor_owner_id = ?,
                 supervisor_lease_epoch = ?,
                 package_generation_id = ?,
                 artifact_integrity = ?,
                 worker_protocol_version = ?,
                 schema_version = ?,
                 fencing_token = ?,
                 worker_mode = ?,
                 state = 'starting',
                 started_at = ?,
                 heartbeat_at = ?,
                 expires_at = ?,
                 shutdown_requested_at = NULL,
                 drain_deadline_at = NULL,
                 last_failure_code = NULL
             WHERE home_id = ?
               AND fencing_token = ?
               AND (state = 'stopped' OR expires_at <= ?)`
          ).run(
            options.leaseKey,
            options.ownerId,
            options.ownerProcessId,
            options.ownerProcessStartToken,
            options.expectedSupervisor.owner_id,
            options.expectedSupervisor.lease_epoch,
            options.packageIdentity.package_generation_id,
            options.packageIdentity.artifact_integrity,
            RUNTIME_WORKER_PROTOCOL_VERSION,
            options.schemaVersion,
            nextFence,
            options.workerMode,
            observedAt,
            observedAt,
            expiresAt,
            this.homeId,
            current.fencing_token,
            observedAt
          );
          if (!changedOneRow(update)) {
            throw new RuntimeProcessAuthorityError(
              "EE_WORKER_AUTHORITY_STALE",
              "Worker takeover lost the stale-owner fencing CAS."
            );
          }
        }
        return readWorkerLease(this.db, this.homeId)!;
      }
    });
  }

  renew(options: {
    expectedWorker: ExpectedWorkerAuthority;
    expectedSupervisor: ExpectedSupervisorAuthority;
    nextState: "starting" | "active" | "draining" | "blocked";
  }): WorkerLeaseRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const supervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        assertSupervisorExpectation({ evidence: supervisor, expected: options.expectedSupervisor });
        const worker = assertCurrentWorker({
          worker: readWorkerLease(this.db, this.homeId),
          expected: options.expectedWorker,
          observedAt
        });
        if (
          worker.supervisor_owner_id !== options.expectedSupervisor.owner_id ||
          worker.supervisor_lease_epoch !== options.expectedSupervisor.lease_epoch ||
          worker.worker_protocol_version !== RUNTIME_WORKER_PROTOCOL_VERSION ||
          !supervisor.available ||
          !supervisor.fresh ||
          worker.package_generation_id !== supervisor.package_generation_id ||
          worker.artifact_integrity !== supervisor.artifact_integrity
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_AUTHORITY_STALE",
            "Worker renewal is bound to a different supervisor epoch."
          );
        }
        assertWorkerStateTransition(worker.state, options.nextState);
        const expiresAt = new Date(
          toProcessAuthorityEpochMs(observedAt) +
            SUPERVISOR_RUNTIME_POLICY.lease_duration_ms
        ).toISOString();
        const update = this.db.prepare(
          `UPDATE worker_leases
           SET state = ?,
               heartbeat_at = ?,
               expires_at = ?,
               shutdown_requested_at = CASE WHEN ? = 'draining' THEN COALESCE(shutdown_requested_at, ?) ELSE shutdown_requested_at END,
               drain_deadline_at = CASE WHEN ? = 'draining' THEN COALESCE(drain_deadline_at, ?) ELSE drain_deadline_at END
           WHERE home_id = ?
             AND owner_id = ?
             AND fencing_token = ?
             AND state <> 'stopped'`
        ).run(
          options.nextState,
          observedAt,
          expiresAt,
          options.nextState,
          observedAt,
          options.nextState,
          options.nextState === "draining" ? computeGracefulDrainDeadline(observedAt) : null,
          this.homeId,
          options.expectedWorker.owner_id,
          options.expectedWorker.fencing_token
        );
        if (!changedOneRow(update)) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_AUTHORITY_STALE",
            "Worker renewal lost its owner/fence CAS."
          );
        }
        return readWorkerLease(this.db, this.homeId)!;
      }
    });
  }

  requestDrain(options: {
    expectedWorker: ExpectedWorkerAuthority;
    expectedSupervisor: ExpectedSupervisorAuthority;
  }): WorkerLeaseRow {
    return this.renew({
      ...options,
      nextState: "draining"
    });
  }

  release(options: {
    expectedWorker: ExpectedWorkerAuthority;
    expectedSupervisor: ExpectedSupervisorAuthority;
  }): WorkerLeaseRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const supervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        assertSupervisorExpectation({ evidence: supervisor, expected: options.expectedSupervisor });
        const worker = assertCurrentWorker({
          worker: readWorkerLease(this.db, this.homeId),
          expected: options.expectedWorker,
          observedAt
        });
        assertWorkerStateTransition(worker.state, "stopped");
        const terminalHeartbeatAt = new Date(Math.max(
          toProcessAuthorityEpochMs(worker.started_at),
          toProcessAuthorityEpochMs(observedAt) - 1
        )).toISOString();
        const terminalExpiresAt = toProcessAuthorityEpochMs(observedAt) >
          toProcessAuthorityEpochMs(terminalHeartbeatAt)
          ? observedAt
          : new Date(toProcessAuthorityEpochMs(terminalHeartbeatAt) + 1).toISOString();
        const update = this.db.prepare(
          `UPDATE worker_leases
           SET state = 'stopped',
               heartbeat_at = ?,
               expires_at = ?,
               shutdown_requested_at = COALESCE(shutdown_requested_at, ?),
               drain_deadline_at = COALESCE(drain_deadline_at, ?)
           WHERE home_id = ?
             AND owner_id = ?
             AND fencing_token = ?
             AND state <> 'stopped'`
        ).run(
          terminalHeartbeatAt,
          terminalExpiresAt,
          observedAt,
          observedAt,
          this.homeId,
          options.expectedWorker.owner_id,
          options.expectedWorker.fencing_token
        );
        if (!changedOneRow(update)) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_AUTHORITY_STALE",
            "Worker release lost its owner/fence CAS."
          );
        }
        return readWorkerLease(this.db, this.homeId)!;
      }
    });
  }

  recordCrashAndConsumeRestartBudget(options: {
    expectedWorker: ExpectedWorkerAuthority;
    expectedSupervisor: ExpectedSupervisorAuthority;
    processExitEvidence: ProcessExitEvidence;
    failureCode: string;
  }): {
    worker: WorkerLeaseRow;
    restartAllowed: boolean;
    nextRestartAt: string | null;
    restartCountInWindow: number;
  } {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const supervisorEvidence = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        assertSupervisorExpectation({
          evidence: supervisorEvidence,
          expected: options.expectedSupervisor
        });
        const worker = assertCurrentWorker({
          worker: readWorkerLease(this.db, this.homeId),
          expected: options.expectedWorker,
          observedAt
        });
        if (
          options.processExitEvidence.owner_id !== options.expectedWorker.owner_id ||
          options.processExitEvidence.process_id !== worker.owner_process_id ||
          options.processExitEvidence.process_start_token !== worker.owner_process_start_token
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_IDENTITY_MISMATCH",
            "Worker crash handling requires exact owner, PID, and process-start token evidence."
          );
        }
        const supervisor = readSupervisorLease(this.db, this.homeId);
        if (!supervisor) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_REQUIRED",
            "Worker restart budgeting requires a current supervisor lease row."
          );
        }
        const restart = computeBoundedRestartDecision({
          countInWindow: supervisor.worker_restart_count_in_window,
          windowStartedAt: supervisor.worker_restart_window_started_at,
          observedAt,
          kind: "worker_restart"
        });
        const terminalHeartbeatAt = new Date(Math.max(
          toProcessAuthorityEpochMs(worker.started_at),
          toProcessAuthorityEpochMs(observedAt) - 1
        )).toISOString();
        const terminalExpiresAt = toProcessAuthorityEpochMs(observedAt) >
          toProcessAuthorityEpochMs(terminalHeartbeatAt)
          ? observedAt
          : new Date(toProcessAuthorityEpochMs(terminalHeartbeatAt) + 1).toISOString();
        const workerUpdate = this.db.prepare(
          `UPDATE worker_leases
           SET state = 'stopped',
               heartbeat_at = ?,
               expires_at = ?,
               shutdown_requested_at = COALESCE(shutdown_requested_at, ?),
               last_failure_code = ?
           WHERE home_id = ?
             AND owner_id = ?
             AND fencing_token = ?
             AND owner_process_id = ?
             AND owner_process_start_token = ?
             AND state <> 'stopped'`
        ).run(
          terminalHeartbeatAt,
          terminalExpiresAt,
          observedAt,
          options.failureCode,
          this.homeId,
          options.expectedWorker.owner_id,
          options.expectedWorker.fencing_token,
          worker.owner_process_id,
          worker.owner_process_start_token
        );
        const supervisorUpdate = this.db.prepare(
          `UPDATE supervisor_leases
           SET lease_state_revision = lease_state_revision + 1,
               worker_restart_window_started_at = ?,
               worker_restart_count_in_window = ?,
               state = CASE WHEN ? = 1 THEN state ELSE 'blocked' END,
               last_failure_code = CASE WHEN ? = 1 THEN last_failure_code ELSE 'worker_restart_budget_exhausted' END
           WHERE home_id = ?
             AND owner_id = ?
             AND lease_epoch = ?
             AND lease_state_revision = ?
             AND lease_terminal_at IS NULL`
        ).run(
          restart.windowStartedAt,
          restart.nextCountInWindow,
          restart.allowed ? 1 : 0,
          restart.allowed ? 1 : 0,
          this.homeId,
          options.expectedSupervisor.owner_id,
          options.expectedSupervisor.lease_epoch,
          options.expectedSupervisor.lease_state_revision
        );
        if (!changedOneRow(workerUpdate) || !changedOneRow(supervisorUpdate)) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_AUTHORITY_STALE",
            "Worker crash handling did not atomically win worker and supervisor revision CAS."
          );
        }
        return {
          worker: readWorkerLease(this.db, this.homeId)!,
          restartAllowed: restart.allowed,
          nextRestartAt: restart.nextLaunchAt,
          restartCountInWindow: restart.nextCountInWindow
        };
      }
    });
  }

  assertProtectedOperation(options: {
    expectedWorker: ExpectedWorkerAuthority;
    operation: WorkerOperation;
  }): {
    allowed: true;
    effectiveMode: "production" | "activation_only";
    semanticWriteAuthorized: boolean;
    worker: WorkerLeaseRow;
  } {
    return runRuntimeImmediateTransaction(this.db, {
      category: "protected_result_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const worker = assertCurrentWorker({
          worker: readWorkerLease(this.db, this.homeId),
          expected: options.expectedWorker,
          observedAt
        });
        const supervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        if (
          !supervisor.available ||
          !supervisor.fresh ||
          supervisor.supervisor_owner_id !== worker.supervisor_owner_id ||
          supervisor.supervisor_lease_epoch !== worker.supervisor_lease_epoch ||
          supervisor.package_generation_id !== worker.package_generation_id ||
          supervisor.artifact_integrity !== worker.artifact_integrity
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_AUTHORITY_STALE",
            "Worker protected operation requires its exact current supervisor authority."
          );
        }
        if (worker.worker_protocol_version !== RUNTIME_WORKER_PROTOCOL_VERSION) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_AUTHORITY_STALE",
            "Worker protected operation requires the current worker protocol version."
          );
        }
        const migration = readRuntimeMigrationState(this.db, this.homeId);
        if (
          !migration ||
          migration.migration_status !== "ready" ||
          migration.current_schema_version !== worker.schema_version ||
          migration.target_schema_version !== worker.schema_version ||
          migration.migration_owner_id !== null
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_OPERATION_FORBIDDEN",
            "Worker protected operation requires the physically verified current ready schema."
          );
        }
        if (activationOnlyOperations.has(options.operation)) {
          const decision = evaluateWorkerOperation({
            workerMode: worker.worker_mode,
            operation: options.operation as ActivationOnlyWorkerOperation,
            productionActivationAuthorized: false
          });
          if (!decision.allowed) {
            throw new RuntimeProcessAuthorityError(
              "EE_WORKER_OPERATION_FORBIDDEN",
              `Worker operation ${options.operation} is not allowed before production activation.`
            );
          }
          return {
            allowed: true,
            effectiveMode: decision.effectiveMode,
            semanticWriteAuthorized: false,
            worker
          };
        }
        if (!semanticOperations.has(options.operation)) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_OPERATION_FORBIDDEN",
            `Unknown worker protected operation ${options.operation}.`
          );
        }
        const productionEvidence = this.productionWriteProvider
          .getProductionWriteAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            workerOwnerId: worker.owner_id,
            workerFencingToken: worker.fencing_token,
            operation: options.operation as ProductionSemanticWorkerOperation
          });
        if (
          !productionEvidence.available ||
          !productionEvidence.fresh ||
          productionEvidence.home_id !== this.homeId ||
          productionEvidence.worker_owner_id !== worker.owner_id ||
          productionEvidence.worker_fencing_token !== worker.fencing_token ||
          productionEvidence.supervisor_owner_id !== worker.supervisor_owner_id ||
          productionEvidence.supervisor_lease_epoch !== worker.supervisor_lease_epoch ||
          productionEvidence.package_generation_id !== worker.package_generation_id ||
          productionEvidence.schema_version !== worker.schema_version ||
          productionEvidence.operation !== options.operation ||
          toProcessAuthorityEpochMs(productionEvidence.observed_at) >
            toProcessAuthorityEpochMs(observedAt) ||
          toProcessAuthorityEpochMs(productionEvidence.expires_at) <=
            toProcessAuthorityEpochMs(observedAt)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_OPERATION_FORBIDDEN",
            "Production semantic worker operations remain disabled until exact S6 production authority is current."
          );
        }
        const decision = evaluateWorkerOperation({
          workerMode: worker.worker_mode,
          operation: options.operation as ProductionSemanticWorkerOperation,
          productionActivationAuthorized: true
        });
        if (!decision.allowed) {
          throw new RuntimeProcessAuthorityError(
            "EE_WORKER_OPERATION_FORBIDDEN",
            "Current worker mode does not permit the requested production semantic operation."
          );
        }
        return {
          allowed: true,
          effectiveMode: "production",
          semanticWriteAuthorized: true,
          worker
        };
      }
    });
  }
}
