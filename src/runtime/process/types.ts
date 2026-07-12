import type { DatabaseSync } from "node:sqlite";
import type {
  ActivationOnlyWorkerOperation,
  LaunchAttemptState,
  LaunchAuthorizationRole,
  LaunchAuthorizationState,
  ProductionSemanticWorkerOperation,
  SupervisorLeaseState,
  SupervisorLeaseTerminalReason,
  WorkerLeaseState,
  WorkerMode
} from "./constants.js";

export type RuntimeProcessAuthorityClock = {
  captureObservedNowInTransaction(db: DatabaseSync): string;
};

export type GatewayHeartbeatRow = {
  home_id: string;
  gateway_instance_id: string;
  gateway_process_id: number;
  gateway_process_start_token: string;
  package_generation_id: string;
  heartbeat_at: string;
  expires_at: string;
};

export type PackageLaunchAuthorizationRow = {
  home_id: string;
  launch_authorization_id: string;
  authorization_revision: number;
  authorization_state_revision: number;
  authorization_state: LaunchAuthorizationState;
  authorized_package_generation_id: string;
  authorization_role: LaunchAuthorizationRole;
  launch_activation_revision_at_issuance: number;
  expected_active_package_generation_id: string | null;
  expected_pending_package_generation_id: string | null;
  issued_by_kind: "gateway_service_controller" | "supervisor";
  issued_by_gateway_instance_id: string | null;
  issued_by_supervisor_owner_id: string | null;
  issued_by_supervisor_lease_epoch: number | null;
  issued_at: string;
  expires_at: string;
  consumed_by_launch_attempt_id: string | null;
  consumed_at: string | null;
  terminal_at: string | null;
  terminal_code: string | null;
};

export type SupervisorLaunchAttemptRow = {
  home_id: string;
  launch_attempt_id: string;
  attempt_state_revision: number;
  attempt_state: LaunchAttemptState;
  launch_authorization_id: string;
  launch_authorization_revision: number;
  launch_authorization_state_revision_at_consumption: number;
  launch_authorization_role: LaunchAuthorizationRole;
  package_generation_id: string;
  launch_activation_revision_at_consumption: number;
  expected_active_package_generation_id: string | null;
  expected_pending_package_generation_id: string | null;
  launch_owner_gateway_instance_id: string;
  launch_owner_process_start_token: string;
  child_process_id: number | null;
  child_process_start_token: string | null;
  supervisor_owner_id: string | null;
  supervisor_lease_epoch: number | null;
  reserved_at: string;
  attempt_expires_at: string;
  lease_acquired_at: string | null;
  terminal_at: string | null;
  terminal_code: string | null;
};

export type SupervisorLaunchStateRow = {
  home_id: string;
  launch_revision: number;
  gateway_instance_id: string | null;
  package_generation_id: string | null;
  launch_authorization_id: string | null;
  launch_authorized_generation_id: string | null;
  launch_authorization_role: LaunchAuthorizationRole | null;
  launch_authorization_revision: number;
  launch_authorization_state_revision: number;
  expected_current_activation_revision: number;
  expected_active_package_generation_id: string | null;
  expected_pending_package_generation_id: string | null;
  current_launch_attempt_id: string | null;
  launch_owner_gateway_instance_id: string | null;
  launch_owner_process_start_token: string | null;
  restart_window_started_at: string | null;
  launch_count_in_window: number;
  last_supervisor_owner_id: string | null;
  last_process_exit_code: number | null;
  last_process_exit_at: string | null;
  next_launch_at: string | null;
  launch_started_at: string | null;
  launch_expires_at: string | null;
  launch_state: "idle" | "launching" | "running" | "backoff" | "blocked" | "stopping";
  last_failure_code: string | null;
};

export type SupervisorLeaseRow = {
  supervisor_lease_key: string;
  home_id: string;
  owner_id: string;
  owner_process_id: number;
  owner_process_start_token: string;
  gateway_instance_id: string;
  launch_attempt_id: string;
  launch_authorization_id: string;
  launch_authorization_revision: number;
  launch_authorization_state_revision_at_consumption: number;
  launch_authorization_role: LaunchAuthorizationRole;
  launch_activation_revision_at_consumption: number;
  package_generation_id: string;
  artifact_integrity: string;
  supervisor_protocol_version: string;
  lease_state_revision: number;
  lease_epoch: number;
  state: SupervisorLeaseState;
  launch_attempt_state_revision_at_acquisition: number;
  worker_restart_window_started_at: string | null;
  worker_restart_count_in_window: number;
  started_at: string;
  heartbeat_at: string;
  expires_at: string;
  shutdown_requested_at: string | null;
  lease_terminal_at: string | null;
  lease_terminal_reason: SupervisorLeaseTerminalReason | null;
  last_failure_code: string | null;
};

export type WorkerLeaseRow = {
  worker_lease_key: string;
  home_id: string;
  owner_id: string;
  owner_process_id: number;
  owner_process_start_token: string;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  package_generation_id: string;
  artifact_integrity: string;
  worker_protocol_version: string;
  schema_version: string;
  fencing_token: number;
  worker_mode: WorkerMode;
  state: WorkerLeaseState;
  started_at: string;
  heartbeat_at: string;
  expires_at: string;
  shutdown_requested_at: string | null;
  drain_deadline_at: string | null;
  last_failure_code: string | null;
};

