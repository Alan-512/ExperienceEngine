import type { DatabaseSync } from "node:sqlite";
import type { RuntimePackageGenerationIdentity } from "../identity/types.js";
import type {
  ActiveRouteKind,
  BenchmarkAssurance,
  ConfigurationGenerationState,
  ProfileEntryStatus,
  QualityProfile,
  RouteIdentityMatchKind,
  RuntimeConfigurationCapability,
  RuntimeHealth,
  ValidationStatus,
  WORKER_CAPABILITY_HEALTH_OBSERVATION_SCHEMA_VERSION
} from "./constants.js";

export type ProfileCompatibility = {
  node_version_range: string;
  os_families: string[];
  architectures: string[];
  host_api_range: string;
  gateway_version_range: string;
};

export type ProfileCapabilityContract = {
  required_for_production: boolean;
  contract_version: string;
  route_spec_id: string;
  benchmark_assurance: BenchmarkAssurance;
  benchmark_evidence_ref: string | null;
};

export type ProfileRouteSpec = {
  provider_family: string;
  identity_match_kind: RouteIdentityMatchKind;
  allowed_model_or_deployment_fingerprints: string[];
  endpoint_policy: string;
  auth_modes: string[];
  provider_adapter_version: string;
};

export type ProfileBenchmarkEvidence = {
  evidence_id: string;
  evidence_version: string;
  benchmark_protocol_version: string;
  scenario_set_digest: string;
  report_digest: string;
  publication_status: string;
};

export type ProfileRegistryEntry = {
  profile_id: string;
  profile_version: string;
  quality_profile: QualityProfile;
  entry_status: ProfileEntryStatus;
  supersedes_profile_version: string | null;
  minimum_ee_version: string;
  maximum_ee_version: string | null;
  compatibility: ProfileCompatibility;
  capability_contracts: Record<RuntimeConfigurationCapability, ProfileCapabilityContract>;
  route_specs: Record<string, ProfileRouteSpec>;
  embedding_profile: string;
  benchmark_evidence: ProfileBenchmarkEvidence | null;
  expected_cost_class: string;
  expected_latency_class: string;
  published_at: string;
  entry_digest: string;
};

export type PackagedProfileRegistry = {
  registry_schema_version: string;
  registry_version: string;
  package_name: string;
  package_version: string;
  package_build_id: string;
  registry_digest: string;
  entries: ProfileRegistryEntry[];
};

export type RuntimeRouteDefinition = {
  route_id: string;
  provider_family: string;
  model_or_deployment_identity: string;
  endpoint_identity: string;
  auth_mode: string;
  secret_refs: string[];
  provider_adapter_version: string;
  request_schema_version: string;
  response_schema_version: string;
};

export type RuntimeCapabilityRouteConfiguration = {
  enabled: boolean;
  required_for_production: boolean;
  contract_version: string;
  primary_route: RuntimeRouteDefinition | null;
  fallback_routes: RuntimeRouteDefinition[];
  fallback_trigger_codes: string[];
};

export type RuntimeConfigurationSettings = {
  settings_schema_version: string;
  quality_profile: QualityProfile;
  profile_id: string;
  profile_version: string;
  custom_profile_acknowledged: boolean;
  legacy_rule_mode: {
    enabled: boolean;
    label: "legacy_rule_compatibility";
  };
  capability_routes: Record<RuntimeConfigurationCapability, RuntimeCapabilityRouteConfiguration>;
};

export type RuntimeConfigurationSecrets = {
  secrets_schema_version: string;
  values: Record<string, string>;
};

export type RuntimeValidationRecord = {
  validation_record_id: string;
  configuration_generation_id: string;
  home_id: string;
  package_generation_id: string;
  capability: RuntimeConfigurationCapability;
  route_id: string;
  route_fingerprint: string;
  effective_route_set_id: string;
  override_snapshot_fingerprint: string;
  provider_family: string;
  model_or_deployment_fingerprint: string;
  auth_mode: string;
  secret_ref_set_fingerprint: string;
  resolved_secret_material_fingerprint: string;
  endpoint_identity_fingerprint: string;
  quality_profile: QualityProfile;
  contract_version: string;
  profile_id: string;
  profile_version: string;
  provider_adapter_version: string;
  request_schema_version: string;
  response_schema_version: string;
  profile_registry_digest: string;
  benchmark_evidence_ref: string | null;
  validation_status: ValidationStatus;
  benchmark_assurance: BenchmarkAssurance;
  validated_at: string;
  latency_ms: number | null;
  response_size_bytes: number | null;
  embedding_vector_dimensions: number | null;
  failure_code: string | null;
};

export type RuntimeValidationState = {
  validation_schema_version: string;
  records: RuntimeValidationRecord[];
};

export type RuntimeConfigurationGenerationManifest = {
  manifest_schema_version: string;
  generation_id: string;
  parent_generation_id: string | null;
  home_id: string;
  package_generation_id: string;
  integrity_key_id: string;
  path_normalization_version: string;
  settings_schema_version: string;
  secrets_schema_version: string;
  validation_schema_version: string;
  required_files: string[];
  non_secret_file_digests: Record<string, string>;
  secrets_file_hmac: string;
  secret_ref_set_fingerprint: string;
  profile_registry_digest: string;
  override_snapshot_fingerprint: string;
  created_at: string;
  created_by_instance_id: string;
  generation_state: "complete";
};

export type RuntimeConfigurationPointerRow = {
  home_id: string;
  pointer_schema_version: string;
  pointer_revision: number;
  generation_id: string | null;
  previous_generation_id: string | null;
  manifest_digest: string | null;
  commit_id: string | null;
  committed_at: string | null;
};

