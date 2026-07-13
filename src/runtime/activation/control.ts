import type { DatabaseSync } from "node:sqlite";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import {
  PACKAGE_ACTIVATION_TIMING_POLICY,
  SUPERVISOR_RUNTIME_POLICY,
  type LaunchAuthorizationRole
} from "../process/constants.js";
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
import {
  RuntimeLaunchAuthorizationIssuer
} from "../process/launch-authority.js";
import type {
  RuntimeProcessAuthorityClock,
  S6PackageAuthorizationMutationProvider
} from "../process/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  BLOCKED_BOUNDARY_EXIT_CONTRACT,
  CONTROL_REQUEST_RETENTION_POLICY,
  type BlockedBoundary,
  type GatewayPackageAuthorityOperation,
  type OpenClawNativeOperation
} from "./constants.js";
import {
  readActivationHandshake,
  readControlIdempotency,
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import { RuntimeActivationError } from "./errors.js";
import {
  RuntimePackageActivationRepository,
  assertVerifiedPackageClosure
} from "./repository.js";
import {
  assertPackageActivationShape,
  assertRequestedWriterMode
} from "./state-contract.js";
import type {
  ActivationWriter,
  ControlRequestIdempotencyRow,
  GatewayActivationWriter,
  PackageActivationAuthorityRow,
  SupervisorActivationWriter,
  VerifiedPackageClosureEvidence
} from "./types.js";

type ControlMutationResult = {
  projectionRevision: number;
  resultCode: string;
  result: Record<string, unknown>;
};

type ControlRequestedOperation =
  | OpenClawNativeOperation
  | GatewayPackageAuthorityOperation;

export type ControlExecutionResult = {
  replayed: boolean;
  record: ControlRequestIdempotencyRow;
};

const addMilliseconds = (timestamp: string, milliseconds: number): string =>
  new Date(toProcessAuthorityEpochMs(timestamp) + milliseconds).toISOString();

const readCanonicalGateway = (
  db: DatabaseSync,
  homeId: string,
  observedAt: string
): {
  gateway_instance_id: string;
  package_generation_id: string;
} | undefined => db.prepare(
  `SELECT gateway_instance_id, package_generation_id
   FROM gateway_heartbeats
   WHERE home_id = ? AND expires_at > ?
   ORDER BY heartbeat_at DESC, gateway_instance_id DESC
   LIMIT 1`
).get(homeId, observedAt) as {
  gateway_instance_id: string;
  package_generation_id: string;
} | undefined;

export const createControlRequestDigest = (options: {
  operation: ControlRequestedOperation;
  parameters: Record<string, unknown>;
}): string => sha256Text(canonicalJson({
  operation: options.operation,
  parameters: options.parameters
}));

const stableResultDigest = (result: Record<string, unknown>): string =>
  sha256Text(canonicalJson(result));

const activationErrorCode = (error: unknown): string =>
  error instanceof RuntimeActivationError
    ? error.code
    : error && typeof error === "object" &&
        "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "EE_PACKAGE_ACTIVATION_INVALID";

export class RuntimeControlRequestRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  read(controlRequestId: string): ControlRequestIdempotencyRow | undefined {
    return readControlIdempotency(this.db, this.homeId, controlRequestId);
  }

  execute(options: {
    controlRequestId: string;
    requestDigest: string;
    requestedOperation: ControlRequestedOperation;
    expectedProjectionRevision: number;
    expectedSupervisorLeaseEpoch: number | null;
    expectedGatewayInstanceId: string;
    writer: ActivationWriter;
    mutate: (context: {
      observedAt: string;
      activation: PackageActivationAuthorityRow;
      canonicalGatewayPackageGenerationId: string;
    }) => ControlMutationResult;
  }): ControlExecutionResult {
    assertRequestedWriterMode(options.writer);
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const existing = readControlIdempotency(
          this.db,
          this.homeId,
          options.controlRequestId
        );
        if (existing) {
          if (existing.request_digest !== options.requestDigest) {
            throw new RuntimeActivationError(
              "EE_CONTROL_REQUEST_CONFLICT",
              "One control request id cannot be reused with a different normalized request digest."
            );
          }
          return { replayed: true, record: existing };
        }
        const activation = readPackageActivationAuthority(this.db, this.homeId);
        const gateway = readCanonicalGateway(this.db, this.homeId, observedAt);
        const freshSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        let mutation: ControlMutationResult;
        let requestState: "completed" | "rejected" = "completed";
        try {
          if (
            !activation ||
            activation.activation_revision !== options.expectedProjectionRevision ||
            !gateway ||
            gateway.gateway_instance_id !== options.expectedGatewayInstanceId
          ) {
            throw new RuntimeActivationError(
              "EE_CONTROL_REQUEST_STALE",
              "Control request lost the expected package projection or gateway revision CAS."
            );
          }
          assertPackageActivationShape(activation);
          if (options.writer.kind === "gateway_service_controller") {
            if (
              options.expectedSupervisorLeaseEpoch !== null ||
              options.writer.gateway_instance_id !== options.expectedGatewayInstanceId ||
              options.writer.plugin_package_generation_id !==
                gateway.package_generation_id ||
              freshSupervisor.available && freshSupervisor.fresh
            ) {
              throw new RuntimeActivationError(
                "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
                "Gateway control mode requires no expected supervisor epoch and objective absence of fresh supervisor authority."
              );
            }
          } else if (
            options.expectedSupervisorLeaseEpoch !==
              options.writer.supervisor_lease_epoch ||
            !freshSupervisor.available ||
            !freshSupervisor.fresh ||
            freshSupervisor.supervisor_owner_id !==
              options.writer.supervisor_owner_id ||
            freshSupervisor.supervisor_lease_epoch !==
              options.writer.supervisor_lease_epoch ||
            freshSupervisor.supervisor_lease_state_revision !==
              options.writer.supervisor_lease_state_revision
          ) {
            throw new RuntimeActivationError(
              "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
              "Supervisor control mode requires the exact fresh owner, epoch, and state revision."
            );
          }
          mutation = options.mutate({
            observedAt,
            activation,
            canonicalGatewayPackageGenerationId: gateway.package_generation_id
          });
        } catch (error) {
          requestState = "rejected";
          mutation = {
            projectionRevision: activation?.activation_revision ?? 0,
            resultCode: activationErrorCode(error),
            result: {
              accepted: false,
              code: activationErrorCode(error)
            }
          };
        }
        const resultDigest = stableResultDigest(mutation.result);
        const expiresAt = addMilliseconds(
          observedAt,
          CONTROL_REQUEST_RETENTION_POLICY.minimum_retention_ms
        );
        this.db.prepare(
          `INSERT INTO control_request_idempotency (
            home_id,
            control_request_id,
            request_digest,
            requested_operation,
            expected_projection_revision,
            expected_supervisor_lease_epoch,
            expected_gateway_instance_id,
            request_state,
            result_projection_revision,
            result_code,
            result_digest,
            created_at,
            completed_at,
            expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          this.homeId,
          options.controlRequestId,
          options.requestDigest,
          options.requestedOperation,
          options.expectedProjectionRevision,
          options.expectedSupervisorLeaseEpoch,
          options.expectedGatewayInstanceId,
          requestState,
          mutation.projectionRevision,
          mutation.resultCode,
          resultDigest,
          observedAt,
          observedAt,
          expiresAt
        );
        return {
          replayed: false,
          record: readControlIdempotency(
            this.db,
            this.homeId,
            options.controlRequestId
          )!
        };
      }
    });
  }

  cleanupExpired(options: {
    expectedProjectionRevision: number;
    observedAt: string;
  }): number {
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const activation = readPackageActivationAuthority(this.db, this.homeId);
        if (
          !activation ||
          activation.activation_revision !== options.expectedProjectionRevision
        ) {
          throw new RuntimeActivationError(
            "EE_CONTROL_REQUEST_STALE",
            "Control retention cleanup lost the expected package projection revision."
          );
        }
        const rows = this.db.prepare(
          `SELECT control_request_id
           FROM control_request_idempotency
           WHERE home_id = ?
             AND request_state IN ('completed', 'rejected')
             AND expires_at <= ?
           ORDER BY expires_at, control_request_id
           LIMIT ?`
        ).all(
          this.homeId,
          options.observedAt,
          CONTROL_REQUEST_RETENTION_POLICY.cleanup_batch_limit
        ) as Array<{ control_request_id: string }>;
        for (const row of rows) {
          this.db.prepare(
            `DELETE FROM control_request_idempotency
             WHERE home_id = ?
               AND control_request_id = ?
               AND request_state IN ('completed', 'rejected')
               AND expires_at <= ?`
          ).run(this.homeId, row.control_request_id, options.observedAt);
        }
        return rows.length;
      }
    });
  }
}

const deriveBlockedBoundary = (
  activation: PackageActivationAuthorityRow
): Exclude<BlockedBoundary, "none"> => {
  if (activation.activation_state === "production_activating") {
    return "post_identity";
  }
  if (activation.pending_transition_kind === "initial") {
    return "pre_identity_initial";
  }
  if (activation.pending_transition_kind === "upgrade") {
    return "pre_identity_upgrade";
  }
  if (activation.pending_transition_kind === "rollback") {
    return "pre_identity_rollback";
  }
  throw new RuntimeActivationError(
    "EE_PACKAGE_ACTIVATION_INVALID",
    "Blocked transition cannot derive a frozen package identity boundary."
  );
};

const expectedRoleForBoundary = (
  boundary: BlockedBoundary
): LaunchAuthorizationRole => {
  switch (boundary) {
    case "pre_identity_initial":
      return "initial_candidate";
    case "pre_identity_upgrade":
      return "pending";
    case "pre_identity_rollback":
      return "rollback_candidate";
    case "post_identity":
    case "none":
      return "active";
  }
};

const writerColumns = (writer: ActivationWriter) => ({
  kind: writer.kind,
  gateway: writer.kind === "gateway_service_controller"
    ? writer.gateway_instance_id
    : null,
  supervisor: writer.kind === "supervisor"
    ? writer.supervisor_owner_id
    : null,
  epoch: writer.kind === "supervisor"
    ? writer.supervisor_lease_epoch
    : null
});

const terminalizeProjectedAuthorizationIfIssued = (options: {
  db: DatabaseSync;
  homeId: string;
  activation: PackageActivationAuthorityRow;
  observedAt: string;
  terminalCode: string;
}): void => {
  if (
    !options.activation.launch_authorization_id ||
    options.activation.launch_authorization_state !== "issued"
  ) {
    return;
  }
  const update = options.db.prepare(
    `UPDATE package_launch_authorizations
     SET authorization_state = 'cancelled',
         authorization_state_revision = authorization_state_revision + 1,
         terminal_at = ?,
         terminal_code = ?
     WHERE home_id = ?
       AND launch_authorization_id = ?
       AND authorization_revision = ?
       AND authorization_state_revision = ?
       AND authorization_state = 'issued'
       AND consumed_by_launch_attempt_id IS NULL`
  ).run(
    options.observedAt,
    options.terminalCode,
    options.homeId,
    options.activation.launch_authorization_id,
    options.activation.launch_authorization_revision,
    options.activation.launch_authorization_state_revision
  );
  if (!changedOneRow(update)) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_STALE",
      "Replacement authorization could not terminalize the exact current issued authorization."
    );
  }
};

const TERMINAL_LAUNCH_ATTEMPT_STATES = new Set([
  "spawn_failed",
  "timed_out",
  "cancelled",
  "lease_expired",
  "terminated"
]);

const assertConsumedAttemptTerminalForGateway = (options: {
  db: DatabaseSync;
  homeId: string;
  activation: PackageActivationAuthorityRow;
  writer: ActivationWriter;
}): void => {
  if (
    options.writer.kind !== "gateway_service_controller" ||
    options.activation.launch_authorization_state !== "consumed"
  ) {
    return;
  }
  if (!options.activation.launch_authorization_consumed_by_attempt_id) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_STALE",
      "Consumed package authorization is missing its immutable launch attempt pointer."
    );
  }
  const attempt = options.db.prepare(
    `SELECT attempt_state
     FROM supervisor_launch_attempts
     WHERE home_id = ? AND launch_attempt_id = ?`
  ).get(
    options.homeId,
    options.activation.launch_authorization_consumed_by_attempt_id
  ) as { attempt_state: string } | undefined;
  if (!attempt || !TERMINAL_LAUNCH_ATTEMPT_STATES.has(attempt.attempt_state)) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
      "Gateway blocked exit requires the consumed launch attempt to be terminal."
    );
  }
};

const stopMatchingTransitionWorker = (options: {
  db: DatabaseSync;
  homeId: string;
  activation: PackageActivationAuthorityRow;
  observedAt: string;
  terminalCode: string;
}): void => {
  const worker = readWorkerLeaseByHome(options.db, options.homeId);
  if (
    !worker ||
    worker.state === "stopped" ||
    (
      worker.package_generation_id !== options.activation.active_package_generation_id &&
      worker.package_generation_id !== options.activation.pending_package_generation_id
    )
  ) {
    return;
  }
  const heartbeatAt = new Date(Math.max(
    toProcessAuthorityEpochMs(worker.started_at),
    toProcessAuthorityEpochMs(options.observedAt) - 1
  )).toISOString();
  const expiresAt = toProcessAuthorityEpochMs(options.observedAt) >
      toProcessAuthorityEpochMs(heartbeatAt)
    ? options.observedAt
    : new Date(toProcessAuthorityEpochMs(heartbeatAt) + 1).toISOString();
  const update = options.db.prepare(
    `UPDATE worker_leases
     SET state = 'stopped',
         shutdown_requested_at = COALESCE(shutdown_requested_at, ?),
         drain_deadline_at = NULL,
         heartbeat_at = ?,
         expires_at = ?,
         last_failure_code = ?
     WHERE home_id = ?
       AND owner_id = ?
       AND fencing_token = ?
       AND state <> 'stopped'`
  ).run(
    options.observedAt,
    heartbeatAt,
    expiresAt,
    options.terminalCode,
    options.homeId,
    worker.owner_id,
    worker.fencing_token
  );
  if (!changedOneRow(update)) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_STALE",
      "Blocked exit lost the exact transition worker fence."
    );
  }
};

const sameTransitionSupervisorMayRetry = (options: {
  db: DatabaseSync;
  homeId: string;
  activation: PackageActivationAuthorityRow;
  writer: ActivationWriter;
}): boolean => {
  if (
    options.writer.kind !== "supervisor" ||
    options.activation.launch_authorization_state !== "consumed" ||
    !options.activation.launch_authorization_id ||
    !options.activation.pending_package_generation_id
  ) {
    return false;
  }
  const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
  return Boolean(
    supervisor &&
    supervisor.owner_id === options.writer.supervisor_owner_id &&
    supervisor.lease_epoch === options.writer.supervisor_lease_epoch &&
    supervisor.package_generation_id ===
      options.activation.pending_package_generation_id &&
    supervisor.launch_authorization_id ===
      options.activation.launch_authorization_id
  );
};

const clearLaunchAuthorizationProjection = (options: {
  db: DatabaseSync;
  homeId: string;
  nextActivationRevision: number;
  activePackageGenerationId: string | null;
  initial: boolean;
}): void => {
  const launch = options.db.prepare(
    `SELECT launch_revision
     FROM supervisor_launch_state
     WHERE home_id = ?`
  ).get(options.homeId) as { launch_revision: number } | undefined;
  if (!launch) {
    return;
  }
  const update = options.db.prepare(
    `UPDATE supervisor_launch_state
     SET launch_revision = launch_revision + 1,
         package_generation_id = ?,
         launch_authorization_id = NULL,
         launch_authorized_generation_id = NULL,
         launch_authorization_role = NULL,
         launch_authorization_state_revision = 0,
         expected_current_activation_revision = ?,
         expected_active_package_generation_id = ?,
         expected_pending_package_generation_id = NULL,
         launch_owner_gateway_instance_id = NULL,
         launch_owner_process_start_token = NULL,
         next_launch_at = NULL,
         last_failure_code = NULL
     WHERE home_id = ? AND launch_revision = ?`
  ).run(
    options.initial ? null : options.activePackageGenerationId,
    options.nextActivationRevision,
    options.initial ? null : options.activePackageGenerationId,
    options.homeId,
    launch.launch_revision
  );
  if (!changedOneRow(update)) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_STALE",
      "Blocked exit lost the current launch authorization projection CAS."
    );
  }
};

export class RuntimePackageActivationControlService {
  private readonly requests: RuntimeControlRequestRepository;

  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {
    this.requests = new RuntimeControlRequestRepository(db, homeId, clock);
  }

  initializePackageActivation(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedLaunchRevision: number;
    authorizationId: string;
    packageClosure: VerifiedPackageClosureEvidence;
    expectedGatewayInstanceId: string;
    writer: GatewayActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "initialize_package_activation",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          expectedLaunchRevision: options.expectedLaunchRevision,
          authorizationId: options.authorizationId,
          packageGenerationId:
            options.packageClosure.package_identity.package_generation_id,
          closureManifestDigest:
            options.packageClosure.closure_manifest_digest
        }
      }),
      requestedOperation: "initialize_package_activation",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: null,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: () => {
        const initialized = new RuntimePackageActivationRepository(
          this.db,
          this.homeId,
          this.clock
        ).initializePackageActivationInTransaction({
          expectedActivationRevision: options.expectedProjectionRevision,
          expectedLaunchRevision: options.expectedLaunchRevision,
          authorizationId: options.authorizationId,
          packageClosure: options.packageClosure,
          writer: options.writer
        });
        return {
          projectionRevision:
            initialized.activation.activation_revision,
          resultCode: "package_activation_initialized",
          result: {
            accepted: true,
            projectionRevision:
              initialized.activation.activation_revision,
            authorizationId:
              initialized.authorization.launch_authorization_id
          }
        };
      }
    });
  }

  enterBlocked(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    failureCode: string;
    writer: ActivationWriter;
  }): ControlExecutionResult {
    const parameters = {
      expectedProjectionRevision: options.expectedProjectionRevision,
      failureCode: options.failureCode
    };
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "enter_blocked_transition",
        parameters
      }),
      requestedOperation: "enter_blocked_transition",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({ observedAt, activation }) => {
        const boundary = deriveBlockedBoundary(activation);
        const from = activation.activation_state;
        if (![
          "preparing",
          "draining_old",
          "migrating",
          "preactivation_verifying",
          "production_activating"
        ].includes(from)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Only a live package transition can enter the blocked state."
          );
        }
        const writer = writerColumns(options.writer);
        const nextRevision = activation.activation_revision + 1;
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_revision = ?,
               activation_state = 'blocked',
               blocked_boundary = ?,
               blocked_from_state = ?,
               production_activation_handshake_id = CASE
                 WHEN ? = 'post_identity' THEN NULL
                 ELSE production_activation_handshake_id
               END,
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = ?
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = ?`
        ).run(
          nextRevision,
          boundary,
          from,
          boundary,
          writer.kind,
          writer.gateway,
          writer.supervisor,
          writer.epoch,
          observedAt,
          options.failureCode,
          this.homeId,
          activation.activation_revision,
          from
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Entering blocked state lost the exact package revision and state CAS."
          );
        }
        const worker = readWorkerLeaseByHome(this.db, this.homeId);
        if (
          worker &&
          worker.state !== "stopped" &&
          (
            worker.package_generation_id === activation.active_package_generation_id ||
            worker.package_generation_id === activation.pending_package_generation_id
          )
        ) {
          const workerUpdate = this.db.prepare(
            `UPDATE worker_leases
             SET state = 'blocked',
                 shutdown_requested_at = COALESCE(shutdown_requested_at, ?),
                 drain_deadline_at = ?,
                 heartbeat_at = ?,
                 last_failure_code = ?
             WHERE home_id = ?
               AND owner_id = ?
               AND fencing_token = ?
               AND state <> 'stopped'
               AND package_generation_id = ?`
          ).run(
            observedAt,
            addMilliseconds(
              observedAt,
              SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms
            ),
            observedAt,
            options.failureCode,
            this.homeId,
            worker.owner_id,
            worker.fencing_token,
            worker.package_generation_id
          );
          if (!changedOneRow(workerUpdate)) {
            throw new RuntimeActivationError(
              "EE_PACKAGE_ACTIVATION_STALE",
              "Entering blocked state lost the matching worker fence in the same transaction."
            );
          }
        }
        return {
          projectionRevision: nextRevision,
          resultCode: "blocked_transition_entered",
          result: { accepted: true, boundary, projectionRevision: nextRevision }
        };
      }
    });
  }

  retryPackageActivation(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    authorizationId: string;
    expectedLaunchRevision: number;
    writer: ActivationWriter;
  }): ControlExecutionResult {
    const parameters = {
      expectedProjectionRevision: options.expectedProjectionRevision,
      authorizationId: options.authorizationId,
      expectedLaunchRevision: options.expectedLaunchRevision
    };
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "retry_package_activation",
        parameters
      }),
      requestedOperation: "retry_package_activation",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({
        observedAt,
        activation,
        canonicalGatewayPackageGenerationId
      }) => {
        if (
          activation.activation_state !== "blocked" ||
          !BLOCKED_BOUNDARY_EXIT_CONTRACT[
            activation.blocked_boundary
          ].includes("retry_package_activation" as never) ||
          !activation.pending_package_generation_id
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Package activation retry applies only to a pre-identity blocked boundary."
          );
        }
        const nextRevision = activation.activation_revision + 1;
        const deadline = addMilliseconds(
          observedAt,
          PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
        );
        const writer = writerColumns(options.writer);
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_revision = ?,
               activation_state = 'preparing',
               activation_deadline_at = ?,
               preactivation_handshake_id = NULL,
               production_activation_handshake_id = CASE
                 WHEN blocked_boundary = 'pre_identity_initial' THEN NULL
                 ELSE production_activation_handshake_id
               END,
               blocked_boundary = 'none',
               blocked_from_state = 'none',
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'blocked'
             AND blocked_boundary = ?`
        ).run(
          nextRevision,
          deadline,
          writer.kind,
          writer.gateway,
          writer.supervisor,
          writer.epoch,
          observedAt,
          this.homeId,
          activation.activation_revision,
          activation.blocked_boundary
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Package activation retry lost the exact blocked revision CAS."
          );
        }
        if (sameTransitionSupervisorMayRetry({
          db: this.db,
          homeId: this.homeId,
          activation,
          writer: options.writer
        })) {
          stopMatchingTransitionWorker({
            db: this.db,
            homeId: this.homeId,
            activation,
            observedAt,
            terminalCode: "package_activation_retry_worker_fenced"
          });
          return {
            projectionRevision: nextRevision,
            resultCode: "package_activation_retry_continued_by_current_supervisor",
            result: {
              accepted: true,
              projectionRevision: nextRevision,
              authorizationId: activation.launch_authorization_id
            }
          };
        }
        assertConsumedAttemptTerminalForGateway({
          db: this.db,
          homeId: this.homeId,
          activation,
          writer: options.writer
        });
        terminalizeProjectedAuthorizationIfIssued({
          db: this.db,
          homeId: this.homeId,
          activation,
          observedAt,
          terminalCode: "replaced_by_package_activation_retry"
        });
        const role = expectedRoleForBoundary(activation.blocked_boundary);
        const provider = this.authorizationProvider({
          operation: "retry_package_activation",
          writer: options.writer,
          activationRevision: nextRevision,
          authorizationRevision: activation.launch_authorization_revision + 1,
          authorizationStateRevision: activation.launch_authorization_state_revision,
          observedAt,
          expiresAt: deadline,
          targetGenerationId: activation.pending_package_generation_id,
          role
        });
        new RuntimeLaunchAuthorizationIssuer(
          this.db,
          this.homeId,
          provider,
          this.clock
        ).issueInTransaction({
          authorizationId: options.authorizationId,
          packageGenerationId: activation.pending_package_generation_id,
          gatewayPackageGenerationId: canonicalGatewayPackageGenerationId,
          authorizationRole: role,
          gatewayInstanceId: options.expectedGatewayInstanceId,
          gatewayProcessStartToken: options.writer.kind === "gateway_service_controller"
            ? options.writer.gateway_process_start_token
            : this.readGatewayStartToken(options.expectedGatewayInstanceId),
          expectedLaunchRevision: options.expectedLaunchRevision,
          resetLaunchBudget: true,
          issuer: options.writer.kind === "gateway_service_controller"
            ? {
              kind: "gateway_service_controller",
              gatewayInstanceId: options.writer.gateway_instance_id
            }
            : {
              kind: "supervisor",
              supervisorOwnerId: options.writer.supervisor_owner_id,
              supervisorLeaseEpoch: options.writer.supervisor_lease_epoch
            }
        });
        return {
          projectionRevision: nextRevision,
          resultCode: "package_activation_retry_started",
          result: { accepted: true, projectionRevision: nextRevision }
        };
      }
    });
  }

  cancelPackageTransition(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    authorizationId?: string;
    expectedLaunchRevision?: number;
    writer: ActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "cancel_package_transition",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          authorizationId: options.authorizationId,
          expectedLaunchRevision: options.expectedLaunchRevision
        }
      }),
      requestedOperation: "cancel_package_transition",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({
        observedAt,
        activation,
        canonicalGatewayPackageGenerationId
      }) => {
        if (
          activation.activation_state !== "blocked" ||
          !BLOCKED_BOUNDARY_EXIT_CONTRACT[
            activation.blocked_boundary
          ].includes("cancel_package_transition" as never)
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Package cancellation applies only to a pre-identity blocked boundary."
          );
        }
        const initial = activation.blocked_boundary === "pre_identity_initial";
        const canReturnActive =
          !initial && Boolean(activation.production_activation_handshake_id);
        const currentSupervisor = readSupervisorLeaseByHome(
          this.db,
          this.homeId
        );
        const selectedActiveSupervisorCanContinue = Boolean(
          !initial &&
          activation.active_package_generation_id &&
          options.writer.kind === "supervisor" &&
          currentSupervisor &&
          currentSupervisor.owner_id === options.writer.supervisor_owner_id &&
          currentSupervisor.lease_epoch ===
            options.writer.supervisor_lease_epoch &&
          currentSupervisor.package_generation_id ===
            activation.active_package_generation_id
        );
        if (
          !initial &&
          options.writer.kind === "supervisor" &&
          !selectedActiveSupervisorCanContinue
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
            "A pending-generation supervisor must release before cancellation can restore the selected active generation."
          );
        }
        const nextState = initial
          ? "uninitialized"
          : canReturnActive
            ? "active"
            : "production_activating";
        const nextRevision = activation.activation_revision + 1;
        const nextDeadline = nextState === "production_activating"
          ? addMilliseconds(
            observedAt,
            PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
          )
          : null;
        const replacementAuthorizationRequired = Boolean(
          nextState === "production_activating" &&
          !selectedActiveSupervisorCanContinue
        );
        if (
          replacementAuthorizationRequired &&
          (
            options.writer.kind !== "gateway_service_controller" ||
            !options.authorizationId ||
            options.expectedLaunchRevision === undefined ||
            !Number.isSafeInteger(options.expectedLaunchRevision) ||
            options.expectedLaunchRevision < 0
          )
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Cancellation without a continuing selected-generation supervisor requires a new active authorization id and exact launch revision."
          );
        }
        const writer = writerColumns(options.writer);
        assertConsumedAttemptTerminalForGateway({
          db: this.db,
          homeId: this.homeId,
          activation,
          writer: options.writer
        });
        terminalizeProjectedAuthorizationIfIssued({
          db: this.db,
          homeId: this.homeId,
          activation,
          observedAt,
          terminalCode: "package_transition_cancelled"
        });
        stopMatchingTransitionWorker({
          db: this.db,
          homeId: this.homeId,
          activation,
          observedAt,
          terminalCode: "package_transition_cancelled"
        });
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_revision = ?,
               pending_package_generation_id = NULL,
               previous_package_generation_id = CASE
                 WHEN ? = 1 THEN NULL ELSE previous_package_generation_id
               END,
               pending_transition_kind = 'none',
               activation_deadline_at = ?,
               preactivation_handshake_id = NULL,
               production_activation_handshake_id = CASE
                 WHEN ? = 1 THEN NULL
                 ELSE production_activation_handshake_id
               END,
               launch_authorization_id = NULL,
               launch_authorized_generation_id = NULL,
               launch_authorization_role = 'none',
               launch_authorization_state = 'none',
               launch_authorization_state_revision = 0,
               launch_authorization_issued_at = NULL,
               launch_authorization_expires_at = NULL,
               launch_authorization_consumed_by_attempt_id = NULL,
               launch_authorization_consumed_at = NULL,
               activation_state = ?,
               blocked_boundary = 'none',
               blocked_from_state = 'none',
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'blocked'
             AND blocked_boundary = ?`
        ).run(
          nextRevision,
          initial ? 1 : 0,
          nextDeadline,
          initial ? 1 : 0,
          nextState,
          writer.kind,
          writer.gateway,
          writer.supervisor,
          writer.epoch,
          observedAt,
          this.homeId,
          activation.activation_revision,
          activation.blocked_boundary
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Package cancellation lost the exact blocked revision CAS."
          );
        }
        if (replacementAuthorizationRequired) {
          const activePackageGenerationId =
            activation.active_package_generation_id;
          if (!activePackageGenerationId || !nextDeadline) {
            throw new RuntimeActivationError(
              "EE_PACKAGE_ACTIVATION_INVALID",
              "Active replacement authorization requires selected identity and a new production deadline."
            );
          }
          const gatewayWriter = options.writer as GatewayActivationWriter;
          const provider = this.authorizationProvider({
            operation: "cancel_package_transition",
            writer: gatewayWriter,
            activationRevision: nextRevision,
            authorizationRevision: activation.launch_authorization_revision + 1,
            authorizationStateRevision: 0,
            observedAt,
            expiresAt: nextDeadline,
            targetGenerationId: activePackageGenerationId,
            role: "active"
          });
          new RuntimeLaunchAuthorizationIssuer(
            this.db,
            this.homeId,
            provider,
            this.clock
          ).issueInTransaction({
            authorizationId: options.authorizationId!,
            packageGenerationId: activePackageGenerationId,
            gatewayPackageGenerationId:
              canonicalGatewayPackageGenerationId,
            authorizationRole: "active",
            gatewayInstanceId: options.expectedGatewayInstanceId,
            gatewayProcessStartToken:
              gatewayWriter.gateway_process_start_token,
            expectedLaunchRevision: options.expectedLaunchRevision!,
            resetLaunchBudget: false,
            issuer: {
              kind: "gateway_service_controller",
              gatewayInstanceId: gatewayWriter.gateway_instance_id
            }
          });
        } else {
          clearLaunchAuthorizationProjection({
            db: this.db,
            homeId: this.homeId,
            nextActivationRevision: nextRevision,
            activePackageGenerationId: activation.active_package_generation_id,
            initial
          });
        }
        return {
          projectionRevision: nextRevision,
          resultCode: initial
            ? "initial_package_activation_cancelled"
            : canReturnActive
              ? "package_transition_cancelled_to_active"
              : replacementAuthorizationRequired
                ? "package_transition_cancelled_active_restart_authorized"
                : "package_transition_cancelled_requires_production_handshake",
          result: { accepted: true, projectionRevision: nextRevision, state: nextState }
        };
      }
    });
  }

  retryProductionActivation(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    authorizationId?: string;
    expectedLaunchRevision?: number;
    writer: ActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "retry_production_activation",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          authorizationId: options.authorizationId,
          expectedLaunchRevision: options.expectedLaunchRevision
        }
      }),
      requestedOperation: "retry_production_activation",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({
        observedAt,
        activation,
        canonicalGatewayPackageGenerationId
      }) => {
        if (
          activation.activation_state !== "blocked" ||
          activation.blocked_boundary !== "post_identity" ||
          !activation.active_package_generation_id
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Production activation retry applies only after the identity CAS."
          );
        }
        const nextRevision = activation.activation_revision + 1;
        const deadline = addMilliseconds(
          observedAt,
          PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
        );
        stopMatchingTransitionWorker({
          db: this.db,
          homeId: this.homeId,
          activation,
          observedAt,
          terminalCode: "production_activation_retry_worker_fenced"
        });
        const writer = writerColumns(options.writer);
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_revision = ?,
               activation_state = 'production_activating',
               activation_deadline_at = ?,
               production_activation_handshake_id = NULL,
               blocked_boundary = 'none',
               blocked_from_state = 'none',
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'blocked'
             AND blocked_boundary = 'post_identity'`
        ).run(
          nextRevision,
          deadline,
          writer.kind,
          writer.gateway,
          writer.supervisor,
          writer.epoch,
          observedAt,
          this.homeId,
          activation.activation_revision
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Production activation retry lost the exact blocked revision CAS."
          );
        }
        if (options.writer.kind === "gateway_service_controller") {
          assertConsumedAttemptTerminalForGateway({
            db: this.db,
            homeId: this.homeId,
            activation,
            writer: options.writer
          });
          terminalizeProjectedAuthorizationIfIssued({
            db: this.db,
            homeId: this.homeId,
            activation,
            observedAt,
            terminalCode: "replaced_by_production_activation_retry"
          });
          if (
            !options.authorizationId ||
            options.authorizationId.trim().length === 0 ||
            !Number.isSafeInteger(options.expectedLaunchRevision) ||
            (options.expectedLaunchRevision ?? -1) < 0
          ) {
            throw new RuntimeActivationError(
              "EE_PACKAGE_ACTIVATION_INVALID",
              "Gateway production retry requires a fresh authorization id and expected launch revision."
            );
          }
          const provider = this.authorizationProvider({
            operation: "retry_production_activation",
            writer: options.writer,
            activationRevision: nextRevision,
            authorizationRevision: activation.launch_authorization_revision + 1,
            authorizationStateRevision:
              activation.launch_authorization_state_revision,
            observedAt,
            expiresAt: deadline,
            targetGenerationId: activation.active_package_generation_id,
            role: "active"
          });
          new RuntimeLaunchAuthorizationIssuer(
            this.db,
            this.homeId,
            provider,
            this.clock
          ).issueInTransaction({
            authorizationId: options.authorizationId,
            packageGenerationId: activation.active_package_generation_id,
            authorizationRole: "active",
            gatewayInstanceId: options.expectedGatewayInstanceId,
            gatewayProcessStartToken:
              options.writer.gateway_process_start_token,
            expectedLaunchRevision: options.expectedLaunchRevision!,
            resetLaunchBudget: true,
            issuer: {
              kind: "gateway_service_controller",
              gatewayInstanceId: options.writer.gateway_instance_id
            }
          });
          return {
            projectionRevision: nextRevision,
            resultCode: "production_activation_retry_replacement_authorized",
            result: {
              accepted: true,
              projectionRevision: nextRevision,
              authorizationId: options.authorizationId
            }
          };
        }
        return {
          projectionRevision: nextRevision,
          resultCode: "production_activation_retry_started",
          result: { accepted: true, projectionRevision: nextRevision }
        };
      }
    });
  }

  issueActiveRestartAuthorization(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    authorizationId: string;
    expectedLaunchRevision: number;
    writer: GatewayActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "issue_active_restart_authorization",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          authorizationId: options.authorizationId,
          expectedLaunchRevision: options.expectedLaunchRevision
        }
      }),
      requestedOperation: "issue_active_restart_authorization",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: null,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({
        observedAt,
        activation,
        canonicalGatewayPackageGenerationId
      }) => {
        if (
          activation.activation_state !== "active" ||
          !activation.active_package_generation_id ||
          activation.pending_package_generation_id !== null ||
          activation.active_package_generation_id !==
            canonicalGatewayPackageGenerationId
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Active restart authorization requires the exact active package generation and no pending transition."
          );
        }
        const provider = this.authorizationProvider({
          operation: "issue_active_restart_authorization",
          writer: options.writer,
          activationRevision: activation.activation_revision,
          authorizationRevision: activation.launch_authorization_revision + 1,
          authorizationStateRevision: activation.launch_authorization_state_revision,
          observedAt,
          expiresAt: addMilliseconds(
            observedAt,
            PACKAGE_ACTIVATION_TIMING_POLICY.launch_authorization_ttl_ms
          ),
          targetGenerationId: activation.active_package_generation_id,
          role: "active"
        });
        new RuntimeLaunchAuthorizationIssuer(
          this.db,
          this.homeId,
          provider,
          this.clock
        ).issueInTransaction({
          authorizationId: options.authorizationId,
          packageGenerationId: activation.active_package_generation_id,
          authorizationRole: "active",
          gatewayInstanceId: options.expectedGatewayInstanceId,
          gatewayProcessStartToken: options.writer.gateway_process_start_token,
          expectedLaunchRevision: options.expectedLaunchRevision,
          resetLaunchBudget: false,
          issuer: {
            kind: "gateway_service_controller",
            gatewayInstanceId: options.writer.gateway_instance_id
          }
        });
        return {
          projectionRevision: activation.activation_revision,
          resultCode: "active_restart_authorization_issued",
          result: {
            accepted: true,
            projectionRevision: activation.activation_revision,
            authorizationId: options.authorizationId
          }
        };
      }
    });
  }

  preparePackageGeneration(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    authorizationId: string;
    expectedLaunchRevision: number;
    packageClosure: VerifiedPackageClosureEvidence;
    writer: ActivationWriter;
  }): ControlExecutionResult {
    const targetGenerationId =
      options.packageClosure.package_identity.package_generation_id;
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "prepare_package_generation",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          authorizationId: options.authorizationId,
          expectedLaunchRevision: options.expectedLaunchRevision,
          targetGenerationId,
          closureManifestDigest: options.packageClosure.closure_manifest_digest
        }
      }),
      requestedOperation: "prepare_package_generation",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({
        observedAt,
        activation,
        canonicalGatewayPackageGenerationId
      }) => {
        assertVerifiedPackageClosure(options.packageClosure, observedAt);
        if (
          activation.activation_state !== "active" ||
          !activation.active_package_generation_id ||
          !activation.production_activation_handshake_id ||
          targetGenerationId === activation.active_package_generation_id ||
          canonicalGatewayPackageGenerationId !== targetGenerationId
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Upgrade preparation requires an active generation and a distinct verified current gateway package generation."
          );
        }
        const nextRevision = activation.activation_revision + 1;
        const deadline = addMilliseconds(
          observedAt,
          PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
        );
        const writer = writerColumns(options.writer);
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_revision = ?,
               previous_package_generation_id = active_package_generation_id,
               pending_package_generation_id = ?,
               pending_transition_kind = 'upgrade',
               activation_state = 'preparing',
               activation_deadline_at = ?,
               preactivation_handshake_id = NULL,
               blocked_boundary = 'none',
               blocked_from_state = 'none',
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'active'
             AND active_package_generation_id IS NOT NULL
             AND pending_package_generation_id IS NULL
             AND production_activation_handshake_id IS NOT NULL`
        ).run(
          nextRevision,
          targetGenerationId,
          deadline,
          writer.kind,
          writer.gateway,
          writer.supervisor,
          writer.epoch,
          observedAt,
          this.homeId,
          activation.activation_revision
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Upgrade preparation lost the exact active package CAS."
          );
        }
        const provider = this.authorizationProvider({
          operation: "issue_deterministic_replacement_authorization",
          writer: options.writer,
          activationRevision: nextRevision,
          authorizationRevision: activation.launch_authorization_revision + 1,
          authorizationStateRevision: activation.launch_authorization_state_revision,
          observedAt,
          expiresAt: deadline,
          targetGenerationId,
          role: "pending"
        });
        new RuntimeLaunchAuthorizationIssuer(
          this.db,
          this.homeId,
          provider,
          this.clock
        ).issueInTransaction({
          authorizationId: options.authorizationId,
          packageGenerationId: targetGenerationId,
          gatewayPackageGenerationId: canonicalGatewayPackageGenerationId,
          authorizationRole: "pending",
          gatewayInstanceId: options.expectedGatewayInstanceId,
          gatewayProcessStartToken: options.writer.kind === "gateway_service_controller"
            ? options.writer.gateway_process_start_token
            : this.readGatewayStartToken(options.expectedGatewayInstanceId),
          expectedLaunchRevision: options.expectedLaunchRevision,
          resetLaunchBudget: true,
          issuer: options.writer.kind === "gateway_service_controller"
            ? {
              kind: "gateway_service_controller",
              gatewayInstanceId: options.writer.gateway_instance_id
            }
            : {
              kind: "supervisor",
              supervisorOwnerId: options.writer.supervisor_owner_id,
              supervisorLeaseEpoch: options.writer.supervisor_lease_epoch
            }
        });
        return {
          projectionRevision: nextRevision,
          resultCode: "package_generation_prepared",
          result: {
            accepted: true,
            projectionRevision: nextRevision,
            pendingPackageGenerationId: targetGenerationId
          }
        };
      }
    });
  }

  pauseLearning(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number;
    expectedWorkerOwnerId: string;
    expectedWorkerFencingToken: number;
    writer: SupervisorActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "pause_learning",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          expectedWorkerOwnerId: options.expectedWorkerOwnerId,
          expectedWorkerFencingToken: options.expectedWorkerFencingToken
        }
      }),
      requestedOperation: "pause_learning",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({ observedAt, activation }) => {
        if (
          activation.activation_state !== "active" ||
          !activation.active_package_generation_id ||
          activation.pending_package_generation_id !== null ||
          activation.pending_transition_kind !== "none" ||
          !activation.production_activation_handshake_id
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Learning pause requires one exact active production runtime."
          );
        }
        const drainDeadline = addMilliseconds(
          observedAt,
          SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms
        );
        const update = this.db.prepare(
          `UPDATE worker_leases
           SET state = 'draining',
               shutdown_requested_at = ?,
               drain_deadline_at = ?,
               heartbeat_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND owner_id = ?
             AND fencing_token = ?
             AND worker_mode = 'production'
             AND package_generation_id = ?
             AND supervisor_owner_id = ?
             AND supervisor_lease_epoch = ?
             AND state = 'active'
             AND expires_at > ?`
        ).run(
          observedAt,
          drainDeadline,
          observedAt,
          this.homeId,
          options.expectedWorkerOwnerId,
          options.expectedWorkerFencingToken,
          activation.active_package_generation_id,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Learning pause lost the exact active worker fence."
          );
        }
        return {
          projectionRevision: activation.activation_revision,
          resultCode: "learning_pause_requested",
          result: {
            accepted: true,
            projectionRevision: activation.activation_revision,
            drainDeadline
          }
        };
      }
    });
  }

  resumeLearning(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    authorizationId: string;
    expectedLaunchRevision: number;
    writer: ActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "resume_learning",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          authorizationId: options.authorizationId,
          expectedLaunchRevision: options.expectedLaunchRevision
        }
      }),
      requestedOperation: "resume_learning",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({
        observedAt,
        activation,
        canonicalGatewayPackageGenerationId
      }) => {
        if (
          activation.activation_state !== "active" ||
          !activation.active_package_generation_id ||
          activation.pending_package_generation_id !== null ||
          activation.pending_transition_kind !== "none" ||
          !activation.production_activation_handshake_id
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Learning resume requires the exact active package identity."
          );
        }
        if (options.writer.kind === "supervisor") {
          const worker = readWorkerLeaseByHome(this.db, this.homeId);
          if (
            !worker ||
            worker.state !== "draining" ||
            worker.worker_mode !== "production" ||
            worker.package_generation_id !== activation.active_package_generation_id ||
            worker.supervisor_owner_id !== options.writer.supervisor_owner_id ||
            worker.supervisor_lease_epoch !== options.writer.supervisor_lease_epoch ||
            !worker.shutdown_requested_at ||
            !worker.drain_deadline_at ||
            toProcessAuthorityEpochMs(worker.drain_deadline_at) <=
              toProcessAuthorityEpochMs(observedAt)
          ) {
            throw new RuntimeActivationError(
              "EE_PACKAGE_ACTIVATION_STALE",
              "Supervisor resume requires the exact unexpired deliberate-drain worker."
            );
          }
          const update = this.db.prepare(
            `UPDATE worker_leases
             SET state = 'active',
                 shutdown_requested_at = NULL,
                 drain_deadline_at = NULL,
                 heartbeat_at = ?,
                 last_failure_code = NULL
             WHERE home_id = ?
               AND owner_id = ?
               AND fencing_token = ?
               AND state = 'draining'
               AND shutdown_requested_at IS NOT NULL
               AND drain_deadline_at > ?`
          ).run(
            observedAt,
            this.homeId,
            worker.owner_id,
            worker.fencing_token,
            observedAt
          );
          if (!changedOneRow(update)) {
            throw new RuntimeActivationError(
              "EE_PACKAGE_ACTIVATION_STALE",
              "Learning resume lost the exact deliberate-drain worker CAS."
            );
          }
          return {
            projectionRevision: activation.activation_revision,
            resultCode: "learning_resumed_without_restart",
            result: {
              accepted: true,
              projectionRevision: activation.activation_revision,
              workerOwnerId: worker.owner_id,
              workerFencingToken: worker.fencing_token
            }
          };
        }
        if (
          activation.active_package_generation_id !==
            canonicalGatewayPackageGenerationId ||
          activation.launch_authorization_state === "issued"
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Gateway resume requires the exact active package and no outstanding issued authorization."
          );
        }
        const provider = this.authorizationProvider({
          operation: "issue_active_restart_authorization",
          writer: options.writer,
          activationRevision: activation.activation_revision,
          authorizationRevision: activation.launch_authorization_revision + 1,
          authorizationStateRevision: activation.launch_authorization_state_revision,
          observedAt,
          expiresAt: addMilliseconds(
            observedAt,
            PACKAGE_ACTIVATION_TIMING_POLICY.launch_authorization_ttl_ms
          ),
          targetGenerationId: activation.active_package_generation_id,
          role: "active"
        });
        new RuntimeLaunchAuthorizationIssuer(
          this.db,
          this.homeId,
          provider,
          this.clock
        ).issueInTransaction({
          authorizationId: options.authorizationId,
          packageGenerationId: activation.active_package_generation_id,
          authorizationRole: "active",
          gatewayInstanceId: options.expectedGatewayInstanceId,
          gatewayProcessStartToken: options.writer.gateway_process_start_token,
          expectedLaunchRevision: options.expectedLaunchRevision,
          resetLaunchBudget: false,
          issuer: {
            kind: "gateway_service_controller",
            gatewayInstanceId: options.writer.gateway_instance_id
          }
        });
        return {
          projectionRevision: activation.activation_revision,
          resultCode: "learning_resume_restart_authorized",
          result: {
            accepted: true,
            projectionRevision: activation.activation_revision,
            authorizationId: options.authorizationId
          }
        };
      }
    });
  }

  requestDrain(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number;
    expectedWorkerOwnerId: string;
    expectedWorkerFencingToken: number;
    writer: SupervisorActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "request_drain",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          expectedWorkerOwnerId: options.expectedWorkerOwnerId,
          expectedWorkerFencingToken: options.expectedWorkerFencingToken
        }
      }),
      requestedOperation: "request_drain",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({ observedAt, activation }) => {
        const deliberateActiveDrain = (
          activation.activation_state === "active" &&
          Boolean(activation.active_package_generation_id) &&
          activation.pending_package_generation_id === null &&
          activation.pending_transition_kind === "none" &&
          Boolean(activation.production_activation_handshake_id)
        );
        const packageTransitionDrain = (
          activation.activation_state === "preparing" &&
          Boolean(activation.active_package_generation_id) &&
          Boolean(activation.pending_package_generation_id) &&
          ["upgrade", "rollback"].includes(activation.pending_transition_kind)
        );
        if (!deliberateActiveDrain && !packageTransitionDrain) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Drain requires either an active runtime or a prepared upgrade/rollback transition."
          );
        }
        const drainDeadline = deliberateActiveDrain
          ? addMilliseconds(
            observedAt,
            SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms
          )
          : activation.activation_deadline_at ?? addMilliseconds(
            observedAt,
            PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
          );
        const workerUpdate = this.db.prepare(
          `UPDATE worker_leases
           SET state = 'draining',
               shutdown_requested_at = ?,
               drain_deadline_at = ?,
               heartbeat_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND owner_id = ?
             AND fencing_token = ?
             AND worker_mode = 'production'
             AND package_generation_id = ?
             AND supervisor_owner_id = ?
             AND supervisor_lease_epoch = ?
             AND state = 'active'
             AND expires_at > ?`
        ).run(
          observedAt,
          drainDeadline,
          observedAt,
          this.homeId,
          options.expectedWorkerOwnerId,
          options.expectedWorkerFencingToken,
          activation.active_package_generation_id,
          options.writer.supervisor_owner_id,
          options.writer.supervisor_lease_epoch,
          observedAt
        );
        const packageTransitionCommitted = deliberateActiveDrain || changedOneRow(
          this.db.prepare(
            `UPDATE package_activation_state
             SET activation_state = 'draining_old',
                 updated_by_kind = 'supervisor',
                 updated_by_gateway_instance_id = NULL,
                 updated_by_supervisor_owner_id = ?,
                 updated_by_supervisor_lease_epoch = ?,
                 updated_at = ?,
                 last_failure_code = NULL
             WHERE home_id = ?
               AND activation_revision = ?
               AND activation_state = 'preparing'
               AND active_package_generation_id = ?
               AND pending_package_generation_id IS NOT NULL`
          ).run(
            options.writer.supervisor_owner_id,
            options.writer.supervisor_lease_epoch,
            observedAt,
            this.homeId,
            activation.activation_revision,
            activation.active_package_generation_id
          )
        );
        if (!changedOneRow(workerUpdate) || !packageTransitionCommitted) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Drain request did not atomically fence the active worker and package transition."
          );
        }
        return {
          projectionRevision: activation.activation_revision,
          resultCode: deliberateActiveDrain
            ? "deliberate_runtime_drain_requested"
            : "package_transition_drain_requested",
          result: {
            accepted: true,
            projectionRevision: activation.activation_revision,
            drainKind: deliberateActiveDrain
              ? "deliberate_runtime"
              : "package_transition",
            drainDeadline
          }
        };
      }
    });
  }

  prepareRollback(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    authorizationId: string;
    expectedLaunchRevision: number;
    writer: ActivationWriter;
  }): ControlExecutionResult {
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "prepare_package_rollback",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          authorizationId: options.authorizationId,
          expectedLaunchRevision: options.expectedLaunchRevision
        }
      }),
      requestedOperation: "prepare_package_rollback",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({
        observedAt,
        activation,
        canonicalGatewayPackageGenerationId
      }) => {
        if (
          activation.activation_state !== "blocked" ||
          activation.blocked_boundary !== "post_identity" ||
          !activation.active_package_generation_id ||
          !activation.previous_package_generation_id
        ) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_INVALID",
            "Rollback preparation requires post-identity block and an explicit previous generation."
          );
        }
        const rollbackTarget = activation.previous_package_generation_id;
        const nextRevision = activation.activation_revision + 1;
        const deadline = addMilliseconds(
          observedAt,
          PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
        );
        const writer = writerColumns(options.writer);
        const update = this.db.prepare(
          `UPDATE package_activation_state
           SET activation_revision = ?,
               pending_package_generation_id = ?,
               pending_transition_kind = 'rollback',
               activation_state = 'preparing',
               activation_deadline_at = ?,
               preactivation_handshake_id = NULL,
               production_activation_handshake_id = NULL,
               blocked_boundary = 'none',
               blocked_from_state = 'none',
               updated_by_kind = ?,
               updated_by_gateway_instance_id = ?,
               updated_by_supervisor_owner_id = ?,
               updated_by_supervisor_lease_epoch = ?,
               updated_at = ?,
               last_failure_code = NULL
           WHERE home_id = ?
             AND activation_revision = ?
             AND activation_state = 'blocked'
             AND blocked_boundary = 'post_identity'`
        ).run(
          nextRevision,
          rollbackTarget,
          deadline,
          writer.kind,
          writer.gateway,
          writer.supervisor,
          writer.epoch,
          observedAt,
          this.homeId,
          activation.activation_revision
        );
        if (!changedOneRow(update)) {
          throw new RuntimeActivationError(
            "EE_PACKAGE_ACTIVATION_STALE",
            "Rollback preparation lost the exact post-identity blocked CAS."
          );
        }
        terminalizeProjectedAuthorizationIfIssued({
          db: this.db,
          homeId: this.homeId,
          activation,
          observedAt,
          terminalCode: "replaced_by_package_rollback"
        });
        const provider = this.authorizationProvider({
          operation: "prepare_package_rollback",
          writer: options.writer,
          activationRevision: nextRevision,
          authorizationRevision: activation.launch_authorization_revision + 1,
          authorizationStateRevision: activation.launch_authorization_state_revision,
          observedAt,
          expiresAt: deadline,
          targetGenerationId: rollbackTarget,
          role: "rollback_candidate"
        });
        new RuntimeLaunchAuthorizationIssuer(
          this.db,
          this.homeId,
          provider,
          this.clock
        ).issueInTransaction({
          authorizationId: options.authorizationId,
          packageGenerationId: rollbackTarget,
          gatewayPackageGenerationId: canonicalGatewayPackageGenerationId,
          authorizationRole: "rollback_candidate",
          gatewayInstanceId: options.expectedGatewayInstanceId,
          gatewayProcessStartToken: options.writer.kind === "gateway_service_controller"
            ? options.writer.gateway_process_start_token
            : this.readGatewayStartToken(options.expectedGatewayInstanceId),
          expectedLaunchRevision: options.expectedLaunchRevision,
          resetLaunchBudget: true,
          issuer: options.writer.kind === "gateway_service_controller"
            ? {
              kind: "gateway_service_controller",
              gatewayInstanceId: options.writer.gateway_instance_id
            }
            : {
              kind: "supervisor",
              supervisorOwnerId: options.writer.supervisor_owner_id,
              supervisorLeaseEpoch: options.writer.supervisor_lease_epoch
            }
        });
        return {
          projectionRevision: nextRevision,
          resultCode: "package_rollback_prepared",
          result: {
            accepted: true,
            projectionRevision: nextRevision,
            pendingPackageGenerationId: rollbackTarget
          }
        };
      }
    });
  }

  private authorizationProvider(options: {
    operation: GatewayPackageAuthorityOperation;
    writer: ActivationWriter;
    activationRevision: number;
    authorizationRevision: number;
    authorizationStateRevision: number;
    observedAt: string;
    expiresAt: string;
    targetGenerationId: string;
    role: LaunchAuthorizationRole;
  }): S6PackageAuthorizationMutationProvider {
    const supervisor = options.writer.kind === "supervisor"
      ? readSupervisorLeaseByHome(this.db, this.homeId)
      : undefined;
    return {
      getAuthorizationMutationEvidenceInTransaction: (input) => ({
        available: true,
        fresh: true,
        authority_contract_version: "s6-package-authorization-mutation-v1",
        operation_kind: options.writer.kind === "gateway_service_controller"
          ? "gateway_whitelist_operation"
          : "supervisor_activation_transition",
        operation_name: options.operation,
        home_id: input.homeId,
        authorized_package_generation_id: options.targetGenerationId,
        authorization_role: options.role,
        activation_revision: options.activationRevision,
        expected_authorization_revision: options.authorizationRevision,
        expected_authorization_state_revision:
          options.authorizationStateRevision,
        writer_gateway_instance_id:
          options.writer.kind === "gateway_service_controller"
            ? options.writer.gateway_instance_id
            : null,
        writer_supervisor_owner_id:
          options.writer.kind === "supervisor"
            ? options.writer.supervisor_owner_id
            : null,
        writer_supervisor_lease_epoch:
          options.writer.kind === "supervisor"
            ? options.writer.supervisor_lease_epoch
            : null,
        writer_supervisor_lease_state_revision:
          options.writer.kind === "supervisor"
            ? supervisor?.lease_state_revision ?? null
            : null,
        observed_at: options.observedAt,
        expires_at: options.expiresAt
      })
    };
  }

  private readGatewayStartToken(gatewayInstanceId: string): string {
    const row = this.db.prepare(
      `SELECT gateway_process_start_token
       FROM gateway_heartbeats
       WHERE home_id = ? AND gateway_instance_id = ?
       LIMIT 1`
    ).get(this.homeId, gatewayInstanceId) as {
      gateway_process_start_token: string;
    } | undefined;
    if (!row) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_WRITER_INVALID",
        "Current gateway process identity is unavailable for package authorization."
      );
    }
    return row.gateway_process_start_token;
  }
}
