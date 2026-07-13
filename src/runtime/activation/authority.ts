import type { DatabaseSync } from "node:sqlite";
import type {
  RuntimeConfigurationCapability
} from "../configuration/constants.js";
import {
  FENCED_LEARNING_CANDIDATE_SCHEMA_VERSION,
  FENCED_LEARNING_JOB_SCHEMA_VERSION,
  FENCED_LEARNING_NODE_SCHEMA_VERSION,
  PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
  PROTECTED_WRITE_OPERATION_MATRIX
} from "../learning-queue/constants.js";
import type {
  LearningQueueMaintenanceAuthorityProvider,
  ProductionWriteAuthorityProvider as LearningQueueProductionWriteAuthorityProvider
} from "../learning-queue/types.js";
import type {
  ProductionSemanticWorkerOperation
} from "../process/constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import type {
  GatewayHeartbeatRow,
  RuntimeProcessAuthorityClock,
  S6ProductionWriteAuthorityProvider,
  S6WorkerAcquisitionAuthorityProvider,
  SupervisorLeaseRow,
  WorkerLeaseRow
} from "../process/types.js";
import type {
  SupervisorMigrationAuthorityProvider
} from "../schema/types.js";
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
  CanonicalProductionActivationEvidence,
  RuntimeCapabilityRouteAuthorityProvider
} from "./types.js";

const unavailableWorkerAcquisition = () => ({
  available: false as const,
  fresh: false as const,
  authority_contract_version: "s6-worker-acquisition-authority-v1" as const,
  reason: "worker_acquisition_not_current" as const
});

const unavailableProduction = () => ({
  available: false as const,
  fresh: false as const,
  authority_contract_version: "s6-production-write-authority-v1" as const,
  reason: "production_activation_not_current" as const
});

export const UNAVAILABLE_RUNTIME_CAPABILITY_ROUTE_AUTHORITY_PROVIDER:
RuntimeCapabilityRouteAuthorityProvider = Object.freeze({
  getCapabilityRouteAuthorityInTransaction() {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "s6-capability-route-authority-v1",
      reason: "route_authority_unavailable"
    };
  }
});

export const createS6SupervisorMigrationAuthorityProvider = (
  baseProvider: SupervisorMigrationAuthorityProvider
): SupervisorMigrationAuthorityProvider => ({
  getFreshSupervisorAuthorityInTransaction(input) {
    if (!input.db.isTransaction) {
      return {
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: "supervisor_not_current"
      };
    }
    const evidence = baseProvider.getFreshSupervisorAuthorityInTransaction(input);
    if (!evidence.available || !evidence.fresh) {
      return evidence;
    }
    const activation = readPackageActivationAuthority(input.db, input.homeId);
    if (!activation) {
      return {
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: "supervisor_not_current"
      };
    }
    try {
      assertPackageActivationShape(activation);
    } catch {
      return {
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: "supervisor_not_current"
      };
    }
    if (
      activation.activation_state !== "migrating" ||
      activation.pending_package_generation_id !== input.packageGenerationId ||
      activation.activation_deadline_at === null ||
      toProcessAuthorityEpochMs(activation.activation_deadline_at) <=
        toProcessAuthorityEpochMs(evidence.observed_at)
    ) {
      return {
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: "supervisor_not_current"
      };
    }
    return evidence;
  }
});

const readCanonicalFreshGateway = (
  db: DatabaseSync,
  homeId: string,
  observedAt: string
): GatewayHeartbeatRow | undefined => db.prepare(
  `SELECT * FROM gateway_heartbeats
   WHERE home_id = ? AND expires_at > ?
   ORDER BY heartbeat_at DESC, gateway_instance_id DESC
   LIMIT 1`
).get(homeId, observedAt) as GatewayHeartbeatRow | undefined;

const assertTransaction = (db: DatabaseSync): void => {
  if (!db.isTransaction) {
    throw new RuntimeActivationError(
      "EE_PRODUCTION_ACTIVATION_NOT_CURRENT",
      "Production activation authority must be evaluated inside the governing transaction."
    );
  }
};