export type RuntimeConfigurationActivationInvalidationProvider = {
  invalidateForConfigurationCommitInTransaction(input: {
    db: DatabaseSync;
    homeId: string;
    currentConfigurationGenerationId: string | null;
    nextConfigurationGenerationId: string;
    committedAt: string;
  }): void;
};

export type RuntimeConfigurationGenerationAuthorityRow = {
  generation_id: string;
  home_id: string;
  parent_generation_id: string | null;
  manifest_digest: string;
  integrity_key_id: string;
  profile_registry_digest: string;
  created_by_instance_id: string;
  created_at: string;
  committed_at: string | null;
  generation_state: ConfigurationGenerationState;
};

export type RuntimeConfigurationCandidate = {
  generationId: string;
  parentGenerationId: string | null;
  settings: RuntimeConfigurationSettings;
  secrets: RuntimeConfigurationSecrets;
  validationState: RuntimeValidationState;
  packageIdentity: RuntimePackageGenerationIdentity;
  profileRegistry: PackagedProfileRegistry;
  profileSelectionContext: RuntimeProfileSelectionContext;
  overrideSnapshotFingerprint: string;
  createdByInstanceId: string;
  createdAt: string;
};

export type VerifiedRuntimeConfigurationGeneration = {
  directoryPath: string;
  settings: RuntimeConfigurationSettings;
  secrets: RuntimeConfigurationSecrets;
  validationState: RuntimeValidationState;
  manifest: RuntimeConfigurationGenerationManifest;
  manifestDigest: string;
  profileRegistry: PackagedProfileRegistry;
  profileSelectionContext: RuntimeProfileSelectionContext;
};

export type RuntimeProfileSelectionContext = {
  currentEeVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  architecture: string;
  hostApiVersion: string;
  gatewayVersion: string;
};

export type RuntimeRouteOverrideSnapshot = {
  values: Record<string, string>;
  fingerprint: string;
};

export type NormalizedCapabilityRouteEnvelope = {
  enabled: boolean;
  primary_route_fingerprint: string | null;
  ordered_fallback_route_fingerprints: string[];
  contract_version: string;
  validation_record_ids: string[];
  auth_identity_fingerprint: string | null;
};

export type RuntimeRouteEnvelope = {
  route_envelope_schema_version: string;
  home_id: string;
  configuration_generation_id: string;
  package_generation_id: string;
  effective_route_set_id: string;
  override_snapshot_fingerprint: string;
  capabilities: Record<RuntimeConfigurationCapability, NormalizedCapabilityRouteEnvelope>;
  created_at: string;
};

export type RuntimeCapabilityProjection = {
  capability_revision: number;
  active_route_id: string | null;
  active_route_kind: ActiveRouteKind;
  runtime_health: RuntimeHealth;
  failure_code: string | null;
  checked_at: string;
};

export type RuntimeRouteProjection = {
  projection_schema_version: string;
  projection_revision: number;
  home_id: string;
  configuration_generation_id: string;
  package_generation_id: string;
  effective_route_set_id: string;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  worker_owner_id: string;
  worker_fencing_token: number;
  writer_instance_id: string;
  written_at: string;
  capabilities: Record<RuntimeConfigurationCapability, RuntimeCapabilityProjection>;
};

export type WorkerCapabilityHealthObservation = {
  observation_schema_version:
    typeof WORKER_CAPABILITY_HEALTH_OBSERVATION_SCHEMA_VERSION;
  home_id: string;
  configuration_generation_id: string;
  package_generation_id: string;
  effective_route_set_id: string;
  worker_owner_id: string;
  worker_fencing_token: number;
  schema_version: string;
  observed_at: string;
  capabilities: Record<RuntimeConfigurationCapability, {
    active_route_id: string | null;
    active_route_kind: ActiveRouteKind;
    runtime_health: RuntimeHealth;
    failure_code: string | null;
    checked_at: string;
  }>;
};

export type MutableRouteProjectionAuthorityEvidence = {
  available: true;
  fresh: true;
  authority_contract_version: string;
  operation: "mutable_route_projection";
  home_id: string;
  configuration_generation_id: string;
  package_generation_id: string;
  effective_route_set_id: string;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  worker_owner_id: string;
  worker_fencing_token: number;
  schema_version: string;
  observed_at: string;
  expires_at: string;
};

export type UnavailableMutableRouteProjectionAuthorityEvidence = {
  available: false;
  fresh: false;
  authority_contract_version: string;
  reason: "production_activation_not_current" | "authority_provider_unavailable";
};

export type MutableRouteProjectionAuthorityProvider = {
  getMutableRouteProjectionAuthorityInTransaction(input: {
    db: DatabaseSync;
    homeId: string;
    configurationGenerationId: string;
    packageGenerationId: string;
    effectiveRouteSetId: string;
    supervisorOwnerId: string;
    supervisorLeaseEpoch: number;
    workerOwnerId: string;
    workerFencingToken: number;
    schemaVersion: string;
  }): MutableRouteProjectionAuthorityEvidence |
    UnavailableMutableRouteProjectionAuthorityEvidence;
};

export type CapabilityValidationProbeResult = {
  reachable: boolean;
  contract_valid: boolean;
  response_schema_valid: boolean;
  latency_ms: number | null;
  response_size_bytes: number | null;
  embedding_vector: number[] | null;
  failure_code: string | null;
};

export type RuntimeCapabilityProductState = {
  capability: RuntimeConfigurationCapability;
  required_for_production: boolean;
  validation_status: ValidationStatus;
  benchmark_assurance: BenchmarkAssurance;
  runtime_health: RuntimeHealth;
  active_route_kind: ActiveRouteKind;
};
