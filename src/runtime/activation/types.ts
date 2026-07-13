import type {
  RuntimeConfigurationCapability
} from "../configuration/constants.js";
import type {
  LaunchAuthorizationRole,
  LaunchAuthorizationState,
  WorkerMode
} from "../process/constants.js";
import type {
  RuntimePackageGenerationIdentity
} from "../identity/types.js";
import type {
  ActivationHandshakePurpose,
  ActivationHandshakeState,
  BlockedBoundary,
  BlockedFromState,
  GatewayPackageAuthorityOperation,
  OpenClawNativeOperation,
  PackageActivationState,
  PackageAuthorityWriterKind,
  PackageTransitionKind
} from "./constants.js";

export type PackageActivationAuthorityRow = {
  home_id: string;
  activation_revision: number;
  active_package_generation_id: string | null;
  pending_package_generation_id: string | null;
  previous_package_generation_id: string | null;
  pending_transition_kind: PackageTransitionKind;
  activation_deadline_at: string | null;
  preactivation_handshake_id: string | null;
  production_activation_handshake_id: string | null;
  launch_authorization_id: string | null;
  launch_authorized_generation_id: string | null;
  launch_authorization_role: LaunchAuthorizationRole | "none";
  launch_authorization_state: LaunchAuthorizationState | "none";
  launch_authorization_revision: number;
  launch_authorization_state_revision: number;
  launch_authorization_issued_at: string | null;
  launch_authorization_expires_at: string | null;
  launch_authorization_consumed_by_attempt_id: string | null;
  launch_authorization_consumed_at: string | null;
  activation_state: PackageActivationState;
  blocked_boundary: BlockedBoundary;
  blocked_from_state: BlockedFromState;
  updated_by_kind: PackageAuthorityWriterKind | null;
  updated_by_gateway_instance_id: string | null;
  updated_by_supervisor_owner_id: string | null;
  updated_by_supervisor_lease_epoch: number | null;
  updated_at: string;
  last_failure_code: string | null;
};

export type ActivationHandshakeRow = {
  activation_record_schema_version: string;
  activation_id: string;
  state_revision: number;
  handshake_purpose: ActivationHandshakePurpose;
  nonce_digest: string;
  home_id: string;
  gateway_instance_id: string;
  plugin_package_generation_id: string;
  current_activation_revision: number;
  launch_activation_revision_at_consumption: number;
  active_package_generation_id: string | null;
  pending_package_generation_id: string | null;
  launch_authorization_id: string;
  launch_authorization_revision: number;
  launch_authorization_state_revision_at_consumption: number;
  launch_authorization_role: LaunchAuthorizationRole;
  supervisor_launch_attempt_id: string;
  configuration_generation_id: string;
  effective_route_set_id: string;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  worker_owner_id: string;
  worker_fencing_token: number;
  worker_mode: WorkerMode;
  schema_version: string;
  requested_at: string;
  supervisor_acknowledged_at: string | null;
  worker_acknowledged_at: string | null;
  acknowledged_at: string | null;
  expires_at: string;
  status: ActivationHandshakeState;
  failure_code: string | null;
  last_writer_kind: "plugin" | "supervisor";
  last_writer_owner_id: string;
  last_writer_supervisor_lease_epoch: number | null;
};

export type ControlRequestIdempotencyRow = {
  home_id: string;
  control_request_id: string;
  request_digest: string;
  requested_operation: OpenClawNativeOperation | GatewayPackageAuthorityOperation;
  expected_projection_revision: number;
  expected_supervisor_lease_epoch: number | null;
  expected_gateway_instance_id: string;
  request_state: "completed" | "rejected";
  result_projection_revision: number;
  result_code: string;
  result_digest: string;
  created_at: string;
  completed_at: string;
  expires_at: string;
};

export type VerifiedPackageClosureEvidence = {
  verified: true;
  package_identity: RuntimePackageGenerationIdentity;
  closure_manifest_digest: string;
  evidence_class:
    | "source_repo"
    | "local_pack"
    | "published_npm"
    | "published_clawhub";
  verified_at: string;
};

export type GatewayActivationWriter = {
  kind: "gateway_service_controller";
  gateway_instance_id: string;
  gateway_process_start_token: string;
  plugin_package_generation_id: string;
};

export type SupervisorActivationWriter = {
  kind: "supervisor";
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  supervisor_lease_state_revision: number;
};

export type ActivationWriter = GatewayActivationWriter | SupervisorActivationWriter;

export type ActivationWorkerAcknowledgement = {
  activation_id: string;
  nonce_digest: string;
  home_id: string;
  worker_owner_id: string;
  worker_fencing_token: number;
  worker_mode: WorkerMode;
  schema_version: string;
  configuration_generation_id: string;
  effective_route_set_id: string;
  package_generation_id: string;
  current_activation_revision: number;
  launch_activation_revision_at_consumption: number;
  launch_authorization_id: string;
  launch_authorization_revision: number;
  launch_authorization_state_revision_at_consumption: number;
  launch_authorization_role: LaunchAuthorizationRole;
  supervisor_launch_attempt_id: string;
};

export type RuntimeCapabilityRouteAuthorityEvidence = {
  available: true;
  fresh: true;
  authority_contract_version: "s6-capability-route-authority-v1";
  home_id: string;
  configuration_generation_id: string;
  package_generation_id: string;
  effective_route_set_id: string;
  effective_route_revision: number;
  capability: RuntimeConfigurationCapability;
  route_fingerprint: string;
  validation_current: true;
  observed_at: string;
  expires_at: string;
};

export type RuntimeCapabilityRouteAuthorityProvider = {
  getCapabilityRouteAuthorityInTransaction(input: {
    db: import("node:sqlite").DatabaseSync;
    homeId: string;
    configurationGenerationId: string;
    packageGenerationId: string;
    effectiveRouteSetId: string;
    capability: RuntimeConfigurationCapability;
    observedAt: string;
  }): RuntimeCapabilityRouteAuthorityEvidence | {
    available: false;
    fresh: false;
    authority_contract_version: "s6-capability-route-authority-v1";
    reason: "route_authority_unavailable" | "route_authority_not_current";
  };
};

export type CanonicalProductionActivationEvidence = {
  available: true;
  fresh: true;
  authority_contract_version: "s6-production-write-authority-v1";
  home_id: string;
  gateway_instance_id: string;
  package_generation_id: string;
  activation_revision: number;
  production_activation_handshake_id: string;
  launch_activation_revision_at_consumption: number;
  launch_authorization_id: string;
  launch_authorization_revision: number;
  launch_authorization_state_revision_at_consumption: number;
  launch_authorization_role: LaunchAuthorizationRole;
  supervisor_launch_attempt_id: string;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  supervisor_lease_state_revision: number;
  worker_owner_id: string;
  worker_fencing_token: number;
  worker_lease_state: "active" | "draining";
  worker_shutdown_requested_at: string | null;
  worker_drain_deadline_at: string | null;
  schema_version: string;
  configuration_generation_id: string;
  effective_route_set_id: string;
  observed_at: string;
  expires_at: string;
};
