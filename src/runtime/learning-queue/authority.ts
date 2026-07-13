import type { DatabaseSync } from "node:sqlite";
import {
  LEARNING_QUEUE_MAINTENANCE_AUTHORITY_CONTRACT_VERSION,
  PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
  PROTECTED_WRITE_OPERATION_MATRIX
} from "./constants.js";
import { LearningQueueError } from "./errors.js";
import type {
  LearningQueueAuthorityBinding,
  LearningQueueMaintenanceAuthorityEvidence,
  LearningQueueMaintenanceAuthorityProvider,
  ProductionWriteAuthorityEvidence,
  ProductionWriteAuthorityProvider
} from "./types.js";

const assertCanonicalIsoTimestamp = (value: string, field: string): number => {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      `${field} must be a canonical ISO timestamp.`
    );
  }
  return epoch;
};

const assertNonEmpty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      `${field} must not be empty.`
    );
  }
};

const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      `${field} must be a positive safe integer.`
    );
  }
};

export const UNAVAILABLE_PRODUCTION_WRITE_AUTHORITY_PROVIDER:
ProductionWriteAuthorityProvider = Object.freeze({
  getProductionWriteAuthorityInTransaction(input) {
    return {
      available: false,
      authorized: false,
      fresh: false,
      authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
      operation: input.operation,
      reason: "authority_provider_unavailable"
    };
  }
});

export const UNAVAILABLE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_PROVIDER:
LearningQueueMaintenanceAuthorityProvider = Object.freeze({
  getLearningQueueMaintenanceAuthorityInTransaction(input) {
    return {
      available: false,
      fresh: false,
      authority_contract_version:
        LEARNING_QUEUE_MAINTENANCE_AUTHORITY_CONTRACT_VERSION,
      operation: input.operation,
      reason: "authority_provider_unavailable"
    };
  }
});

export const requireProductionWriteAuthorityInTransaction = (options: {
  db: DatabaseSync;
  provider: ProductionWriteAuthorityProvider;
  operation: ProductionWriteAuthorityEvidence["operation"];
  homeId: string;
  jobId?: string;
  claimId?: string;
  now: string;
}): ProductionWriteAuthorityEvidence => {
  if (!options.db.isTransaction) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      "Production write authority must be consumed inside the governing transaction."
    );
  }
  const evidence = options.provider.getProductionWriteAuthorityInTransaction({
    db: options.db,
    operation: options.operation,
    homeId: options.homeId,
    jobId: options.jobId,
    claimId: options.claimId,
    observedAt: options.now
  });
  if (!evidence.available || !evidence.authorized || !evidence.fresh) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_UNAVAILABLE",
      `S6 production write authority is unavailable for this queue operation: ${evidence.reason}.`
    );
  }
  if (
    evidence.authority_contract_version !==
      PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION ||
    evidence.operation !== options.operation ||
    evidence.home_id !== options.homeId ||
    evidence.capability !== "distillation" ||
    evidence.worker_mode !== "production" ||
    evidence.package_generation_role !== "active"
  ) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      "Production write authority identity does not match the queue operation."
    );
  }
  for (const [field, value] of Object.entries({
    home_id: evidence.home_id,
    worker_owner_id: evidence.worker_owner_id,
    supervisor_owner_id: evidence.supervisor_owner_id,
    package_generation_id: evidence.package_generation_id,
    production_activation_handshake_id:
      evidence.production_activation_handshake_id,
    configuration_generation_id: evidence.configuration_generation_id,
    effective_route_set_id: evidence.effective_route_set_id,
    route_fingerprint: evidence.route_fingerprint,
    schema_version: evidence.schema_version,
    job_schema_version: evidence.job_schema_version,
    candidate_schema_version: evidence.candidate_schema_version,
    node_schema_version: evidence.node_schema_version
  })) {
    assertNonEmpty(value, field);
  }
  assertPositiveInteger(evidence.worker_fencing_token, "worker_fencing_token");
  assertPositiveInteger(evidence.supervisor_lease_epoch, "supervisor_lease_epoch");
  assertPositiveInteger(evidence.activation_revision, "activation_revision");
  assertPositiveInteger(
    evidence.effective_route_revision,
    "effective_route_revision"
  );
  const observedAt = assertCanonicalIsoTimestamp(evidence.observed_at, "observed_at");
  const expiresAt = assertCanonicalIsoTimestamp(evidence.expires_at, "expires_at");
  const now = assertCanonicalIsoTimestamp(options.now, "now");
  if (expiresAt <= now || observedAt > now) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      "Production write authority is expired or observed in the future."
    );
  }
  const allowedWorkerLeaseStates = PROTECTED_WRITE_OPERATION_MATRIX[
    options.operation
  ] as readonly ("active" | "draining")[];
  if (!allowedWorkerLeaseStates.includes(evidence.worker_lease_state)) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      `Worker lease state ${evidence.worker_lease_state} is not valid for ${options.operation}.`
    );
  }
  if (
    allowedWorkerLeaseStates.length === 1 &&
    evidence.worker_shutdown_requested_at !== null
  ) {
    throw new LearningQueueError(
      "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
      `${options.operation} requires an active worker with no shutdown request.`
    );
  }
  if (evidence.worker_lease_state === "draining") {
    if (!evidence.worker_drain_deadline_at) {
      throw new LearningQueueError(
        "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
        "Draining authority requires a bounded drain deadline."
      );
    }
    const drainDeadline = assertCanonicalIsoTimestamp(
      evidence.worker_drain_deadline_at,
      "worker_drain_deadline_at"
    );
    if (drainDeadline < now) {
      throw new LearningQueueError(
        "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
        "Draining production authority passed its deadline."
      );
    }
  }
  return evidence;
};

