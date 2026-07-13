import type { RuntimeClosureManifest } from "../identity/types.js";
import type {
  ActualDownloadedArtifactValidationStep,
  ArtifactValidationStepStatus,
  DocumentationEvidenceTier,
  PublishedDistributionChannel,
  PublishedRuntimeEvidenceClass,
  WindowsOpenClawExecutableExtension,
  WindowsOpenClawResolutionSource,
  WindowsOpenClawVersionProbeStatus
} from "./constants.js";

export type RuntimeDistributionAttestation = {
  distribution_manifest_version: string;
  package_name: string;
  package_version: string;
  published_channel: PublishedDistributionChannel;
  artifact_integrity: string;
  artifact_size: number;
  closure_manifest_digest: string;
  profile_registry_digest: string;
  dependency_closure_digest: string;
  compatibility_metadata_digest: string;
  registry_record_identity: string;
  created_at: string;
};

export type ArtifactValidationStepRecord = {
  step_id: ActualDownloadedArtifactValidationStep;
  step_order: number;
  status: ArtifactValidationStepStatus;
  evidence_digest: string | null;
  failure_code: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type WindowsOpenClawResolutionRecord = {
  resolution_source: WindowsOpenClawResolutionSource;
  resolved_executable_path_fingerprint: string | null;
  resolved_extension: WindowsOpenClawExecutableExtension | null;
  version_probe_status: WindowsOpenClawVersionProbeStatus;
  version_probe_output_digest: string | null;
};

export type PublishedLiveActivationBinding = {
  home_id: string;
  gateway_instance_id: string;
  active_package_generation_id: string;
  package_activation_revision: number;
  production_activation_id: string;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  worker_owner_id: string;
  worker_fencing_token: number;
  worker_mode: "production";
  schema_version: string;
  configuration_generation_id: string;
  effective_route_set_id: string;
};

export type PublishedProtectedQueueEvidence = {
  fixture_id: string;
  job_id: string;
  candidate_id: string;
  claim_owner_id: string;
  claim_fencing_token: number;
  completion_node_id: string;
  semantic_completion_committed: boolean;
  authority_loss_completion_rejected: boolean;
  interruption_recovery_recorded: boolean;
  content_retry_consumed: boolean;
};

export type PublishedShutdownEvidence = {
  gateway_stop_observed: boolean;
  worker_terminal_state: "stopped";
  supervisor_terminal_state: "stopped";
  supervisor_terminal_reason: string;
  launch_attempt_terminal_code: string;
};

export type PublishedLiveActivationEvidence = {
  evidence_schema_version: string;
  evidence_class: "live_host";
  published_channel: PublishedDistributionChannel;
  package_name: string;
  package_version: string;
  artifact_integrity: string;
  registry_record_identity: string;
  activation: PublishedLiveActivationBinding;
  queue: PublishedProtectedQueueEvidence;
  shutdown: PublishedShutdownEvidence;
  interaction_active: true;
  learning_runtime_active: true;
  production_learning_ready: boolean;
  verified_at: string;
};

export type DocumentationEvidenceEntry = {
  evidence_tier: DocumentationEvidenceTier;
  published_channel: PublishedDistributionChannel | null;
  package_version: string;
  artifact_integrity: string | null;
  validation_report_digest: string | null;
  live_activation_evidence_digest: string | null;
  support_claim_allowed: boolean;
  limitations: string[];
};

export type DocumentationEvidenceMatrix = {
  matrix_schema_version: string;
  package_name: string;
  package_version: string;
  generated_at: string;
  entries: DocumentationEvidenceEntry[];
};

export type PublishedRuntimeValidationReport = {
  report_schema_version: string;
  published_channel: PublishedDistributionChannel;
  package_name: string;
  package_version: string;
  artifact_path_fingerprint: string;
  artifact_integrity: string;
  artifact_size: number;
  registry_record_identity: string;
  distribution_attestation: RuntimeDistributionAttestation;
  validation_steps: ArtifactValidationStepRecord[];
  live_activation_evidence: PublishedLiveActivationEvidence | null;
  support_claim_allowed: boolean;
  failure_codes: string[];
  created_at: string;
};

export type PublishedArtifactClosureObservation = {
  evidence_class: Exclude<PublishedRuntimeEvidenceClass, "live_host">;
  published_channel: PublishedDistributionChannel | null;
  embedded_manifest: RuntimeClosureManifest;
  distribution_attestation: RuntimeDistributionAttestation | null;
};
