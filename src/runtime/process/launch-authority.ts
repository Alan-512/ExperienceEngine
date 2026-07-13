import type { DatabaseSync } from "node:sqlite";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  PACKAGE_ACTIVATION_TIMING_POLICY,
  SUPERVISOR_RUNTIME_POLICY,
  type LaunchAuthorizationRole
} from "./constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "./clock.js";
import {
  assertCanonicalHomeExists,
  assertCurrentGatewayHeartbeat,
  changedOneRow,
  readLaunchAttempt,
  readLaunchAuthorization,
  readSupervisorLaunchState,
  readSupervisorLease
} from "./database.js";
import { RuntimeProcessAuthorityError } from "./errors.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "./fresh-supervisor-authority.js";
import {
  computeBoundedRestartDecision,
  computeLaunchAttemptExpiry,
  computeLaunchAuthorizationExpiry
} from "./lifecycle.js";
import type {
  ExpectedSupervisorAuthority,
  PackageLaunchAuthorizationRow,
  ProcessExitEvidence,
  RuntimeProcessAuthorityClock,
  S6PackageAuthorizationMutationProvider,
  SupervisorLaunchAttemptRow,
  SupervisorLaunchStateRow
} from "./types.js";

type PackageActivationProjectionRow = {
  home_id: string;
  activation_revision: number;
  active_package_generation_id: string | null;
  pending_package_generation_id: string | null;
  activation_deadline_at: string | null;
  launch_authorization_id: string | null;
  launch_authorized_generation_id: string | null;
  launch_authorization_role: LaunchAuthorizationRole | "none";
  launch_authorization_state: "none" | "issued" | "consumed" | "expired" | "cancelled";
  launch_authorization_revision: number;
  launch_authorization_state_revision: number;
  launch_authorization_issued_at: string | null;
  launch_authorization_expires_at: string | null;
  launch_authorization_consumed_by_attempt_id: string | null;
  launch_authorization_consumed_at: string | null;
};

const readPackageActivationProjection = (
  db: DatabaseSync,
  homeId: string
): PackageActivationProjectionRow | undefined => db.prepare(
  "SELECT * FROM package_activation_state WHERE home_id = ? LIMIT 1"
).get(homeId) as PackageActivationProjectionRow | undefined;

const terminalLaunchAttemptStates = new Set([
  "spawn_failed",
  "timed_out",
  "cancelled",
  "lease_expired",
  "terminated"
]);

const readAttemptForAuthorization = (
  db: DatabaseSync,
  homeId: string,
  authorizationId: string
): SupervisorLaunchAttemptRow | undefined => db.prepare(
  `SELECT * FROM supervisor_launch_attempts
   WHERE home_id = ? AND launch_authorization_id = ?
   LIMIT 1`
).get(homeId, authorizationId) as SupervisorLaunchAttemptRow | undefined;

export const UNAVAILABLE_S6_PACKAGE_AUTHORIZATION_MUTATION_PROVIDER:
S6PackageAuthorizationMutationProvider = Object.freeze({
  getAuthorizationMutationEvidenceInTransaction(): {
    available: false;
    fresh: false;
    authority_contract_version: "s6-package-authorization-mutation-v1";
    reason: "s6_not_connected";
  } {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "s6-package-authorization-mutation-v1",
      reason: "s6_not_connected"
    };
  }
});

const assertNonEmpty = (value: string, label: string): void => {
  if (!value) {
    throw new RuntimeProcessAuthorityError(
      "EE_PROCESS_AUTHORITY_INVALID",
      `${label} must not be empty.`
    );
  }
};

export type RuntimeLaunchAuthorizationIssueOptions = {
  authorizationId: string;
  packageGenerationId: string;
  gatewayPackageGenerationId?: string;
  authorizationRole: LaunchAuthorizationRole;
  gatewayInstanceId: string;
  gatewayProcessStartToken: string;
  expectedLaunchRevision: number;
  resetLaunchBudget?: boolean;
  issuer:
    | {
      kind: "gateway_service_controller";
      gatewayInstanceId: string;
    }
    | {
      kind: "supervisor";
      supervisorOwnerId: string;
      supervisorLeaseEpoch: number;
    };
};