export type FreshSupervisorAuthority = {
  available: true;
  fresh: true;
  authority_contract_version: "runtime-supervisor-authority-v1";
  authority_source: "s3_objective_database_predicate";
  home_id: string;
  supervisor_owner_id: string;
  supervisor_owner_process_id: number;
  supervisor_owner_process_start_token: string;
  supervisor_lease_epoch: number;
  supervisor_lease_state_revision: number;
  launch_attempt_id: string;
  launch_attempt_state_revision: number;
  package_generation_id: string;
  artifact_integrity: string;
  observed_at: string;
  expires_at: string;
};

export type NoFreshSupervisorAuthority = {
  available: false;
  fresh: false;
  authority_contract_version: "runtime-supervisor-authority-v1";
  reason:
    | "supervisor_not_current"
    | "supervisor_authority_expired"
    | "supervisor_authority_inconsistent";
  observed_at: string;
};

export type SupervisorAuthorityEvidence =
  | FreshSupervisorAuthority
  | NoFreshSupervisorAuthority;

export type ExpectedSupervisorAuthority = {
  owner_id: string;
  owner_process_id: number;
  owner_process_start_token: string;
  lease_epoch: number;
  lease_state_revision: number;
};

export type ExpectedWorkerAuthority = {
  owner_id: string;
  owner_process_id: number;
  owner_process_start_token: string;
  fencing_token: number;
};

export type S6PackageAuthorizationMutationEvidence = {
  available: true;
  fresh: true;
  authority_contract_version: "s6-package-authorization-mutation-v1";
  operation_kind:
    | "gateway_whitelist_operation"
    | "supervisor_activation_transition";
  operation_name: string;
  home_id: string;
  authorized_package_generation_id: string;
  authorization_role: LaunchAuthorizationRole;
  activation_revision: number;
  expected_authorization_revision: number;
  expected_authorization_state_revision: number;
  writer_gateway_instance_id: string | null;
  writer_supervisor_owner_id: string | null;
  writer_supervisor_lease_epoch: number | null;
  writer_supervisor_lease_state_revision: number | null;
  observed_at: string;
  expires_at: string;
};

export interface S6PackageAuthorizationMutationProvider {
  getAuthorizationMutationEvidenceInTransaction(input: {
    db: DatabaseSync;
    homeId: string;
    packageGenerationId: string;
    authorizationRole: LaunchAuthorizationRole;
  }): S6PackageAuthorizationMutationEvidence | {
    available: false;
    fresh: false;
    authority_contract_version: "s6-package-authorization-mutation-v1";
    reason: "s6_not_connected" | "package_authority_not_current";
  };
}

export type S6WorkerAcquisitionAuthorityEvidence = {
  available: true;
  fresh: true;
  authority_contract_version: "s6-worker-acquisition-authority-v1";
  home_id: string;
  package_generation_id: string;
  artifact_integrity: string;
  schema_version: string;
  worker_mode: WorkerMode;
  transition_role: LaunchAuthorizationRole;
  activation_revision: number;
  activation_state:
    | "uninitialized"
    | "preparing"
    | "draining_old"
    | "migrating"
    | "preactivation_verifying"
    | "production_activating"
    | "active"
    | "blocked";
  pending_transition_kind: "none" | "initial" | "upgrade" | "rollback";
  expected_active_package_generation_id: string | null;
  expected_pending_package_generation_id: string | null;
  activation_deadline_at: string | null;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  observed_at: string;
  expires_at: string;
};

export interface S6WorkerAcquisitionAuthorityProvider {
  getWorkerAcquisitionAuthorityInTransaction(input: {
    db: DatabaseSync;
    homeId: string;
    packageGenerationId: string;
    workerMode: WorkerMode;
    supervisorOwnerId: string;
    supervisorLeaseEpoch: number;
  }): S6WorkerAcquisitionAuthorityEvidence | {
    available: false;
    fresh: false;
    authority_contract_version: "s6-worker-acquisition-authority-v1";
    reason: "s6_not_connected" | "worker_acquisition_not_current";
  };
}

export type S6ProductionWriteAuthorityEvidence = {
  available: true;
  fresh: true;
  authority_contract_version: "s6-production-write-authority-v1";
  home_id: string;
  worker_owner_id: string;
  worker_fencing_token: number;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  package_generation_id: string;
  schema_version: string;
  operation: ProductionSemanticWorkerOperation;
  observed_at: string;
  expires_at: string;
};

export interface S6ProductionWriteAuthorityProvider {
  getProductionWriteAuthorityInTransaction(input: {
    db: DatabaseSync;
    homeId: string;
    workerOwnerId: string;
    workerFencingToken: number;
    operation: ProductionSemanticWorkerOperation;
  }): S6ProductionWriteAuthorityEvidence | {
    available: false;
    fresh: false;
    authority_contract_version: "s6-production-write-authority-v1";
    reason: "s6_not_connected" | "production_activation_not_current";
  };
}

export type WorkerOperation =
  | ActivationOnlyWorkerOperation
  | ProductionSemanticWorkerOperation;

export type ProcessIdentity = {
  owner_id: string;
  process_id: number;
  process_start_token: string;
  package_generation_id: string;
};

export type ForceTerminationIdentity = ProcessIdentity & {
  supervisor_lease_epoch: number;
  worker_fencing_token: number;
};

export type ProcessExitEvidence = {
  exited: true;
  owner_id: string;
  process_id: number;
  process_start_token: string;
  observed_at: string;
  exit_code: number | null;
};
