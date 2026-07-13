export const PUBLISHED_RUNTIME_CLOSURE_STAGE =
  "published_runtime_closure_s7" as const;

export const DISTRIBUTION_ATTESTATION_VERSION =
  "runtime-distribution-attestation-v1" as const;
export const PUBLISHED_RUNTIME_VALIDATION_REPORT_VERSION =
  "published-runtime-validation-report-v1" as const;
export const LIVE_ACTIVATION_EVIDENCE_VERSION =
  "published-live-activation-evidence-v1" as const;
export const DOCUMENTATION_EVIDENCE_MATRIX_VERSION =
  "documentation-evidence-matrix-v1" as const;

export const PUBLISHED_DISTRIBUTION_CHANNELS = [
  "npm",
  "clawhub"
] as const;
export type PublishedDistributionChannel =
  typeof PUBLISHED_DISTRIBUTION_CHANNELS[number];

export const PUBLISHED_RUNTIME_EVIDENCE_CLASSES = [
  "source_repo",
  "local_pack",
  "published_npm",
  "published_clawhub",
  "live_host"
] as const;
export type PublishedRuntimeEvidenceClass =
  typeof PUBLISHED_RUNTIME_EVIDENCE_CLASSES[number];

export const EMBEDDED_CLOSURE_MANIFEST_FIELDS = [
  "closure_manifest_version",
  "package_name",
  "package_version",
  "package_build_id",
  "required_entrypoints",
  "required_runtime_files",
  "required_schema_and_migrations",
  "profile_registry_digest",
  "dependency_requirements_digest",
  "compatibility_metadata_digest",
  "closure_manifest_digest"
] as const;

export const DISTRIBUTION_ATTESTATION_FIELDS = [
  "distribution_manifest_version",
  "package_name",
  "package_version",
  "published_channel",
  "artifact_integrity",
  "artifact_size",
  "closure_manifest_digest",
  "profile_registry_digest",
  "dependency_closure_digest",
  "compatibility_metadata_digest",
  "registry_record_identity",
  "created_at"
] as const;

export const ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS = [
  "embedded_closure_and_external_attestation_integrity",
  "declared_entrypoints_exist",
  "entrypoint_imports_resolve_in_clean_environment",
  "runtime_dependencies_schema_and_migrations_present",
  "package_local_supervisor_and_worker_spawn",
  "profile_registry_and_compatibility_digests_match",
  "artifact_digest_matches_registry_record",
  "bounded_live_host_smoke"
] as const;
export type ActualDownloadedArtifactValidationStep =
  typeof ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS[number];

export const ARTIFACT_VALIDATION_STEP_STATUSES = [
  "pending",
  "passed",
  "failed",
  "blocked",
  "infrastructure_failed"
] as const;
export type ArtifactValidationStepStatus =
  typeof ARTIFACT_VALIDATION_STEP_STATUSES[number];

export const ARTIFACT_VALIDATION_STEP_RECORD_FIELDS = [
  "step_id",
  "step_order",
  "status",
  "evidence_digest",
  "failure_code",
  "started_at",
  "completed_at"
] as const;

export const WINDOWS_OPENCLAW_RESOLUTION_SOURCES = [
  "operator_configured_path",
  "host_provided_path",
  "path_lookup"
] as const;
export type WindowsOpenClawResolutionSource =
  typeof WINDOWS_OPENCLAW_RESOLUTION_SOURCES[number];

export const WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS = [
  ".exe",
  ".cmd",
  ".bat"
] as const;
export type WindowsOpenClawExecutableExtension =
  typeof WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS[number];

export const WINDOWS_OPENCLAW_VERSION_PROBE_STATUSES = [
  "not_run",
  "passed",
  "failed",
  "timed_out"
] as const;
export type WindowsOpenClawVersionProbeStatus =
  typeof WINDOWS_OPENCLAW_VERSION_PROBE_STATUSES[number];

export const WINDOWS_OPENCLAW_RESOLUTION_RECORD_FIELDS = [
  "resolution_source",
  "resolved_executable_path_fingerprint",
  "resolved_extension",
  "version_probe_status",
  "version_probe_output_digest"
] as const;