const historicalLaunchChainMatches = (options: {
  db: DatabaseSync;
  homeId: string;
  handshake: ActivationHandshakeRow;
  supervisor: SupervisorLeaseRow;
}): boolean => {
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
  return Boolean(
    attempt &&
    authorization &&
    options.supervisor.launch_attempt_id === options.handshake.supervisor_launch_attempt_id &&
    options.supervisor.launch_authorization_id === options.handshake.launch_authorization_id &&
    options.supervisor.launch_authorization_revision ===
      options.handshake.launch_authorization_revision &&
    options.supervisor.launch_authorization_state_revision_at_consumption ===
      options.handshake.launch_authorization_state_revision_at_consumption &&
    options.supervisor.launch_authorization_role === options.handshake.launch_authorization_role &&
    options.supervisor.launch_activation_revision_at_consumption ===
      options.handshake.launch_activation_revision_at_consumption &&
    attempt.launch_authorization_id === options.handshake.launch_authorization_id &&
    attempt.launch_authorization_revision === options.handshake.launch_authorization_revision &&
    attempt.launch_authorization_state_revision_at_consumption ===
      options.handshake.launch_authorization_state_revision_at_consumption &&
    attempt.launch_activation_revision_at_consumption ===
      options.handshake.launch_activation_revision_at_consumption &&
    authorization.authorization_revision === options.handshake.launch_authorization_revision &&
    authorization.authorization_state_revision ===
      options.handshake.launch_authorization_state_revision_at_consumption &&
    authorization.authorization_state === "consumed" &&
    authorization.consumed_by_launch_attempt_id ===
      options.handshake.supervisor_launch_attempt_id
  );
};

const workerLeaseStateCurrent = (
  worker: WorkerLeaseRow,
  observedAt: string
): worker is WorkerLeaseRow & { state: "active" | "draining" } => (
  (worker.state === "active" || worker.state === "draining") &&
  toProcessAuthorityEpochMs(worker.expires_at) > toProcessAuthorityEpochMs(observedAt) &&
  (
    worker.state !== "draining" ||
    Boolean(worker.drain_deadline_at) &&
    toProcessAuthorityEpochMs(worker.drain_deadline_at!) >=
      toProcessAuthorityEpochMs(observedAt)
  )
);