export class RuntimeLaunchAuthorizationIssuer {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly provider: S6PackageAuthorizationMutationProvider =
      UNAVAILABLE_S6_PACKAGE_AUTHORIZATION_MUTATION_PROVIDER,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  issue(options: RuntimeLaunchAuthorizationIssueOptions): {
    authorization: PackageLaunchAuthorizationRow;
    launchState: SupervisorLaunchStateRow;
  } {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => this.issueInTransaction(options)
    });
  }

  issueInTransaction(options: RuntimeLaunchAuthorizationIssueOptions): {
    authorization: PackageLaunchAuthorizationRow;
    launchState: SupervisorLaunchStateRow;
  } {
    if (!this.db.isTransaction) {
      throw new RuntimeProcessAuthorityError(
        "EE_PROCESS_AUTHORITY_INVALID",
        "Transaction-scoped launch authorization issuance requires an active authority transaction."
      );
    }
    assertNonEmpty(options.authorizationId, "authorizationId");
    assertNonEmpty(options.packageGenerationId, "packageGenerationId");
        assertCanonicalHomeExists(this.db, this.homeId);
        const evidence = this.provider.getAuthorizationMutationEvidenceInTransaction({
          db: this.db,
          homeId: this.homeId,
          packageGenerationId: options.packageGenerationId,
          authorizationRole: options.authorizationRole
        });
        if (!evidence.available || !evidence.fresh) {
          throw new RuntimeProcessAuthorityError(
            "EE_PACKAGE_AUTHORITY_REQUIRED",
            "Launch authorization insertion requires an exact current S6 package-authority mutation decision."
          );
        }
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const observedAtMs = toProcessAuthorityEpochMs(observedAt);
        if (
          evidence.home_id !== this.homeId ||
          evidence.authorized_package_generation_id !== options.packageGenerationId ||
          evidence.authorization_role !== options.authorizationRole ||
          toProcessAuthorityEpochMs(evidence.observed_at) > observedAtMs ||
          toProcessAuthorityEpochMs(evidence.expires_at) <= observedAtMs
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PACKAGE_AUTHORITY_REQUIRED",
            "S6 launch-authorization evidence does not match the exact home, generation, role, or deadline."
          );
        }
        assertCurrentGatewayHeartbeat({
          db: this.db,
          homeId: this.homeId,
          gatewayInstanceId: options.gatewayInstanceId,
          gatewayProcessStartToken: options.gatewayProcessStartToken,
          packageGenerationId:
            options.gatewayPackageGenerationId ?? options.packageGenerationId,
          observedAt
        });
        const objectiveSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        if (evidence.operation_kind === "gateway_whitelist_operation") {
          if (
            options.issuer.kind !== "gateway_service_controller" ||
            options.issuer.gatewayInstanceId !== options.gatewayInstanceId ||
            evidence.writer_gateway_instance_id !== options.issuer.gatewayInstanceId ||
            evidence.writer_supervisor_owner_id !== null ||
            evidence.writer_supervisor_lease_epoch !== null ||
            evidence.writer_supervisor_lease_state_revision !== null ||
            (objectiveSupervisor.available && objectiveSupervisor.fresh)
          ) {
            throw new RuntimeProcessAuthorityError(
              "EE_PACKAGE_AUTHORITY_REQUIRED",
              "Gateway authorization issuance requires exact S6 gateway provenance and no fresh supervisor authority."
            );
          }
        } else {
          if (
            options.issuer.kind !== "supervisor" ||
            evidence.writer_gateway_instance_id !== null ||
            evidence.writer_supervisor_owner_id !== options.issuer.supervisorOwnerId ||
            evidence.writer_supervisor_lease_epoch !== options.issuer.supervisorLeaseEpoch ||
            !objectiveSupervisor.available ||
            !objectiveSupervisor.fresh ||
            objectiveSupervisor.supervisor_owner_id !== options.issuer.supervisorOwnerId ||
            objectiveSupervisor.supervisor_lease_epoch !== options.issuer.supervisorLeaseEpoch ||
            objectiveSupervisor.supervisor_lease_state_revision !==
              evidence.writer_supervisor_lease_state_revision
          ) {
            throw new RuntimeProcessAuthorityError(
              "EE_PACKAGE_AUTHORITY_REQUIRED",
              "Supervisor authorization issuance requires exact S6 supervisor provenance and objective current authority."
            );
          }
        }
        const activation = readPackageActivationProjection(this.db, this.homeId);
        if (
          !activation ||
          activation.activation_revision !== evidence.activation_revision ||
          activation.launch_authorization_revision + 1 !==
            evidence.expected_authorization_revision ||
          activation.launch_authorization_state_revision !==
            evidence.expected_authorization_state_revision ||
          readLaunchAuthorization(this.db, this.homeId, options.authorizationId)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "Launch authorization issuance lost the package-authority revision CAS."
          );
        }
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        const priorAttempt = launchState?.current_launch_attempt_id
          ? readLaunchAttempt(
            this.db,
            this.homeId,
            launchState.current_launch_attempt_id
          )
          : undefined;
        const priorAttemptIsTerminal = !launchState?.current_launch_attempt_id || Boolean(
          priorAttempt && terminalLaunchAttemptStates.has(priorAttempt.attempt_state)
        );
        const priorLease = readSupervisorLease(this.db, this.homeId);
        const priorLeaseIsTerminal = !priorLease || Boolean(
          (priorLease.state === "stopped" || priorLease.state === "expired") &&
          priorLease.lease_terminal_at !== null &&
          priorLease.lease_terminal_reason !== null
        );
        if ((launchState?.launch_revision ?? 0) !== options.expectedLaunchRevision) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "Launch authorization issuance lost the controller launch revision CAS."
          );
        }
        if (
          evidence.operation_kind === "gateway_whitelist_operation" &&
          (!priorAttemptIsTerminal || !priorLeaseIsTerminal)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_CONFLICT",
            "A gateway replacement authorization requires prior attempt and lease authority to be terminal."
          );
        }
        const expiresAt = computeLaunchAuthorizationExpiry({
          issuedAt: observedAt,
          activationDeadlineAt: activation.activation_deadline_at
        });
        this.db.prepare(
          `INSERT INTO package_launch_authorizations (
            home_id,
            launch_authorization_id,
            authorization_revision,
            authorization_state_revision,
            authorization_state,
            authorized_package_generation_id,
            authorization_role,
            launch_activation_revision_at_issuance,
            expected_active_package_generation_id,
            expected_pending_package_generation_id,
            issued_by_kind,
            issued_by_gateway_instance_id,
            issued_by_supervisor_owner_id,
            issued_by_supervisor_lease_epoch,
            issued_at,
            expires_at
          ) VALUES (?, ?, ?, 1, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          this.homeId,
          options.authorizationId,
          evidence.expected_authorization_revision,
          options.packageGenerationId,
          options.authorizationRole,
          evidence.activation_revision,
          activation.active_package_generation_id,
          activation.pending_package_generation_id,
          options.issuer.kind,
          options.issuer.kind === "gateway_service_controller"
            ? options.issuer.gatewayInstanceId
            : null,
          options.issuer.kind === "supervisor"
            ? options.issuer.supervisorOwnerId
            : null,
          options.issuer.kind === "supervisor"
            ? options.issuer.supervisorLeaseEpoch
            : null,
          observedAt,
          expiresAt
        );

        const projectionUpdate = this.db.prepare(
          `UPDATE package_activation_state
           SET launch_authorization_id = ?,
               launch_authorized_generation_id = ?,
               launch_authorization_role = ?,
               launch_authorization_state = 'issued',
               launch_authorization_revision = ?,
               launch_authorization_state_revision = 1,
               launch_authorization_issued_at = ?,
               launch_authorization_expires_at = ?,
               launch_authorization_consumed_by_attempt_id = NULL,
               launch_authorization_consumed_at = NULL,
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?
           WHERE home_id = ?
             AND activation_revision = ?
             AND launch_authorization_revision = ?
             AND launch_authorization_state_revision = ?`
        ).run(
          options.authorizationId,
          options.packageGenerationId,
          options.authorizationRole,
          evidence.expected_authorization_revision,
          observedAt,
          expiresAt,
          options.issuer.kind,
          options.issuer.kind === "gateway_service_controller"
            ? options.issuer.gatewayInstanceId
            : null,
          options.issuer.kind === "supervisor"
            ? options.issuer.supervisorOwnerId
            : null,
          options.issuer.kind === "supervisor"
            ? options.issuer.supervisorLeaseEpoch
            : null,
          observedAt,
          this.homeId,
          evidence.activation_revision,
          evidence.expected_authorization_revision - 1,
          evidence.expected_authorization_state_revision
        );
        if (!changedOneRow(projectionUpdate)) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "Launch authorization package projection CAS failed."
          );
        }

        if (!launchState) {
          if (options.expectedLaunchRevision !== 0) {
            throw new RuntimeProcessAuthorityError(
              "EE_PROCESS_AUTHORITY_STALE",
              "A missing launch-state row can only be initialized at revision zero."
            );
          }
          this.db.prepare(
            `INSERT INTO supervisor_launch_state (
              home_id,
              launch_revision,
              gateway_instance_id,
              package_generation_id,
              launch_authorization_id,
              launch_authorized_generation_id,
              launch_authorization_role,
              launch_authorization_revision,
              launch_authorization_state_revision,
              expected_current_activation_revision,
              expected_active_package_generation_id,
              expected_pending_package_generation_id,
              launch_owner_gateway_instance_id,
              launch_owner_process_start_token,
              launch_state
            ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'idle')`
          ).run(
            this.homeId,
            options.gatewayInstanceId,
            options.packageGenerationId,
            options.authorizationId,
            options.packageGenerationId,
            options.authorizationRole,
            evidence.expected_authorization_revision,
            activation.activation_revision,
            activation.active_package_generation_id,
            activation.pending_package_generation_id,
            options.gatewayInstanceId,
            options.gatewayProcessStartToken
          );
        } else {
          const launchUpdate = this.db.prepare(
            `UPDATE supervisor_launch_state
             SET launch_revision = launch_revision + 1,
                 gateway_instance_id = ?,
                 package_generation_id = ?,
                 launch_authorization_id = ?,
                 launch_authorized_generation_id = ?,
                 launch_authorization_role = ?,
                 launch_authorization_revision = ?,
                 launch_authorization_state_revision = 1,
                 expected_current_activation_revision = ?,
                 expected_active_package_generation_id = ?,
                 expected_pending_package_generation_id = ?,
                 launch_owner_gateway_instance_id = ?,
                 launch_owner_process_start_token = ?,
                 restart_window_started_at = CASE WHEN ? = 1 THEN NULL ELSE restart_window_started_at END,
                 launch_count_in_window = CASE WHEN ? = 1 THEN 0 ELSE launch_count_in_window END,
                 next_launch_at = CASE WHEN ? = 1 THEN NULL ELSE next_launch_at END,
                 last_failure_code = NULL
             WHERE home_id = ? AND launch_revision = ?`
          ).run(
            options.gatewayInstanceId,
            options.packageGenerationId,
            options.authorizationId,
            options.packageGenerationId,
            options.authorizationRole,
            evidence.expected_authorization_revision,
            activation.activation_revision,
            activation.active_package_generation_id,
            activation.pending_package_generation_id,
            options.gatewayInstanceId,
            options.gatewayProcessStartToken,
            options.resetLaunchBudget ? 1 : 0,
            options.resetLaunchBudget ? 1 : 0,
            options.resetLaunchBudget ? 1 : 0,
            this.homeId,
            options.expectedLaunchRevision
          );
          if (!changedOneRow(launchUpdate)) {
            throw new RuntimeProcessAuthorityError(
              "EE_PROCESS_AUTHORITY_STALE",
              "Launch authorization controller projection CAS failed."
            );
          }
        }
        return {
          authorization: readLaunchAuthorization(
            this.db,
            this.homeId,
            options.authorizationId
          )!,
          launchState: readSupervisorLaunchState(this.db, this.homeId)!
        };
  }
}

export class RuntimeLaunchAuthorizationLifecycleRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  terminalizeIssued(options: {
    authorizationId: string;
    expectedAuthorizationRevision: number;
    expectedAuthorizationStateRevision: number;
    targetState: "expired" | "cancelled";
    terminalCode: string;
    writer:
      | {
        kind: "gateway_service_controller";
        gatewayInstanceId: string;
        gatewayProcessStartToken: string;
      }
      | {
        kind: "supervisor";
        expected: ExpectedSupervisorAuthority;
      };
  }): PackageLaunchAuthorizationRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const authorization = readLaunchAuthorization(
          this.db,
          this.homeId,
          options.authorizationId
        );
        const activation = readPackageActivationProjection(this.db, this.homeId);
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        const attemptForAuthorization = readAttemptForAuthorization(
          this.db,
          this.homeId,
          options.authorizationId
        );
        if (
          !authorization ||
          !activation ||
          !launchState ||
          authorization.authorization_state !== "issued" ||
          authorization.authorization_revision !== options.expectedAuthorizationRevision ||
          authorization.authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          authorization.consumed_by_launch_attempt_id !== null ||
          attemptForAuthorization !== undefined ||
          activation.launch_authorization_id !== options.authorizationId ||
          activation.launch_authorization_revision !== options.expectedAuthorizationRevision ||
          activation.launch_authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          activation.launch_authorization_state !== "issued" ||
          launchState.launch_authorization_id !== options.authorizationId ||
          launchState.launch_authorization_revision !== options.expectedAuthorizationRevision ||
          launchState.launch_authorization_state_revision !== options.expectedAuthorizationStateRevision
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_AUTHORIZATION_INVALID",
            "Authorization terminalization requires the exact current unconsumed issued row and projections."
          );
        }
        if (
          options.targetState === "expired" &&
          toProcessAuthorityEpochMs(authorization.expires_at) >
            toProcessAuthorityEpochMs(observedAt)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "A launch authorization cannot expire before its stored deadline."
          );
        }
        if (options.writer.kind === "gateway_service_controller") {
          const objectiveSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            observedAt
          });
          if (objectiveSupervisor.available && objectiveSupervisor.fresh) {
            throw new RuntimeProcessAuthorityError(
              "EE_PROCESS_AUTHORITY_CONFLICT",
              "Gateway authorization terminalization cannot race a fresh supervisor authority."
            );
          }
          assertCurrentGatewayHeartbeat({
            db: this.db,
            homeId: this.homeId,
            gatewayInstanceId: options.writer.gatewayInstanceId,
            gatewayProcessStartToken: options.writer.gatewayProcessStartToken,
            packageGenerationId: authorization.authorized_package_generation_id,
            observedAt
          });
        } else {
          const authority = evaluateFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            observedAt
          });
          if (
            !authority.available ||
            !authority.fresh ||
            authority.supervisor_owner_id !== options.writer.expected.owner_id ||
            authority.supervisor_lease_epoch !== options.writer.expected.lease_epoch ||
            authority.supervisor_lease_state_revision !==
              options.writer.expected.lease_state_revision ||
            authority.package_generation_id !== authorization.authorized_package_generation_id
          ) {
            throw new RuntimeProcessAuthorityError(
              "EE_SUPERVISOR_AUTHORITY_STALE",
              "Supervisor authorization terminalization requires exact objective authority."
            );
          }
        }
        const nextStateRevision = authorization.authorization_state_revision + 1;
        const authorizationUpdate = this.db.prepare(
          `UPDATE package_launch_authorizations
           SET authorization_state = ?,
               authorization_state_revision = ?,
               terminal_at = ?,
               terminal_code = ?
           WHERE home_id = ?
             AND launch_authorization_id = ?
             AND authorization_revision = ?
             AND authorization_state_revision = ?
             AND authorization_state = 'issued'
             AND consumed_by_launch_attempt_id IS NULL`
        ).run(
          options.targetState,
          nextStateRevision,
          observedAt,
          options.terminalCode,
          this.homeId,
          options.authorizationId,
          options.expectedAuthorizationRevision,
          options.expectedAuthorizationStateRevision
        );
        const activationUpdate = this.db.prepare(
          `UPDATE package_activation_state
           SET launch_authorization_state = ?,
               launch_authorization_state_revision = ?,
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?
           WHERE home_id = ?
             AND launch_authorization_id = ?
             AND launch_authorization_revision = ?
             AND launch_authorization_state_revision = ?
             AND launch_authorization_state = 'issued'`
        ).run(
          options.targetState,
          nextStateRevision,
          options.writer.kind,
          options.writer.kind === "gateway_service_controller"
            ? options.writer.gatewayInstanceId
            : null,
          options.writer.kind === "supervisor"
            ? options.writer.expected.owner_id
            : null,
          options.writer.kind === "supervisor"
            ? options.writer.expected.lease_epoch
            : null,
          observedAt,
          this.homeId,
          options.authorizationId,
          options.expectedAuthorizationRevision,
          options.expectedAuthorizationStateRevision
        );
        const launchUpdate = this.db.prepare(
          `UPDATE supervisor_launch_state
           SET launch_revision = launch_revision + 1,
               launch_authorization_state_revision = ?,
               launch_state = CASE
                 WHEN current_launch_attempt_id IS NULL THEN 'idle'
                 ELSE launch_state
               END,
               launch_started_at = CASE
                 WHEN current_launch_attempt_id IS NULL THEN NULL
                 ELSE launch_started_at
               END,
               launch_expires_at = CASE
                 WHEN current_launch_attempt_id IS NULL THEN NULL
                 ELSE launch_expires_at
               END,
               last_failure_code = CASE
                 WHEN current_launch_attempt_id IS NULL THEN ?
                 ELSE last_failure_code
               END
           WHERE home_id = ?
             AND launch_authorization_id = ?
             AND launch_authorization_revision = ?
             AND launch_authorization_state_revision = ?`
        ).run(
          nextStateRevision,
          options.terminalCode,
          this.homeId,
          options.authorizationId,
          options.expectedAuthorizationRevision,
          options.expectedAuthorizationStateRevision
        );
        if (
          !changedOneRow(authorizationUpdate) ||
          !changedOneRow(activationUpdate) ||
          !changedOneRow(launchUpdate)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "Authorization terminalization did not atomically win every row-state CAS."
          );
        }
        return readLaunchAuthorization(
          this.db,
          this.homeId,
          options.authorizationId
        )!;
      }
    });
  }
}

export class RuntimeLaunchAttemptRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  reserveByConsumingAuthorization(options: {
    authorizationId: string;
    expectedAuthorizationRevision: number;
    expectedAuthorizationStateRevision: number;
    attemptId: string;
    packageGenerationId: string;
    authorizationRole: LaunchAuthorizationRole;
    gatewayInstanceId: string;
    gatewayProcessStartToken: string;
    expectedLaunchRevision: number;
  }): {
    attempt: SupervisorLaunchAttemptRow;
    launchState: SupervisorLaunchStateRow;
  } {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const observedAtMs = toProcessAuthorityEpochMs(observedAt);
        const freshSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        if (freshSupervisor.available && freshSupervisor.fresh) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_CONFLICT",
            "A new launch attempt cannot be reserved while objective supervisor authority is fresh."
          );
        }
        assertCurrentGatewayHeartbeat({
          db: this.db,
          homeId: this.homeId,
          gatewayInstanceId: options.gatewayInstanceId,
          gatewayProcessStartToken: options.gatewayProcessStartToken,
          packageGenerationId: options.packageGenerationId,
          observedAt
        });
        const authorization = readLaunchAuthorization(
          this.db,
          this.homeId,
          options.authorizationId
        );
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        const activation = readPackageActivationProjection(this.db, this.homeId);
        const priorCurrentAttempt = launchState?.current_launch_attempt_id
          ? readLaunchAttempt(
            this.db,
            this.homeId,
            launchState.current_launch_attempt_id
          )
          : undefined;
        const priorCurrentAttemptIsReplaceable = !launchState?.current_launch_attempt_id || Boolean(
          priorCurrentAttempt &&
          terminalLaunchAttemptStates.has(priorCurrentAttempt.attempt_state)
        );
        if (
          authorization &&
          (
            authorization.authorization_state === "consumed" ||
            authorization.consumed_by_launch_attempt_id !== null
          )
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_AUTHORIZATION_REUSED",
            "A consumed launch authorization cannot reserve another attempt."
          );
        }
        if (
          !authorization ||
          !launchState ||
          !activation ||
          authorization.authorization_state !== "issued" ||
          authorization.authorization_revision !== options.expectedAuthorizationRevision ||
          authorization.authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          authorization.authorized_package_generation_id !== options.packageGenerationId ||
          authorization.authorization_role !== options.authorizationRole ||
          authorization.consumed_by_launch_attempt_id !== null ||
          toProcessAuthorityEpochMs(authorization.expires_at) <= observedAtMs ||
          launchState.launch_revision !== options.expectedLaunchRevision ||
          launchState.launch_authorization_id !== options.authorizationId ||
          launchState.launch_authorization_revision !== options.expectedAuthorizationRevision ||
          launchState.launch_authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          launchState.launch_authorized_generation_id !== options.packageGenerationId ||
          launchState.launch_authorization_role !== options.authorizationRole ||
          launchState.launch_owner_gateway_instance_id !== options.gatewayInstanceId ||
          launchState.launch_owner_process_start_token !== options.gatewayProcessStartToken ||
          activation.launch_authorization_id !== options.authorizationId ||
          activation.launch_authorization_revision !== options.expectedAuthorizationRevision ||
          activation.launch_authorization_state_revision !== options.expectedAuthorizationStateRevision ||
          activation.launch_authorization_state !== "issued" ||
          activation.launch_authorized_generation_id !== options.packageGenerationId ||
          activation.launch_authorization_role !== options.authorizationRole ||
          launchState.expected_current_activation_revision !== activation.activation_revision ||
          launchState.expected_active_package_generation_id !== activation.active_package_generation_id ||
          launchState.expected_pending_package_generation_id !== activation.pending_package_generation_id ||
          !priorCurrentAttemptIsReplaceable ||
          readLaunchAttempt(this.db, this.homeId, options.attemptId)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_AUTHORIZATION_INVALID",
            "Launch reservation requires one exact unexpired issued authorization and matching current projections."
          );
        }
        if (
          launchState.next_launch_at &&
          toProcessAuthorityEpochMs(launchState.next_launch_at) > observedAtMs
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "The bounded launch backoff is not yet due."
          );
        }
        const restart = computeBoundedRestartDecision({
          countInWindow: launchState.launch_count_in_window,
          windowStartedAt: launchState.restart_window_started_at,
          observedAt,
          kind: "supervisor_launch"
        });
        if (!restart.allowed) {
          throw new RuntimeProcessAuthorityError(
            "EE_RESTART_BUDGET_EXHAUSTED",
            "The bounded supervisor launch budget is exhausted."
          );
        }
        const consumedStateRevision = authorization.authorization_state_revision + 1;
        const attemptExpiresAt = computeLaunchAttemptExpiry({
          reservedAt: observedAt,
          authorizationExpiresAt: authorization.expires_at
        });
        const authUpdate = this.db.prepare(
          `UPDATE package_launch_authorizations
           SET authorization_state = 'consumed',
               authorization_state_revision = ?,
               consumed_by_launch_attempt_id = ?,
               consumed_at = ?,
               terminal_at = ?,
               terminal_code = 'authorization_consumed'
           WHERE home_id = ?
             AND launch_authorization_id = ?
             AND authorization_revision = ?
             AND authorization_state_revision = ?
             AND authorization_state = 'issued'
             AND consumed_by_launch_attempt_id IS NULL`
        ).run(
          consumedStateRevision,
          options.attemptId,
          observedAt,
          observedAt,
          this.homeId,
          options.authorizationId,
          options.expectedAuthorizationRevision,
          options.expectedAuthorizationStateRevision
        );
        if (!changedOneRow(authUpdate)) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_AUTHORIZATION_REUSED",
            "Launch authorization consumption lost the exact single-use CAS."
          );
        }
        this.db.prepare(
          `INSERT INTO supervisor_launch_attempts (
            home_id,
            launch_attempt_id,
            attempt_state_revision,
            attempt_state,
            launch_authorization_id,
            launch_authorization_revision,
            launch_authorization_state_revision_at_consumption,
            launch_authorization_role,
            package_generation_id,
            launch_activation_revision_at_consumption,
            expected_active_package_generation_id,
            expected_pending_package_generation_id,
            launch_owner_gateway_instance_id,
            launch_owner_process_start_token,
            reserved_at,
            attempt_expires_at
          ) VALUES (?, ?, 1, 'reserved_unbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          this.homeId,
          options.attemptId,
          authorization.launch_authorization_id,
          authorization.authorization_revision,
          consumedStateRevision,
          authorization.authorization_role,
          authorization.authorized_package_generation_id,
          authorization.launch_activation_revision_at_issuance,
          authorization.expected_active_package_generation_id,
          authorization.expected_pending_package_generation_id,
          options.gatewayInstanceId,
          options.gatewayProcessStartToken,
          observedAt,
          attemptExpiresAt
        );
        const activationUpdate = this.db.prepare(
          `UPDATE package_activation_state
           SET launch_authorization_state = 'consumed',
               launch_authorization_state_revision = ?,
               launch_authorization_consumed_by_attempt_id = ?,
               launch_authorization_consumed_at = ?,
               updated_at = ?
           WHERE home_id = ?
             AND launch_authorization_id = ?
             AND launch_authorization_revision = ?
             AND launch_authorization_state_revision = ?
             AND launch_authorization_state = 'issued'`
        ).run(
          consumedStateRevision,
          options.attemptId,
          observedAt,
          observedAt,
          this.homeId,
          options.authorizationId,
          options.expectedAuthorizationRevision,
          options.expectedAuthorizationStateRevision
        );
        const launchUpdate = this.db.prepare(
          `UPDATE supervisor_launch_state
           SET launch_revision = launch_revision + 1,
               launch_authorization_state_revision = ?,
               current_launch_attempt_id = ?,
               restart_window_started_at = ?,
               launch_count_in_window = ?,
               launch_started_at = ?,
               launch_expires_at = ?,
               launch_state = 'launching',
               last_failure_code = NULL
           WHERE home_id = ?
             AND launch_revision = ?
             AND launch_authorization_id = ?
             AND current_launch_attempt_id IS ?`
        ).run(
          consumedStateRevision,
          options.attemptId,
          restart.windowStartedAt,
          restart.nextCountInWindow,
          observedAt,
          attemptExpiresAt,
          this.homeId,
          options.expectedLaunchRevision,
          options.authorizationId,
          launchState.current_launch_attempt_id
        );
        if (!changedOneRow(activationUpdate) || !changedOneRow(launchUpdate)) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "Launch reservation lost a package or controller projection CAS."
          );
        }
        return {
          attempt: readLaunchAttempt(this.db, this.homeId, options.attemptId)!,
          launchState: readSupervisorLaunchState(this.db, this.homeId)!
        };
      }
    });
  }

  bindChildIdentity(options: {
    attemptId: string;
    expectedAttemptStateRevision: number;
    expectedLaunchRevision: number;
    gatewayInstanceId: string;
    gatewayProcessStartToken: string;
    packageGenerationId: string;
    childProcessId: number;
    childProcessStartToken: string;
  }): SupervisorLaunchAttemptRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentGatewayHeartbeat({
          db: this.db,
          homeId: this.homeId,
          gatewayInstanceId: options.gatewayInstanceId,
          gatewayProcessStartToken: options.gatewayProcessStartToken,
          packageGenerationId: options.packageGenerationId,
          observedAt
        });
        const attempt = readLaunchAttempt(this.db, this.homeId, options.attemptId);
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        if (
          attempt?.attempt_state === "reserved_bound" &&
          attempt.attempt_state_revision === options.expectedAttemptStateRevision + 1 &&
          attempt.child_process_id === options.childProcessId &&
          attempt.child_process_start_token === options.childProcessStartToken
        ) {
          return attempt;
        }
        if (
          !attempt ||
          !launchState ||
          attempt.attempt_state !== "reserved_unbound" ||
          attempt.attempt_state_revision !== options.expectedAttemptStateRevision ||
          attempt.launch_owner_gateway_instance_id !== options.gatewayInstanceId ||
          attempt.launch_owner_process_start_token !== options.gatewayProcessStartToken ||
          attempt.package_generation_id !== options.packageGenerationId ||
          attempt.child_process_id !== null ||
          attempt.child_process_start_token !== null ||
          toProcessAuthorityEpochMs(attempt.attempt_expires_at) <=
            toProcessAuthorityEpochMs(observedAt) ||
          launchState.current_launch_attempt_id !== options.attemptId ||
          launchState.launch_revision !== options.expectedLaunchRevision
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_ATTEMPT_STALE",
            "Child binding requires the exact current unbound attempt and controller revision."
          );
        }
        if (
          !Number.isSafeInteger(options.childProcessId) ||
          options.childProcessId <= 0 ||
          !options.childProcessStartToken
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_IDENTITY_MISMATCH",
            "Child process identity requires a positive PID and a process-start token."
          );
        }
        const attemptUpdate = this.db.prepare(
          `UPDATE supervisor_launch_attempts
           SET attempt_state = 'reserved_bound',
               attempt_state_revision = attempt_state_revision + 1,
               child_process_id = ?,
               child_process_start_token = ?
           WHERE home_id = ?
             AND launch_attempt_id = ?
             AND attempt_state = 'reserved_unbound'
             AND attempt_state_revision = ?
             AND child_process_id IS NULL
             AND child_process_start_token IS NULL`
        ).run(
          options.childProcessId,
          options.childProcessStartToken,
          this.homeId,
          options.attemptId,
          options.expectedAttemptStateRevision
        );
        const launchUpdate = this.db.prepare(
          `UPDATE supervisor_launch_state
           SET launch_revision = launch_revision + 1
           WHERE home_id = ?
             AND launch_revision = ?
             AND current_launch_attempt_id = ?`
        ).run(this.homeId, options.expectedLaunchRevision, options.attemptId);
        if (!changedOneRow(attemptUpdate) || !changedOneRow(launchUpdate)) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_ATTEMPT_STALE",
            "Child process binding lost its attempt or launch revision CAS."
          );
        }
        return readLaunchAttempt(this.db, this.homeId, options.attemptId)!;
      }
    });
  }

  terminalizePreLeaseAttempt(options: {
    attemptId: string;
    expectedAttemptStateRevision: number;
    expectedLaunchRevision: number;
    gatewayInstanceId: string;
    gatewayProcessStartToken: string;
    packageGenerationId: string;
    terminalState: "spawn_failed" | "timed_out" | "cancelled" | "terminated";
    terminalCode: string;
    processExitEvidence?: ProcessExitEvidence;
  }): SupervisorLaunchAttemptRow {
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        assertCurrentGatewayHeartbeat({
          db: this.db,
          homeId: this.homeId,
          gatewayInstanceId: options.gatewayInstanceId,
          gatewayProcessStartToken: options.gatewayProcessStartToken,
          packageGenerationId: options.packageGenerationId,
          observedAt
        });
        const attempt = readLaunchAttempt(this.db, this.homeId, options.attemptId);
        const launchState = readSupervisorLaunchState(this.db, this.homeId);
        const allowedSource = options.terminalState === "terminated"
          ? "reserved_bound"
          : options.terminalState === "spawn_failed"
            ? "reserved_unbound"
            : attempt?.attempt_state;
        if (
          !attempt ||
          !launchState ||
          attempt.attempt_state !== allowedSource ||
          attempt.attempt_state_revision !== options.expectedAttemptStateRevision ||
          attempt.supervisor_owner_id !== null ||
          attempt.supervisor_lease_epoch !== null ||
          attempt.lease_acquired_at !== null ||
          launchState.current_launch_attempt_id !== options.attemptId ||
          launchState.launch_revision !== options.expectedLaunchRevision
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_ATTEMPT_STALE",
            "Pre-lease terminalization requires the exact current attempt and no acquired supervisor lease."
          );
        }
        if (
          options.terminalState === "timed_out" &&
          toProcessAuthorityEpochMs(attempt.attempt_expires_at) >
            toProcessAuthorityEpochMs(observedAt)
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_AUTHORITY_STALE",
            "A launch attempt cannot time out before its stored expiry."
          );
        }
        if (options.terminalState === "terminated") {
          const exit = options.processExitEvidence;
          if (
            !exit ||
            attempt.child_process_id !== exit.process_id ||
            attempt.child_process_start_token !== exit.process_start_token
          ) {
            throw new RuntimeProcessAuthorityError(
              "EE_PROCESS_IDENTITY_MISMATCH",
              "Pre-lease process termination requires exact bound child exit evidence."
            );
          }
        }
        const blocked = launchState.launch_count_in_window >=
          SUPERVISOR_RUNTIME_POLICY.max_supervisor_launches_per_window;
        const backoffIndex = Math.min(
          Math.max(launchState.launch_count_in_window - 1, 0),
          SUPERVISOR_RUNTIME_POLICY.restart_backoff_ms.length - 1
        );
        const nextLaunchAt = blocked
          ? null
          : new Date(
            toProcessAuthorityEpochMs(observedAt) +
              SUPERVISOR_RUNTIME_POLICY.restart_backoff_ms[backoffIndex]
          ).toISOString();
        const attemptUpdate = this.db.prepare(
          `UPDATE supervisor_launch_attempts
           SET attempt_state = ?,
               attempt_state_revision = attempt_state_revision + 1,
               terminal_at = ?,
               terminal_code = ?
           WHERE home_id = ?
             AND launch_attempt_id = ?
             AND attempt_state = ?
             AND attempt_state_revision = ?
             AND lease_acquired_at IS NULL`
        ).run(
          options.terminalState,
          observedAt,
          options.terminalCode,
          this.homeId,
          options.attemptId,
          attempt.attempt_state,
          options.expectedAttemptStateRevision
        );
        const launchUpdate = this.db.prepare(
          `UPDATE supervisor_launch_state
           SET launch_revision = launch_revision + 1,
               launch_state = ?,
               next_launch_at = ?,
               last_failure_code = ?
           WHERE home_id = ?
             AND launch_revision = ?
             AND current_launch_attempt_id = ?`
        ).run(
          blocked ? "blocked" : "backoff",
          nextLaunchAt,
          options.terminalCode,
          this.homeId,
          options.expectedLaunchRevision,
          options.attemptId
        );
        if (!changedOneRow(attemptUpdate) || !changedOneRow(launchUpdate)) {
          throw new RuntimeProcessAuthorityError(
            "EE_LAUNCH_ATTEMPT_STALE",
            "Pre-lease terminalization lost its attempt or launch revision CAS."
          );
        }
        return readLaunchAttempt(this.db, this.homeId, options.attemptId)!;
      }
    });
  }
}

export const PROCESS_AUTHORITY_LAUNCH_POLICY = Object.freeze({
  package_activation_policy: PACKAGE_ACTIVATION_TIMING_POLICY.policy_version,
  launch_attempt_timeout_ms: PACKAGE_ACTIVATION_TIMING_POLICY.launch_attempt_timeout_ms,
  authorization_single_use: true,
  child_binding_required_before_lease: true,
  unrestricted_authorization_issuer: false
});
