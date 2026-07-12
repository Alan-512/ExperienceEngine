import type { DatabaseSync } from "node:sqlite";
import type {
  BenchmarkAssurance,
  ProfileEntryStatus,
  RuntimeConfigurationCapability
} from "../configuration/constants.js";
import type {
  LearningCandidateState,
  LearningFailureClass,
  LearningFailureCode,
  LearningFailureScope,
  LearningJobState,
  LearningQueueMaintenanceOperation,
  LearningQueueProtectedOperation
} from "./constants.js";

export type LearningQueueAuthorityBinding = {
  home_id: string;
  worker_owner_id: string;
  worker_fencing_token: number;
  worker_mode: "production";
  worker_lease_state: "active" | "draining";
  worker_shutdown_requested_at: string | null;
  worker_drain_deadline_at: string | null;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  package_generation_id: string;
  package_generation_role: "active";
  activation_revision: number;
  production_activation_handshake_id: string;
  configuration_generation_id: string;
  effective_route_set_id: string;
  effective_route_revision: number;
  capability: RuntimeConfigurationCapability;
  route_fingerprint: string;
  schema_version: string;
  job_schema_version: string;
  candidate_schema_version: string;
  node_schema_version: string;
};

export type ProductionWriteAuthorityEvidence = LearningQueueAuthorityBinding & {
  available: true;
  authorized: true;
  fresh: true;
  authority_contract_version: "s6-production-write-authority-v1";
  operation: LearningQueueProtectedOperation;
  observed_at: string;
  expires_at: string;
};

export type UnavailableProductionWriteAuthorityEvidence = {
  available: false;
  authorized: false;
  fresh: false;
  authority_contract_version: "s6-production-write-authority-v1";
  operation: LearningQueueProtectedOperation;
  reason:
    | "authority_provider_unavailable"
    | "production_activation_not_current"
    | "operation_not_authorized";
};

export type ProductionWriteAuthorityProvider = {
  getProductionWriteAuthorityInTransaction(input: {
    db: DatabaseSync;
    operation: LearningQueueProtectedOperation;
    homeId: string;
    jobId?: string;
    claimId?: string;
  }): ProductionWriteAuthorityEvidence |
    UnavailableProductionWriteAuthorityEvidence;
};

export type LearningQueueMaintenanceAuthorityEvidence = {
  available: true;
  fresh: true;
  authority_contract_version: "s6-learning-queue-maintenance-authority-v1";
  operation: LearningQueueMaintenanceOperation;
  home_id: string;
  owner_kind: "gateway" | "supervisor" | "operator";
  owner_id: string;
  supervisor_lease_epoch: number | null;
  configuration_generation_id: string | null;
  effective_route_set_id: string | null;
  effective_route_revision: number | null;
  capability: RuntimeConfigurationCapability | null;
  route_fingerprint: string | null;
  validation_current: boolean | null;
  observed_at: string;
  expires_at: string;
};

export type UnavailableLearningQueueMaintenanceAuthorityEvidence = {
  available: false;
  fresh: false;
  authority_contract_version: "s6-learning-queue-maintenance-authority-v1";
  operation: LearningQueueMaintenanceOperation;
  reason: "authority_provider_unavailable" | "recovery_authority_not_current";
};

export type LearningQueueMaintenanceAuthorityProvider = {
  getLearningQueueMaintenanceAuthorityInTransaction(input: {
    db: DatabaseSync;
    operation: LearningQueueMaintenanceOperation;
    homeId: string;
    jobId: string;
    claimId?: string;
  }): LearningQueueMaintenanceAuthorityEvidence |
    UnavailableLearningQueueMaintenanceAuthorityEvidence;
};

export type FencedLearningJob = {
  id: string;
  candidate_id: string;
  home_id: string;
  status: LearningJobState;
  state_revision: number;
  extractor_profile: string;
  distillation_source: string | null;
  claim_id: string | null;
  claim_owner_id: string | null;
  claim_fencing_token: number | null;
  claimed_supervisor_owner_id: string | null;
  claimed_supervisor_lease_epoch: number | null;
  claimed_package_generation_id: string | null;
  claimed_activation_revision: number | null;
  claimed_production_activation_handshake_id: string | null;
  claimed_configuration_generation_id: string | null;
  claimed_effective_route_set_id: string | null;
  claimed_effective_route_revision: number | null;
  claimed_capability: RuntimeConfigurationCapability | null;
  claimed_route_fingerprint: string | null;
  claimed_schema_version: string | null;
  claimed_job_schema_version: string | null;
  claimed_candidate_schema_version: string | null;
  claimed_node_schema_version: string | null;
  claimed_at: string | null;
  claim_heartbeat_at: string | null;
  claim_expires_at: string | null;
  failure_code: LearningFailureCode | null;
  failure_class: LearningFailureClass | null;
  failure_scope: LearningFailureScope | null;
  system_attempt_count: number;
  interruption_count: number;
  content_retry_count: number;
  next_attempt_at: string;
  blocked_at: string | null;
  route_fingerprint: string;
  terminal_reason_code: LearningFailureCode | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  discarded_at: string | null;
};

export type FencedLearningCandidateState = {
  id: string;
  lifecycle_state: LearningCandidateState;
  state_revision: number;
  content_retry_count: number;
  failure_code: LearningFailureCode | null;
  failure_class: LearningFailureClass | null;
  failure_scope: LearningFailureScope | null;
  blocked_at: string | null;
  terminal_reason_code: LearningFailureCode | null;
  semantic_origin_provenance_key: string | null;
  updated_at: string;
};

export type SemanticOriginStageRoute = {
  route_fingerprint: string;
  validation_record_id: string;
  benchmark_assurance: BenchmarkAssurance;
  contract_version: string;
};

export type SemanticOriginMergeRoute = SemanticOriginStageRoute & {
  route_kind: "deterministic" | "model";
};

export type SemanticOriginReference = {
  provenance_schema_version: "semantic-origin-provenance-v1";
  provenance_key: string;
  configuration_generation_id: string;
  package_generation_id: string;
  generation_profile_id: string;
  generation_profile_version: string;
  generation_profile_status: ProfileEntryStatus;
  quality_profile: "evaluated_recommended" | "custom";
  stage_routes: {
    learning_gate: SemanticOriginStageRoute;
    distillation: SemanticOriginStageRoute;
    merge_decision: SemanticOriginMergeRoute;
  };
  assurance_floor: BenchmarkAssurance;
  origin_record_count: number;
  first_origin_at: string;
  last_origin_at: string;
};

export type SemanticOriginSummary = {
  contains_unbenchmarked_origin: boolean;
  contains_revoked_profile_origin: boolean;
  semantic_origin_count: number;
  exact_provenance_key_count: number;
  compacted_provenance_origin_count: number;
  effective_generation_assurance_floor: BenchmarkAssurance | null;
};

export type ClaimIdentityExpectation = {
  jobId: string;
  claimId: string;
  claimOwnerId: string;
  claimFencingToken: number;
  expectedStateRevision: number;
};