export const evaluateCanonicalProductionActivationInTransaction = (options: {
  db: DatabaseSync;
  homeId: string;
  observedAt: string;
  expectedWorkerOwnerId?: string;
  expectedWorkerFencingToken?: number;
}): CanonicalProductionActivationEvidence | ReturnType<typeof unavailableProduction> => {
  assertTransaction(options.db);
  const activation = readPackageActivationAuthority(options.db, options.homeId);
  if (!activation) {
    return unavailableProduction();
  }
  try {
    assertPackageActivationShape(activation);
  } catch {
    return unavailableProduction();
  }
  if (
    activation.activation_state !== "active" ||
    !activation.active_package_generation_id ||
    activation.pending_package_generation_id !== null ||
    !activation.production_activation_handshake_id
  ) {
    return unavailableProduction();
  }
  const handshake = readActivationHandshake(
    options.db,
    options.homeId,
    activation.production_activation_handshake_id
  );
  const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
  const worker = readWorkerLeaseByHome(options.db, options.homeId);
  const pointer = readConfigurationPointer(options.db, options.homeId);
  const migration = readMigrationState(options.db, options.homeId);
  const gateway = readCanonicalFreshGateway(
    options.db,
    options.homeId,
    options.observedAt
  );
  const freshSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
    db: options.db,
    homeId: options.homeId,
    observedAt: options.observedAt
  });
  if (
    !handshake ||
    handshake.handshake_purpose !== "production_activation" ||
    handshake.status !== "complete" ||
    !handshake.acknowledged_at ||
    toProcessAuthorityEpochMs(handshake.acknowledged_at) >=
      toProcessAuthorityEpochMs(handshake.expires_at) ||
    handshake.current_activation_revision !== activation.activation_revision ||
    handshake.active_package_generation_id !== activation.active_package_generation_id ||
    handshake.pending_package_generation_id !== null ||
    handshake.plugin_package_generation_id !== activation.active_package_generation_id ||
    handshake.worker_mode !== "production" ||
    !supervisor ||
    !worker ||
    !pointer ||
    !migration ||
    !gateway ||
    gateway.gateway_instance_id !== handshake.gateway_instance_id ||
    gateway.package_generation_id !== activation.active_package_generation_id ||
    !freshSupervisor.available ||
    !freshSupervisor.fresh ||
    freshSupervisor.supervisor_owner_id !== handshake.supervisor_owner_id ||
    freshSupervisor.supervisor_lease_epoch !== handshake.supervisor_lease_epoch ||
    supervisor.owner_id !== handshake.supervisor_owner_id ||
    supervisor.lease_epoch !== handshake.supervisor_lease_epoch ||
    supervisor.package_generation_id !== activation.active_package_generation_id ||
    worker.supervisor_owner_id !== supervisor.owner_id ||
    worker.supervisor_lease_epoch !== supervisor.lease_epoch ||
    worker.owner_id !== handshake.worker_owner_id ||
    worker.fencing_token !== handshake.worker_fencing_token ||
    worker.worker_mode !== "production" ||
    worker.package_generation_id !== activation.active_package_generation_id ||
    worker.schema_version !== handshake.schema_version ||
    !workerLeaseStateCurrent(worker, options.observedAt) ||
    (options.expectedWorkerOwnerId !== undefined &&
      worker.owner_id !== options.expectedWorkerOwnerId) ||
    (options.expectedWorkerFencingToken !== undefined &&
      worker.fencing_token !== options.expectedWorkerFencingToken) ||
    pointer.generation_id !== handshake.configuration_generation_id ||
    migration.migration_status !== "ready" ||
    migration.current_schema_version !== handshake.schema_version ||
    migration.target_schema_version !== handshake.schema_version ||
    migration.migration_owner_id !== null ||
    !historicalLaunchChainMatches({
      db: options.db,
      homeId: options.homeId,
      handshake,
      supervisor
    })
  ) {
    return unavailableProduction();
  }
  const expiryCandidates = [gateway.expires_at, supervisor.expires_at, worker.expires_at];
  if (worker.state === "draining" && worker.drain_deadline_at) {
    expiryCandidates.push(worker.drain_deadline_at);
  }
  return {
    available: true,
    fresh: true,
    authority_contract_version: "s6-production-write-authority-v1",
    home_id: options.homeId,
    gateway_instance_id: gateway.gateway_instance_id,
    package_generation_id: activation.active_package_generation_id,
    activation_revision: activation.activation_revision,
    production_activation_handshake_id: handshake.activation_id,
    launch_activation_revision_at_consumption:
      handshake.launch_activation_revision_at_consumption,
    launch_authorization_id: handshake.launch_authorization_id,
    launch_authorization_revision: handshake.launch_authorization_revision,
    launch_authorization_state_revision_at_consumption:
      handshake.launch_authorization_state_revision_at_consumption,
    launch_authorization_role: handshake.launch_authorization_role,
    supervisor_launch_attempt_id: handshake.supervisor_launch_attempt_id,
    supervisor_owner_id: supervisor.owner_id,
    supervisor_lease_epoch: supervisor.lease_epoch,
    supervisor_lease_state_revision: supervisor.lease_state_revision,
    worker_owner_id: worker.owner_id,
    worker_fencing_token: worker.fencing_token,
    worker_lease_state: worker.state,
    worker_shutdown_requested_at: worker.shutdown_requested_at,
    worker_drain_deadline_at: worker.drain_deadline_at,
    schema_version: worker.schema_version,
    configuration_generation_id: handshake.configuration_generation_id,
    effective_route_set_id: handshake.effective_route_set_id,
    observed_at: options.observedAt,
    expires_at: new Date(
      Math.min(...expiryCandidates.map(toProcessAuthorityEpochMs))
    ).toISOString()
  };
};

const expectedTransitionRole = (
  transition: "none" | "initial" | "upgrade" | "rollback"
): "initial_candidate" | "active" | "pending" | "rollback_candidate" => {
  switch (transition) {
    case "initial":
      return "initial_candidate";
    case "upgrade":
      return "pending";
    case "rollback":
      return "rollback_candidate";
    case "none":
      return "active";
  }
};