export const LIVE_ACTIVATION_BINDING_FIELDS = [
  "home_id",
  "gateway_instance_id",
  "active_package_generation_id",
  "package_activation_revision",
  "production_activation_id",
  "supervisor_owner_id",
  "supervisor_lease_epoch",
  "worker_owner_id",
  "worker_fencing_token",
  "worker_mode",
  "schema_version",
  "configuration_generation_id",
  "effective_route_set_id"
] as const;

export const PROTECTED_QUEUE_EVIDENCE_FIELDS = [
  "fixture_id",
  "job_id",
  "candidate_id",
  "claim_owner_id",
  "claim_fencing_token",
  "completion_node_id",
  "semantic_completion_committed",
  "authority_loss_completion_rejected",
  "interruption_recovery_recorded",
  "content_retry_consumed"
] as const;

export const SHUTDOWN_EVIDENCE_FIELDS = [
  "gateway_stop_observed",
  "worker_terminal_state",
  "supervisor_terminal_state",
  "supervisor_terminal_reason",
  "launch_attempt_terminal_code"
] as const;

export const LIVE_ACTIVATION_EVIDENCE_FIELDS = [
  "evidence_schema_version",
  "evidence_class",
  "published_channel",
  "package_name",
  "package_version",
  "artifact_integrity",
  "registry_record_identity",
  "activation",
  "queue",
  "shutdown",
  "interaction_active",
  "learning_runtime_active",
  "production_learning_ready",
  "verified_at"
] as const;

export const DOCUMENTATION_EVIDENCE_TIERS = [
  "source_validated",
  "packed_artifact_validated",
  "published_npm_validated",
  "published_clawhub_validated",
  "host_native_runtime_validated"
] as const;
export type DocumentationEvidenceTier =
  typeof DOCUMENTATION_EVIDENCE_TIERS[number];

export const DOCUMENTATION_EVIDENCE_ENTRY_FIELDS = [
  "evidence_tier",
  "published_channel",
  "package_version",
  "artifact_integrity",
  "validation_report_digest",
  "live_activation_evidence_digest",
  "support_claim_allowed",
  "limitations"
] as const;

export const PUBLISHED_RUNTIME_VALIDATION_REPORT_FIELDS = [
  "report_schema_version",
  "published_channel",
  "package_name",
  "package_version",
  "artifact_path_fingerprint",
  "artifact_integrity",
  "artifact_size",
  "registry_record_identity",
  "distribution_attestation",
  "validation_steps",
  "live_activation_evidence",
  "support_claim_allowed",
  "failure_codes",
  "created_at"
] as const;

export const PUBLISHED_RUNTIME_CLOSURE_CONTRACT_FIXTURE = Object.freeze({
  stage: PUBLISHED_RUNTIME_CLOSURE_STAGE,
  channels: PUBLISHED_DISTRIBUTION_CHANNELS,
  evidence_classes: PUBLISHED_RUNTIME_EVIDENCE_CLASSES,
  embedded_manifest_fields: EMBEDDED_CLOSURE_MANIFEST_FIELDS,
  distribution_attestation_fields: DISTRIBUTION_ATTESTATION_FIELDS,
  validation_steps: ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS,
  validation_step_fields: ARTIFACT_VALIDATION_STEP_RECORD_FIELDS,
  windows_resolution_sources: WINDOWS_OPENCLAW_RESOLUTION_SOURCES,
  windows_extensions: WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS,
  windows_resolution_fields: WINDOWS_OPENCLAW_RESOLUTION_RECORD_FIELDS,
  live_activation_binding_fields: LIVE_ACTIVATION_BINDING_FIELDS,
  protected_queue_evidence_fields: PROTECTED_QUEUE_EVIDENCE_FIELDS,
  shutdown_evidence_fields: SHUTDOWN_EVIDENCE_FIELDS,
  live_activation_evidence_fields: LIVE_ACTIVATION_EVIDENCE_FIELDS,
  documentation_evidence_tiers: DOCUMENTATION_EVIDENCE_TIERS,
  documentation_evidence_entry_fields: DOCUMENTATION_EVIDENCE_ENTRY_FIELDS,
  validation_report_fields: PUBLISHED_RUNTIME_VALIDATION_REPORT_FIELDS,
  canonical_activation_requires_global_ee: false,
  canonical_activation_invokes_global_openclaw: false,
  npm_and_clawhub_evidence_interchangeable: false
} as const);