export const requireLearningQueueMaintenanceAuthorityInTransaction = (options: {
  db: DatabaseSync;
  provider: LearningQueueMaintenanceAuthorityProvider;
  operation: LearningQueueMaintenanceAuthorityEvidence["operation"];
  homeId: string;
  jobId: string;
  claimId?: string;
  now: string;
}): LearningQueueMaintenanceAuthorityEvidence => {
  if (!options.db.isTransaction) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE",
      "Queue maintenance authority must be consumed inside the governing transaction."
    );
  }
  const evidence = options.provider.getLearningQueueMaintenanceAuthorityInTransaction({
    db: options.db,
    operation: options.operation,
    homeId: options.homeId,
    jobId: options.jobId,
    claimId: options.claimId,
    observedAt: options.now
  });
  if (!evidence.available || !evidence.fresh) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE",
      "Current queue maintenance authority is unavailable."
    );
  }
  if (
    evidence.authority_contract_version !==
      LEARNING_QUEUE_MAINTENANCE_AUTHORITY_CONTRACT_VERSION ||
    evidence.operation !== options.operation ||
    evidence.home_id !== options.homeId ||
    evidence.owner_id.trim().length === 0
  ) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE",
      "Queue maintenance authority identity is invalid."
    );
  }
  const observedAt = assertCanonicalIsoTimestamp(evidence.observed_at, "observed_at");
  const expiresAt = assertCanonicalIsoTimestamp(evidence.expires_at, "expires_at");
  const now = assertCanonicalIsoTimestamp(options.now, "now");
  if (observedAt > now || expiresAt <= now) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE",
      "Queue maintenance authority is expired or observed in the future."
    );
  }
  if (options.operation === "resume_blocked") {
    if (
      !evidence.configuration_generation_id ||
      !evidence.effective_route_set_id ||
      !evidence.route_fingerprint ||
      evidence.capability !== "distillation" ||
      evidence.validation_current !== true ||
      evidence.effective_route_revision === null ||
      !Number.isSafeInteger(evidence.effective_route_revision) ||
      evidence.effective_route_revision < 1
    ) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE",
        "Blocked resume requires a current validated distillation route authority."
      );
    }
  }
  return evidence;
};

export const authorityBindingFromEvidence = (
  evidence: ProductionWriteAuthorityEvidence
): LearningQueueAuthorityBinding => ({
  home_id: evidence.home_id,
  worker_owner_id: evidence.worker_owner_id,
  worker_fencing_token: evidence.worker_fencing_token,
  worker_mode: evidence.worker_mode,
  worker_lease_state: evidence.worker_lease_state,
  worker_shutdown_requested_at: evidence.worker_shutdown_requested_at,
  worker_drain_deadline_at: evidence.worker_drain_deadline_at,
  supervisor_owner_id: evidence.supervisor_owner_id,
  supervisor_lease_epoch: evidence.supervisor_lease_epoch,
  package_generation_id: evidence.package_generation_id,
  package_generation_role: evidence.package_generation_role,
  activation_revision: evidence.activation_revision,
  production_activation_handshake_id:
    evidence.production_activation_handshake_id,
  configuration_generation_id: evidence.configuration_generation_id,
  effective_route_set_id: evidence.effective_route_set_id,
  effective_route_revision: evidence.effective_route_revision,
  capability: evidence.capability,
  route_fingerprint: evidence.route_fingerprint,
  schema_version: evidence.schema_version,
  job_schema_version: evidence.job_schema_version,
  candidate_schema_version: evidence.candidate_schema_version,
  node_schema_version: evidence.node_schema_version
});