export const createS6WorkerAcquisitionAuthorityProvider = (
  clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
): S6WorkerAcquisitionAuthorityProvider => ({
  getWorkerAcquisitionAuthorityInTransaction(input) {
    if (!input.db.isTransaction) {
      return unavailableWorkerAcquisition();
    }
    const observedAt = clock.captureObservedNowInTransaction(input.db);
    const activation = readPackageActivationAuthority(input.db, input.homeId);
    const supervisor = readSupervisorLeaseByHome(input.db, input.homeId);
    const migration = readMigrationState(input.db, input.homeId);
    const freshSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
      db: input.db,
      homeId: input.homeId,
      observedAt
    });
    if (!activation || !supervisor || !migration) {
      return unavailableWorkerAcquisition();
    }
    try {
      assertPackageActivationShape(activation);
    } catch {
      return unavailableWorkerAcquisition();
    }
    if (
      !freshSupervisor.available ||
      !freshSupervisor.fresh ||
      supervisor.owner_id !== input.supervisorOwnerId ||
      supervisor.lease_epoch !== input.supervisorLeaseEpoch ||
      supervisor.owner_id !== freshSupervisor.supervisor_owner_id ||
      supervisor.lease_epoch !== freshSupervisor.supervisor_lease_epoch ||
      supervisor.package_generation_id !== input.packageGenerationId ||
      migration.migration_status !== "ready" ||
      migration.current_schema_version === null ||
      migration.current_schema_version !== migration.target_schema_version ||
      migration.migration_owner_id !== null
    ) {
      return unavailableWorkerAcquisition();
    }
    const expectedRole = input.workerMode === "production"
      ? supervisor.launch_authorization_role
      : expectedTransitionRole(activation.pending_transition_kind);
    if (
      input.workerMode === "activation_only" && (
        !["migrating", "preactivation_verifying"].includes(activation.activation_state) ||
        activation.pending_package_generation_id !== input.packageGenerationId ||
        supervisor.launch_authorization_role !== expectedRole ||
        !activation.activation_deadline_at ||
        toProcessAuthorityEpochMs(activation.activation_deadline_at) <=
          toProcessAuthorityEpochMs(observedAt)
      )
    ) {
      return unavailableWorkerAcquisition();
    }
    if (
      input.workerMode === "production" && (
        !["production_activating", "active"].includes(activation.activation_state) ||
        activation.active_package_generation_id !== input.packageGenerationId ||
        activation.pending_package_generation_id !== null
      )
    ) {
      return unavailableWorkerAcquisition();
    }
    const expiresAt = activation.activation_deadline_at &&
      activation.activation_state !== "active"
      ? new Date(Math.min(
        toProcessAuthorityEpochMs(supervisor.expires_at),
        toProcessAuthorityEpochMs(activation.activation_deadline_at)
      )).toISOString()
      : supervisor.expires_at;
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-worker-acquisition-authority-v1",
      home_id: input.homeId,
      package_generation_id: input.packageGenerationId,
      artifact_integrity: supervisor.artifact_integrity,
      schema_version: migration.current_schema_version,
      worker_mode: input.workerMode,
      transition_role: expectedRole,
      activation_revision: activation.activation_revision,
      activation_state: activation.activation_state,
      pending_transition_kind: activation.pending_transition_kind,
      expected_active_package_generation_id: activation.active_package_generation_id,
      expected_pending_package_generation_id: activation.pending_package_generation_id,
      activation_deadline_at: activation.activation_deadline_at,
      supervisor_owner_id: supervisor.owner_id,
      supervisor_lease_epoch: supervisor.lease_epoch,
      observed_at: observedAt,
      expires_at: expiresAt
    };
  }
});

