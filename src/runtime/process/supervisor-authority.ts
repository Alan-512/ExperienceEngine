import type { DatabaseSync } from "node:sqlite";
import type {
  RuntimePackageGenerationIdentity
} from "../identity/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
  SUPERVISOR_RENEWABLE_STATES,
  SUPERVISOR_RUNTIME_POLICY,
  type SupervisorLeaseState,
  type SupervisorLeaseTerminalReason
} from "./constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "./clock.js";
import {
  assertCurrentGatewayHeartbeat,
  changedOneRow,
  readLaunchAttempt,
  readLaunchAuthorization,
  readSupervisorLaunchState,
  readSupervisorLease,
  readWorkerLease
} from "./database.js";
import { RuntimeProcessAuthorityError } from "./errors.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "./fresh-supervisor-authority.js";
import type {
  ExpectedSupervisorAuthority,
  FreshSupervisorAuthority,
  ProcessExitEvidence,
  RuntimeProcessAuthorityClock,
  SupervisorLeaseRow
} from "./types.js";

type PackageActivationProjection = {
  activation_revision: number;
  active_package_generation_id: string | null;
  pending_package_generation_id: string | null;
  launch_authorization_id: string | null;
  launch_authorized_generation_id: string | null;
  launch_authorization_role: string;
  launch_authorization_state: string;
  launch_authorization_revision: number;
  launch_authorization_state_revision: number;
  launch_authorization_consumed_by_attempt_id: string | null;
};

const readActivation = (
  db: DatabaseSync,
  homeId: string
): PackageActivationProjection | undefined => db.prepare(
  "SELECT * FROM package_activation_state WHERE home_id = ? LIMIT 1"
).get(homeId) as PackageActivationProjection | undefined;

const assertExpectedSupervisor = (
  evidence: FreshSupervisorAuthority,
  expected: ExpectedSupervisorAuthority
): void => {
  if (
    evidence.supervisor_owner_id !== expected.owner_id ||
    evidence.supervisor_owner_process_id !== expected.owner_process_id ||
    evidence.supervisor_owner_process_start_token !==
      expected.owner_process_start_token ||
    evidence.supervisor_lease_epoch !== expected.lease_epoch ||
    evidence.supervisor_lease_state_revision !== expected.lease_state_revision
  ) {
    throw new RuntimeProcessAuthorityError(
      "EE_SUPERVISOR_AUTHORITY_STALE",
      "Caller supervisor owner, epoch, or lease revision is stale."
    );
  }
};

const assertRenewTransition = (
  current: SupervisorLeaseState,
  next: "starting" | "active" | "draining"
): void => {
  const allowed = current === "starting"
    ? new Set(["starting", "active", "draining"])
    : current === "active"
      ? new Set(["active", "draining"])
      : current === "draining"
        ? new Set(["draining"])
        : new Set<string>();
  if (!allowed.has(next)) {
    throw new RuntimeProcessAuthorityError(
      "EE_PROCESS_AUTHORITY_INVALID",
      `Supervisor lease cannot transition from ${current} to ${next} during renewal.`
    );
  }
};

const retryProjection = (launchCount: number, observedAt: string): {
  state: "backoff" | "blocked";
  nextLaunchAt: string | null;
} => {
  const blocked = launchCount >= SUPERVISOR_RUNTIME_POLICY.max_supervisor_launches_per_window;
  if (blocked) {
    return { state: "blocked", nextLaunchAt: null };
  }
  const index = Math.min(
    Math.max(launchCount - 1, 0),
    SUPERVISOR_RUNTIME_POLICY.restart_backoff_ms.length - 1
  );
  return {
    state: "backoff",
    nextLaunchAt: new Date(
      toProcessAuthorityEpochMs(observedAt) +
        SUPERVISOR_RUNTIME_POLICY.restart_backoff_ms[index]
    ).toISOString()
  };
};

export class RuntimeSupervisorAuthorityRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  acquireFromBoundAttempt(options: {
    leaseKey: string;
    ownerId: string;
    ownerProcessId: number;
    ownerProcessStartToken: string;
    packageIdentity: RuntimePackageGenerationIdentity;
    attemptId: string;
    expectedAttemptStateRevision: number;
    expectedLaunchRevision: number;
    expectedAuthorizationRevision: number;
    expectedAuthorizationStateRevision: number;
  }): SupervisorLeaseRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const currentAuthority = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        if (currentAuthority.available && currentAuthority.fresh) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_CONFLICT",
            "A fresh supervisor already owns the canonical home."
          );
        }
        const attempt = readLaunchAttempt(this.db, this.homeId, options.attemptId);
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        const authorization = attempt
          ? readLaunchAuthorization(this.db, this.homeId, attempt.launch_authorization_id)
          : undefined;
        const activation = readActivation(this.db, this.homeId);
        const previousLease = readSupervisorLease(this.db, this.homeId);
        const priorLeaseIsTerminal = !previousLease || (
          (previousLease.state === "stopped" || previousLease.state === "expired") &&
          previousLease.lease_terminal_at !== null &&
          previousLease.lease_terminal_reason !== null
        );
        if (
          !attempt ||
          !launchState ||
          !authorization ||
          !activation ||
          !priorLeaseIsTerminal ||
          attempt.attempt_state !== "reserved_bound" ||
          attempt.attempt_state_revision !== options.expectedAttemptStateRevision ||
          attempt.child_process_id === null ||
          attempt.child_process_start_token === null ||
          attempt.child_process_id !== options.ownerProcessId ||
          attempt.child_process_start_token !== options.ownerProcessStartToken ||
          attempt.supervisor_owner_id !== null ||
          attempt.supervisor_lease_epoch !== null ||
          toProcessAuthorityEpochMs(attempt.attempt_expires_at) <=
            toProcessAuthorityEpochMs(observedAt) ||
          authorization.authorization_state !== "consumed" ||
          authorization.authorization_revision !== options.expectedAuthorizationRevision ||
          authorization.authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          authorization.consumed_by_launch_attempt_id !== options.attemptId ||
          launchState.launch_revision !== options.expectedLaunchRevision ||
          launchState.current_launch_attempt_id !== options.attemptId ||
          launchState.launch_authorization_id !== authorization.launch_authorization_id ||
          launchState.launch_authorization_revision !== options.expectedAuthorizationRevision ||
          launchState.launch_authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          activation.launch_authorization_id !== authorization.launch_authorization_id ||
          activation.launch_authorization_state !== "consumed" ||
          activation.launch_authorization_revision !== options.expectedAuthorizationRevision ||
          activation.launch_authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          activation.launch_authorization_consumed_by_attempt_id !== options.attemptId ||
          activation.launch_authorized_generation_id !== attempt.package_generation_id ||
          activation.launch_authorization_role !== attempt.launch_authorization_role ||
          launchState.expected_current_activation_revision !== activation.activation_revision ||
          launchState.expected_active_package_generation_id !== activation.active_package_generation_id ||
          launchState.expected_pending_package_generation_id !== activation.pending_package_generation_id ||
          options.packageIdentity.package_generation_id !== attempt.package_generation_id ||
          options.packageIdentity.supervisor_protocol_version !==
            RUNTIME_SUPERVISOR_PROTOCOL_VERSION ||
          !options.packageIdentity.artifact_integrity ||
          !options.ownerId ||
          !Number.isSafeInteger(options.ownerProcessId) ||
          options.ownerProcessId <= 0 ||
          !options.ownerProcessStartToken ||
          !options.leaseKey ||
          !options.packageIdentity.package_generation_id
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_REQUIRED",
            "Supervisor acquisition requires one exact bound attempt, consumed authorization, current package projection, and terminal prior lease."
          );
        }
        assertCurrentGatewayHeartbeat({
          db: this.db,
          homeId: this.homeId,
          gatewayInstanceId: attempt.launch_owner_gateway_instance_id,
          gatewayProcessStartToken: attempt.launch_owner_process_start_token,
          packageGenerationId: attempt.package_generation_id,
          observedAt
        });

        const nextEpoch = (previousLease?.lease_epoch ?? 0) + 1;
        const expiresAt = new Date(
          toProcessAuthorityEpochMs(observedAt) +
            SUPERVISOR_RUNTIME_POLICY.lease_duration_ms
        ).toISOString();
        const values = [
          options.leaseKey,
          this.homeId,
          options.ownerId,
          options.ownerProcessId,
          options.ownerProcessStartToken,
          attempt.launch_owner_gateway_instance_id,
          attempt.launch_attempt_id,
          attempt.launch_authorization_id,
          attempt.launch_authorization_revision,
          attempt.launch_authorization_state_revision_at_consumption,
          attempt.launch_authorization_role,
          attempt.launch_activation_revision_at_consumption,
          attempt.package_generation_id,
          options.packageIdentity.artifact_integrity,
          RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
          nextEpoch,
          options.expectedAttemptStateRevision + 1,
          observedAt,
          observedAt,
          expiresAt
        ] as const;
        if (!previousLease) {
          this.db.prepare(
            `INSERT INTO supervisor_leases (
              supervisor_lease_key,
              home_id,
              owner_id,
              owner_process_id,
              owner_process_start_token,
              gateway_instance_id,
              launch_attempt_id,
              launch_authorization_id,
              launch_authorization_revision,
              launch_authorization_state_revision_at_consumption,
              launch_authorization_role,
              launch_activation_revision_at_consumption,
              package_generation_id,
              artifact_integrity,
              supervisor_protocol_version,
              lease_state_revision,
              lease_epoch,
              state,
              launch_attempt_state_revision_at_acquisition,
              started_at,
              heartbeat_at,
              expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'starting', ?, ?, ?, ?)`
          ).run(...values);
        } else {
          const leaseUpdate = this.db.prepare(
            `UPDATE supervisor_leases
             SET supervisor_lease_key = ?,
                 owner_id = ?,
                 owner_process_id = ?,
                 owner_process_start_token = ?,
                 gateway_instance_id = ?,
                 launch_attempt_id = ?,
                 launch_authorization_id = ?,
                 launch_authorization_revision = ?,
                 launch_authorization_state_revision_at_consumption = ?,
                 launch_authorization_role = ?,
                 launch_activation_revision_at_consumption = ?,
                 package_generation_id = ?,
                 artifact_integrity = ?,
                 supervisor_protocol_version = ?,
                 lease_state_revision = 1,
                 lease_epoch = ?,
                 state = 'starting',
                 launch_attempt_state_revision_at_acquisition = ?,
                 worker_restart_window_started_at = NULL,
                 worker_restart_count_in_window = 0,
                 started_at = ?,
                 heartbeat_at = ?,
                 expires_at = ?,
                 shutdown_requested_at = NULL,
                 lease_terminal_at = NULL,
                 lease_terminal_reason = NULL,
                 last_failure_code = NULL
             WHERE home_id = ?
               AND lease_epoch = ?
               AND lease_state_revision = ?
               AND lease_terminal_at IS NOT NULL`
          ).run(
            options.leaseKey,
            options.ownerId,
            options.ownerProcessId,
            options.ownerProcessStartToken,
            attempt.launch_owner_gateway_instance_id,
            attempt.launch_attempt_id,
            attempt.launch_authorization_id,
            attempt.launch_authorization_revision,
            attempt.launch_authorization_state_revision_at_consumption,
            attempt.launch_authorization_role,
            attempt.launch_activation_revision_at_consumption,
            attempt.package_generation_id,
            options.packageIdentity.artifact_integrity,
            RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
            nextEpoch,
            options.expectedAttemptStateRevision + 1,
            observedAt,
            observedAt,
            expiresAt,
            this.homeId,
            previousLease.lease_epoch,
            previousLease.lease_state_revision
          );
          if (!changedOneRow(leaseUpdate)) {
            throw new RuntimeProcessAuthorityError(
              "EE_SUPERVISOR_AUTHORITY_STALE",
              "Supervisor takeover lost the terminal prior-lease revision CAS."
            );
          }
        }
        const attemptUpdate = this.db.prepare(
          `UPDATE supervisor_launch_attempts
           SET attempt_state = 'lease_acquired',
               attempt_state_revision = attempt_state_revision + 1,
               supervisor_owner_id = ?,
               supervisor_lease_epoch = ?,
               lease_acquired_at = ?
           WHERE home_id = ?
             AND launch_attempt_id = ?
             AND attempt_state = 'reserved_bound'
             AND attempt_state_revision = ?
             AND child_process_id = ?
             AND child_process_start_token = ?`
        ).run(
          options.ownerId,
          nextEpoch,
          observedAt,
          this.homeId,
          options.attemptId,
          options.expectedAttemptStateRevision,
          options.ownerProcessId,
          options.ownerProcessStartToken
        );
        const launchUpdate = this.db.prepare(
          `UPDATE supervisor_launch_state
           SET launch_revision = launch_revision + 1,
               last_supervisor_owner_id = ?,
               launch_state = 'running',
               next_launch_at = NULL,
               last_failure_code = NULL
           WHERE home_id = ?
             AND launch_revision = ?
             AND current_launch_attempt_id = ?`
        ).run(
          options.ownerId,
          this.homeId,
          options.expectedLaunchRevision,
          options.attemptId
        );
        if (!changedOneRow(attemptUpdate) || !changedOneRow(launchUpdate)) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_STALE",
            "Supervisor acquisition lost its attempt or launch revision CAS."
          );
        }
        return readSupervisorLease(this.db, this.homeId)!;
      }
    });
  }

  renew(options: {
    expected: ExpectedSupervisorAuthority;
    expectedLaunchRevision: number;
    nextState: "starting" | "active" | "draining";
  }): SupervisorLeaseRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const evidence = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        if (!evidence.available || !evidence.fresh) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_REQUIRED",
            "Supervisor renewal requires objective current authority."
          );
        }
        assertExpectedSupervisor(evidence, options.expected);
        const lease = readSupervisorLease(this.db, this.homeId)!;
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        if (
          !SUPERVISOR_RENEWABLE_STATES.includes(
            lease.state as typeof SUPERVISOR_RENEWABLE_STATES[number]
          ) ||
          !launchState ||
          launchState.launch_revision !== options.expectedLaunchRevision ||
          launchState.current_launch_attempt_id !== lease.launch_attempt_id
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_STALE",
            "Supervisor renewal lost the current launch or renewable-state predicate."
          );
        }
        assertRenewTransition(lease.state, options.nextState);
        const expiresAt = new Date(
          toProcessAuthorityEpochMs(observedAt) +
            SUPERVISOR_RUNTIME_POLICY.lease_duration_ms
        ).toISOString();
        const update = this.db.prepare(
          `UPDATE supervisor_leases
           SET lease_state_revision = lease_state_revision + 1,
               state = ?,
               heartbeat_at = ?,
               expires_at = ?,
               shutdown_requested_at = CASE WHEN ? = 'draining' THEN COALESCE(shutdown_requested_at, ?) ELSE shutdown_requested_at END
           WHERE home_id = ?
             AND owner_id = ?
             AND lease_epoch = ?
             AND lease_state_revision = ?
             AND lease_terminal_at IS NULL
             AND state IN ('starting', 'active', 'draining')`
        ).run(
          options.nextState,
          observedAt,
          expiresAt,
          options.nextState,
          observedAt,
          this.homeId,
          options.expected.owner_id,
          options.expected.lease_epoch,
          options.expected.lease_state_revision
        );
        if (!changedOneRow(update)) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_STALE",
            "Supervisor renewal lost the owner/epoch/state-revision CAS."
          );
        }
        return readSupervisorLease(this.db, this.homeId)!;
      }
    });
  }

  gracefulRelease(options: {
    expected: ExpectedSupervisorAuthority;
    expectedAttemptStateRevision: number;
    expectedLaunchRevision: number;
  }): SupervisorLeaseRow {
    return this.terminalize({
      kind: "graceful_release",
      expected: options.expected,
      expectedAttemptStateRevision: options.expectedAttemptStateRevision,
      expectedLaunchRevision: options.expectedLaunchRevision
    });
  }

  revokeVerifiedProcessExit(options: {
    expected: ExpectedSupervisorAuthority;
    expectedAttemptStateRevision: number;
    expectedLaunchRevision: number;
    gatewayInstanceId: string;
    gatewayProcessStartToken: string;
    processExitEvidence: ProcessExitEvidence;
  }): SupervisorLeaseRow {
    return this.terminalize({
      kind: "verified_process_exit",
      expected: options.expected,
      expectedAttemptStateRevision: options.expectedAttemptStateRevision,
      expectedLaunchRevision: options.expectedLaunchRevision,
      gatewayInstanceId: options.gatewayInstanceId,
      gatewayProcessStartToken: options.gatewayProcessStartToken,
      processExitEvidence: options.processExitEvidence
    });
  }

  expireNaturally(options: {
    expected: ExpectedSupervisorAuthority;
    expectedAttemptStateRevision: number;
    expectedLaunchRevision: number;
    expectedHeartbeatAt: string;
    expectedExpiresAt: string;
    gatewayInstanceId: string;
    gatewayProcessStartToken: string;
  }): SupervisorLeaseRow {
    return this.terminalize({
      kind: "natural_expiry",
      expected: options.expected,
      expectedAttemptStateRevision: options.expectedAttemptStateRevision,
      expectedLaunchRevision: options.expectedLaunchRevision,
      expectedHeartbeatAt: options.expectedHeartbeatAt,
      expectedExpiresAt: options.expectedExpiresAt,
      gatewayInstanceId: options.gatewayInstanceId,
      gatewayProcessStartToken: options.gatewayProcessStartToken
    });
  }

  private terminalize(options: {
    kind: SupervisorLeaseTerminalReason;
    expected: ExpectedSupervisorAuthority;
    expectedAttemptStateRevision: number;
    expectedLaunchRevision: number;
    expectedHeartbeatAt?: string;
    expectedExpiresAt?: string;
    gatewayInstanceId?: string;
    gatewayProcessStartToken?: string;
    processExitEvidence?: ProcessExitEvidence;
  }): SupervisorLeaseRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const lease = readSupervisorLease(this.db, this.homeId);
        const attempt = lease
          ? readLaunchAttempt(this.db, this.homeId, lease.launch_attempt_id)
          : undefined;
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        if (
          !lease ||
          !attempt ||
          !launchState ||
          lease.owner_id !== options.expected.owner_id ||
          lease.owner_process_id !== options.expected.owner_process_id ||
          lease.owner_process_start_token !== options.expected.owner_process_start_token ||
          lease.lease_epoch !== options.expected.lease_epoch ||
          lease.lease_state_revision !== options.expected.lease_state_revision ||
          lease.lease_terminal_at !== null ||
          attempt.attempt_state !== "lease_acquired" ||
          attempt.attempt_state_revision !== options.expectedAttemptStateRevision ||
          attempt.supervisor_owner_id !== lease.owner_id ||
          attempt.supervisor_lease_epoch !== lease.lease_epoch ||
          launchState.current_launch_attempt_id !== lease.launch_attempt_id ||
          launchState.launch_revision !== options.expectedLaunchRevision
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_STALE",
            "Supervisor terminalization lost its exact owner, epoch, lease, attempt, or launch revision CAS."
          );
        }

        if (options.kind === "graceful_release") {
          const objective = evaluateFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            observedAt
          });
          if (!objective.available || !objective.fresh) {
            throw new RuntimeProcessAuthorityError(
              "EE_SUPERVISOR_AUTHORITY_REQUIRED",
              "Graceful release requires current objective supervisor authority."
            );
          }
          assertExpectedSupervisor(objective, options.expected);
          const worker = readWorkerLease(this.db, this.homeId);
          if (
            worker &&
            worker.state !== "stopped" &&
            toProcessAuthorityEpochMs(worker.expires_at) >
              toProcessAuthorityEpochMs(observedAt)
          ) {
            throw new RuntimeProcessAuthorityError(
              "EE_PROCESS_AUTHORITY_CONFLICT",
              "Graceful supervisor release requires the worker lease to be released or expired first."
            );
          }
        } else {
          if (!options.gatewayInstanceId || !options.gatewayProcessStartToken) {
            throw new RuntimeProcessAuthorityError(
              "EE_PROCESS_AUTHORITY_INVALID",
              "Gateway-owned supervisor terminalization requires exact gateway identity."
            );
          }
          assertCurrentGatewayHeartbeat({
            db: this.db,
            homeId: this.homeId,
            gatewayInstanceId: options.gatewayInstanceId,
            gatewayProcessStartToken: options.gatewayProcessStartToken,
            packageGenerationId: lease.package_generation_id,
            observedAt
          });
        }

        if (options.kind === "verified_process_exit") {
          const exit = options.processExitEvidence;
          if (
            !exit ||
            exit.owner_id !== lease.owner_id ||
            exit.process_id !== lease.owner_process_id ||
            exit.process_start_token !== lease.owner_process_start_token
          ) {
            throw new RuntimeProcessAuthorityError(
              "EE_PROCESS_IDENTITY_MISMATCH",
              "Verified supervisor exit requires exact owner, PID, and process-start token evidence."
            );
          }
        }
        if (options.kind === "natural_expiry") {
          if (
            options.expectedHeartbeatAt !== lease.heartbeat_at ||
            options.expectedExpiresAt !== lease.expires_at ||
            toProcessAuthorityEpochMs(lease.expires_at) >
              toProcessAuthorityEpochMs(observedAt)
          ) {
            throw new RuntimeProcessAuthorityError(
              "EE_SUPERVISOR_AUTHORITY_STALE",
              "Natural expiry requires the unchanged stored heartbeat/expiry and transaction time at or after expiry."
            );
          }
        }

        const leaseState = options.kind === "natural_expiry" ? "expired" : "stopped";
        const attemptState = options.kind === "natural_expiry" ? "lease_expired" : "terminated";
        const terminalCode = options.kind === "graceful_release"
          ? "supervisor_graceful_release"
          : options.kind === "verified_process_exit"
            ? "supervisor_process_exit"
            : "supervisor_lease_expired";
        const retry = options.kind === "graceful_release"
          ? { state: "idle" as const, nextLaunchAt: null }
          : retryProjection(launchState.launch_count_in_window, observedAt);
        const terminalHeartbeatAt = options.kind === "natural_expiry"
          ? lease.heartbeat_at
          : new Date(Math.max(
            toProcessAuthorityEpochMs(lease.started_at),
            toProcessAuthorityEpochMs(observedAt) - 1
          )).toISOString();
        const terminalExpiresAt = options.kind === "natural_expiry"
          ? lease.expires_at
          : toProcessAuthorityEpochMs(observedAt) >
              toProcessAuthorityEpochMs(terminalHeartbeatAt)
            ? observedAt
            : new Date(
              toProcessAuthorityEpochMs(terminalHeartbeatAt) + 1
            ).toISOString();
        const leaseUpdate = this.db.prepare(
          `UPDATE supervisor_leases
           SET lease_state_revision = lease_state_revision + 1,
               state = ?,
               heartbeat_at = ?,
               expires_at = ?,
               lease_terminal_at = ?,
               lease_terminal_reason = ?
           WHERE home_id = ?
             AND owner_id = ?
             AND lease_epoch = ?
             AND lease_state_revision = ?
             AND lease_terminal_at IS NULL`
        ).run(
          leaseState,
          terminalHeartbeatAt,
          terminalExpiresAt,
          observedAt,
          options.kind,
          this.homeId,
          options.expected.owner_id,
          options.expected.lease_epoch,
          options.expected.lease_state_revision
        );
        const attemptUpdate = this.db.prepare(
          `UPDATE supervisor_launch_attempts
           SET attempt_state = ?,
               attempt_state_revision = attempt_state_revision + 1,
               terminal_at = ?,
               terminal_code = ?
           WHERE home_id = ?
             AND launch_attempt_id = ?
             AND attempt_state = 'lease_acquired'
             AND attempt_state_revision = ?
             AND supervisor_owner_id = ?
             AND supervisor_lease_epoch = ?`
        ).run(
          attemptState,
          observedAt,
          terminalCode,
          this.homeId,
          lease.launch_attempt_id,
          options.expectedAttemptStateRevision,
          lease.owner_id,
          lease.lease_epoch
        );
        const exitCode = options.processExitEvidence?.exit_code ?? null;
        const launchUpdate = this.db.prepare(
          `UPDATE supervisor_launch_state
           SET launch_revision = launch_revision + 1,
               launch_state = ?,
               next_launch_at = ?,
               last_supervisor_owner_id = ?,
               last_process_exit_code = ?,
               last_process_exit_at = ?,
               last_failure_code = ?
           WHERE home_id = ?
             AND launch_revision = ?
             AND current_launch_attempt_id = ?`
        ).run(
          retry.state,
          retry.nextLaunchAt,
          lease.owner_id,
          exitCode,
          options.kind === "graceful_release" ? null : observedAt,
          options.kind === "graceful_release" ? null : terminalCode,
          this.homeId,
          options.expectedLaunchRevision,
          lease.launch_attempt_id
        );
        if (
          !changedOneRow(leaseUpdate) ||
          !changedOneRow(attemptUpdate) ||
          !changedOneRow(launchUpdate)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_SUPERVISOR_AUTHORITY_STALE",
            "Supervisor terminalization did not atomically win every lease/attempt/launch CAS."
          );
        }
        return readSupervisorLease(this.db, this.homeId)!;
      }
    });
  }
}