export const createS6ProcessProductionWriteAuthorityProvider = (
  clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK,
  routeAuthorityProvider: RuntimeCapabilityRouteAuthorityProvider =
    UNAVAILABLE_RUNTIME_CAPABILITY_ROUTE_AUTHORITY_PROVIDER
): S6ProductionWriteAuthorityProvider => ({
  getProductionWriteAuthorityInTransaction(input) {
    const observedAt = input.db.isTransaction
      ? clock.captureObservedNowInTransaction(input.db)
      : new Date(0).toISOString();
    const evidence = input.db.isTransaction
      ? evaluateCanonicalProductionActivationInTransaction({
        db: input.db,
        homeId: input.homeId,
        observedAt,
        expectedWorkerOwnerId: input.workerOwnerId,
        expectedWorkerFencingToken: input.workerFencingToken
      })
      : unavailableProduction();
    if (!evidence.available || !evidence.fresh) {
      return unavailableProduction();
    }
    if (
      evidence.worker_lease_state === "draining" &&
      input.operation !== "queue_renew" &&
      input.operation !== "queue_complete"
    ) {
      return unavailableProduction();
    }
    const capability = PROCESS_OPERATION_CAPABILITY[input.operation];
    const route = routeAuthorityProvider.getCapabilityRouteAuthorityInTransaction({
      db: input.db,
      homeId: input.homeId,
      configurationGenerationId: evidence.configuration_generation_id,
      packageGenerationId: evidence.package_generation_id,
      effectiveRouteSetId: evidence.effective_route_set_id,
      capability
    });
    if (
      !route.available ||
      !route.fresh ||
      route.home_id !== evidence.home_id ||
      route.configuration_generation_id !== evidence.configuration_generation_id ||
      route.package_generation_id !== evidence.package_generation_id ||
      route.effective_route_set_id !== evidence.effective_route_set_id ||
      route.capability !== capability ||
      route.validation_current !== true ||
      toProcessAuthorityEpochMs(route.observed_at) >
        toProcessAuthorityEpochMs(observedAt) ||
      toProcessAuthorityEpochMs(route.expires_at) <=
        toProcessAuthorityEpochMs(observedAt)
    ) {
      return unavailableProduction();
    }
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-production-write-authority-v1",
      home_id: evidence.home_id,
      worker_owner_id: evidence.worker_owner_id,
      worker_fencing_token: evidence.worker_fencing_token,
      supervisor_owner_id: evidence.supervisor_owner_id,
      supervisor_lease_epoch: evidence.supervisor_lease_epoch,
      package_generation_id: evidence.package_generation_id,
      schema_version: evidence.schema_version,
      operation: input.operation,
      observed_at: evidence.observed_at,
      expires_at: evidence.expires_at
    };
  }
});

export const createS6LearningQueueProductionWriteAuthorityProvider = (options: {
  routeAuthorityProvider?: RuntimeCapabilityRouteAuthorityProvider;
  clock?: RuntimeProcessAuthorityClock;
} = {}): LearningQueueProductionWriteAuthorityProvider => {
  const routeAuthorityProvider = options.routeAuthorityProvider ??
    UNAVAILABLE_RUNTIME_CAPABILITY_ROUTE_AUTHORITY_PROVIDER;
  const clock = options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
  return {
    getProductionWriteAuthorityInTransaction(input) {
      if (!input.db.isTransaction) {
        return {
          available: false,
          authorized: false,
          fresh: false,
          authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
          operation: input.operation,
          reason: "production_activation_not_current"
        };
      }
      const observedAt = clock.captureObservedNowInTransaction(input.db);
      const canonical = evaluateCanonicalProductionActivationInTransaction({
        db: input.db,
        homeId: input.homeId,
        observedAt
      });
      if (!canonical.available || !canonical.fresh) {
        return {
          available: false,
          authorized: false,
          fresh: false,
          authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
          operation: input.operation,
          reason: "production_activation_not_current"
        };
      }
      const capability: RuntimeConfigurationCapability = "distillation";
      const route = routeAuthorityProvider.getCapabilityRouteAuthorityInTransaction({
        db: input.db,
        homeId: input.homeId,
        configurationGenerationId: canonical.configuration_generation_id,
        packageGenerationId: canonical.package_generation_id,
        effectiveRouteSetId: canonical.effective_route_set_id,
        capability
      });
      if (
        !route.available ||
        !route.fresh ||
        route.home_id !== canonical.home_id ||
        route.configuration_generation_id !== canonical.configuration_generation_id ||
        route.package_generation_id !== canonical.package_generation_id ||
        route.effective_route_set_id !== canonical.effective_route_set_id ||
        route.capability !== capability ||
        route.validation_current !== true ||
        toProcessAuthorityEpochMs(route.observed_at) > toProcessAuthorityEpochMs(observedAt) ||
        toProcessAuthorityEpochMs(route.expires_at) <= toProcessAuthorityEpochMs(observedAt)
      ) {
        return {
          available: false,
          authorized: false,
          fresh: false,
          authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
          operation: input.operation,
          reason: "production_activation_not_current"
        };
      }
      const allowedStates = PROTECTED_WRITE_OPERATION_MATRIX[
        input.operation
      ] as readonly ("active" | "draining")[];
      if (!allowedStates.includes(canonical.worker_lease_state)) {
        return {
          available: false,
          authorized: false,
          fresh: false,
          authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
          operation: input.operation,
          reason: "operation_not_authorized"
        };
      }
      return {
        available: true,
        authorized: true,
        fresh: true,
        authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
        operation: input.operation,
        home_id: canonical.home_id,
        worker_owner_id: canonical.worker_owner_id,
        worker_fencing_token: canonical.worker_fencing_token,
        worker_mode: "production",
        worker_lease_state: canonical.worker_lease_state,
        worker_shutdown_requested_at: canonical.worker_shutdown_requested_at,
        worker_drain_deadline_at: canonical.worker_drain_deadline_at,
        supervisor_owner_id: canonical.supervisor_owner_id,
        supervisor_lease_epoch: canonical.supervisor_lease_epoch,
        package_generation_id: canonical.package_generation_id,
        package_generation_role: "active",
        activation_revision: canonical.activation_revision,
        production_activation_handshake_id:
          canonical.production_activation_handshake_id,
        configuration_generation_id: canonical.configuration_generation_id,
        effective_route_set_id: canonical.effective_route_set_id,
        effective_route_revision: route.effective_route_revision,
        capability,
        route_fingerprint: route.route_fingerprint,
        schema_version: canonical.schema_version,
        job_schema_version: FENCED_LEARNING_JOB_SCHEMA_VERSION,
        candidate_schema_version: FENCED_LEARNING_CANDIDATE_SCHEMA_VERSION,
        node_schema_version: FENCED_LEARNING_NODE_SCHEMA_VERSION,
        observed_at: observedAt,
        expires_at: new Date(Math.min(
          toProcessAuthorityEpochMs(canonical.expires_at),
          toProcessAuthorityEpochMs(route.expires_at)
        )).toISOString()
      };
    }
  };
};

export const createS6LearningQueueMaintenanceAuthorityProvider = (options: {
  routeAuthorityProvider?: RuntimeCapabilityRouteAuthorityProvider;
  operatorAuthority?: {
    ownerId: string;
    expiresAt: string;
  };
  clock?: RuntimeProcessAuthorityClock;
} = {}): LearningQueueMaintenanceAuthorityProvider => {
  const routeAuthorityProvider = options.routeAuthorityProvider ??
    UNAVAILABLE_RUNTIME_CAPABILITY_ROUTE_AUTHORITY_PROVIDER;
  const clock = options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
  return {
    getLearningQueueMaintenanceAuthorityInTransaction(input) {
      const unavailable = () => ({
        available: false as const,
        fresh: false as const,
        authority_contract_version:
          "s6-learning-queue-maintenance-authority-v1" as const,
        operation: input.operation,
        reason: "recovery_authority_not_current" as const
      });
      if (!input.db.isTransaction) {
        return unavailable();
      }
      const observedAt = clock.captureObservedNowInTransaction(input.db);
      const job = input.db.prepare(
        `SELECT status, claim_id
         FROM distillation_jobs
         WHERE home_id = ? AND id = ?
         LIMIT 1`
      ).get(input.homeId, input.jobId) as {
        status: string;
        claim_id: string | null;
      } | undefined;
      if (
        !job ||
        (input.claimId !== undefined && job.claim_id !== input.claimId)
      ) {
        return unavailable();
      }
      if (input.operation === "operator_cancel") {
        if (
          !options.operatorAuthority ||
          options.operatorAuthority.ownerId.trim().length === 0 ||
          toProcessAuthorityEpochMs(options.operatorAuthority.expiresAt) <=
            toProcessAuthorityEpochMs(observedAt)
        ) {
          return unavailable();
        }
        return {
          available: true,
          fresh: true,
          authority_contract_version:
            "s6-learning-queue-maintenance-authority-v1",
          operation: input.operation,
          home_id: input.homeId,
          owner_kind: "operator",
          owner_id: options.operatorAuthority.ownerId,
          supervisor_lease_epoch: null,
          configuration_generation_id: null,
          effective_route_set_id: null,
          effective_route_revision: null,
          capability: null,
          route_fingerprint: null,
          validation_current: null,
          observed_at: observedAt,
          expires_at: options.operatorAuthority.expiresAt
        };
      }

      const supervisor = evaluateFreshSupervisorAuthorityInTransaction({
        db: input.db,
        homeId: input.homeId,
        observedAt
      });
      const gateway = readCanonicalFreshGateway(
        input.db,
        input.homeId,
        observedAt
      );
      const owner = supervisor.available && supervisor.fresh
        ? {
          kind: "supervisor" as const,
          id: supervisor.supervisor_owner_id,
          epoch: supervisor.supervisor_lease_epoch,
          expiresAt: supervisor.expires_at
        }
        : gateway
          ? {
            kind: "gateway" as const,
            id: gateway.gateway_instance_id,
            epoch: null,
            expiresAt: gateway.expires_at
          }
          : null;
      if (!owner) {
        return unavailable();
      }
      if (input.operation === "recover_authority_loss") {
        if (job.status !== "processing" || !job.claim_id) {
          return unavailable();
        }
        return {
          available: true,
          fresh: true,
          authority_contract_version:
            "s6-learning-queue-maintenance-authority-v1",
          operation: input.operation,
          home_id: input.homeId,
          owner_kind: owner.kind,
          owner_id: owner.id,
          supervisor_lease_epoch: owner.epoch,
          configuration_generation_id: null,
          effective_route_set_id: null,
          effective_route_revision: null,
          capability: null,
          route_fingerprint: null,
          validation_current: null,
          observed_at: observedAt,
          expires_at: owner.expiresAt
        };
      }

      const activation = readPackageActivationAuthority(input.db, input.homeId);
      const pointer = readConfigurationPointer(input.db, input.homeId);
      const handshake = activation?.production_activation_handshake_id
        ? readActivationHandshake(
          input.db,
          input.homeId,
          activation.production_activation_handshake_id
        )
        : undefined;
      if (
        input.operation !== "resume_blocked" ||
        job.status !== "blocked" ||
        !activation ||
        !activation.active_package_generation_id ||
        !pointer ||
        !pointer.generation_id ||
        !handshake ||
        handshake.effective_route_set_id.trim().length === 0
      ) {
        return unavailable();
      }
      const route = routeAuthorityProvider.getCapabilityRouteAuthorityInTransaction({
        db: input.db,
        homeId: input.homeId,
        configurationGenerationId: pointer.generation_id,
        packageGenerationId: activation.active_package_generation_id,
        effectiveRouteSetId: handshake.effective_route_set_id,
        capability: "distillation"
      });
      if (
        !route.available ||
        !route.fresh ||
        route.validation_current !== true ||
        route.home_id !== input.homeId ||
        route.configuration_generation_id !== pointer.generation_id ||
        route.package_generation_id !== activation.active_package_generation_id ||
        route.effective_route_set_id !== handshake.effective_route_set_id ||
        route.capability !== "distillation" ||
        toProcessAuthorityEpochMs(route.observed_at) >
          toProcessAuthorityEpochMs(observedAt) ||
        toProcessAuthorityEpochMs(route.expires_at) <=
          toProcessAuthorityEpochMs(observedAt)
      ) {
        return unavailable();
      }
      return {
        available: true,
        fresh: true,
        authority_contract_version:
          "s6-learning-queue-maintenance-authority-v1",
        operation: input.operation,
        home_id: input.homeId,
        owner_kind: owner.kind,
        owner_id: owner.id,
        supervisor_lease_epoch: owner.epoch,
        configuration_generation_id: route.configuration_generation_id,
        effective_route_set_id: route.effective_route_set_id,
        effective_route_revision: route.effective_route_revision,
        capability: route.capability,
        route_fingerprint: route.route_fingerprint,
        validation_current: route.validation_current,
        observed_at: observedAt,
        expires_at: new Date(Math.min(
          toProcessAuthorityEpochMs(owner.expiresAt),
          toProcessAuthorityEpochMs(route.expires_at)
        )).toISOString()
      };
    }
  };
};

export const PROCESS_TO_QUEUE_OPERATION = Object.freeze({
  queue_claim: "new_claim",
  queue_renew: "claim_renewal",
  queue_complete: "semantic_completion",
  queue_block: "worker_block",
  queue_failure: "worker_failure",
  queue_discard: "worker_discard"
} satisfies Partial<Record<ProductionSemanticWorkerOperation, string>>);

export const PROCESS_OPERATION_CAPABILITY = Object.freeze({
  queue_claim: "distillation",
  queue_renew: "distillation",
  queue_complete: "distillation",
  queue_block: "distillation",
  queue_failure: "distillation",
  queue_discard: "distillation",
  candidate_write: "distillation",
  node_write: "distillation",
  embedding_write: "embedding",
  attribution_write: "learning_gate",
  governance_write: "learning_gate",
  route_projection_write: "learning_gate",
  hybrid_postmortem_write: "hybrid_postmortem"
} satisfies Record<ProductionSemanticWorkerOperation, RuntimeConfigurationCapability>);
