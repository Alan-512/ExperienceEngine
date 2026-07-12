export const RUNTIME_CONFIGURATION_AUTHORITY_STAGE =
  "configuration_route_authority_s4" as const;

export const RUNTIME_CONFIGURATION_CONTRACT_VERSION =
  "runtime-configuration-route-v1" as const;
export const PROFILE_REGISTRY_SCHEMA_VERSION = "profile-registry-v1" as const;
export const CONFIGURATION_MANIFEST_SCHEMA_VERSION =
  "configuration-generation-manifest-v1" as const;
export const CONFIGURATION_POINTER_SCHEMA_VERSION = "configuration-pointer-v1" as const;
export const CONFIGURATION_SETTINGS_SCHEMA_VERSION = "configuration-settings-v1" as const;
export const CONFIGURATION_SECRETS_SCHEMA_VERSION = "configuration-secrets-v1" as const;
export const VALIDATION_STATE_SCHEMA_VERSION = "validation-state-v1" as const;
export const ROUTE_ENVELOPE_SCHEMA_VERSION = "runtime-route-envelope-v1" as const;
export const RUNTIME_ROUTE_PROJECTION_SCHEMA_VERSION =
  "runtime-route-projection-v1" as const;
export const WORKER_CAPABILITY_HEALTH_OBSERVATION_SCHEMA_VERSION =
  "worker-capability-health-observation-v1" as const;
export const RUNTIME_ROUTE_PROJECTION_AUTHORITY_VERSION =
  "s6-mutable-route-projection-authority-v1" as const;

export const RUNTIME_CONFIGURATION_CAPABILITIES = [
  "learning_gate",
  "distillation",
  "embedding",
  "sync_second_opinion",
  "hybrid_postmortem"
] as const;

export type RuntimeConfigurationCapability =
  (typeof RUNTIME_CONFIGURATION_CAPABILITIES)[number];

export const QUALITY_PROFILES = ["evaluated_recommended", "custom"] as const;
export type QualityProfile = (typeof QUALITY_PROFILES)[number];

export const PROFILE_ENTRY_STATUSES = ["active", "deprecated", "revoked"] as const;
export type ProfileEntryStatus = (typeof PROFILE_ENTRY_STATUSES)[number];

export const VALIDATION_STATUSES = ["valid", "stale", "invalid", "missing"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const BENCHMARK_ASSURANCE_LEVELS = [
  "recommended",
  "supported",
  "unbenchmarked"
] as const;
export type BenchmarkAssurance = (typeof BENCHMARK_ASSURANCE_LEVELS)[number];

export const RUNTIME_HEALTH_STATES = [
  "healthy",
  "degraded_fallback",
  "blocked",
  "disabled",
  "unknown_warming"
] as const;
export type RuntimeHealth = (typeof RUNTIME_HEALTH_STATES)[number];

export const ACTIVE_ROUTE_KINDS = ["primary", "fallback", "none"] as const;
export type ActiveRouteKind = (typeof ACTIVE_ROUTE_KINDS)[number];

export const CONFIGURATION_GENERATION_STATES = ["committed", "abandoned"] as const;
export type ConfigurationGenerationState =
  (typeof CONFIGURATION_GENERATION_STATES)[number];

export const ROUTE_IDENTITY_MATCH_KINDS = [
  "exact",
  "provider_model_pair",
  "deployment_fingerprint_set"
] as const;
export type RouteIdentityMatchKind = (typeof ROUTE_IDENTITY_MATCH_KINDS)[number];

export const CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION =
  "custom-shadow-only-v1" as const;

export const CONFIGURATION_GENERATIONS_RELATIVE_DIRECTORY =
  "config-generations" as const;
export const RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH =
  "runtime/runtime-route-state.json" as const;
export const RUNTIME_ROUTE_PROJECTION_BACKUP_RELATIVE_PATH =
  "runtime/runtime-route-state.previous.json" as const;

export const CONFIGURATION_GENERATION_REQUIRED_FILES = [
  "settings.json",
  "secrets.json",
  "validation-state.json",
  "manifest.json"
] as const;

export const SUPPORTED_ROUTE_OVERRIDE_KEYS = [
  "EXPERIENCE_ENGINE_DISTILLER_PROVIDER",
  "EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE",
  "EXPERIENCE_ENGINE_DISTILLER_MODEL",
  "EXPERIENCE_ENGINE_DISTILLER_BASE_URL",
  "EXPERIENCE_ENGINE_DISTILLER_FALLBACK_CHAIN",
  "EXPERIENCE_ENGINE_DISTILLATION_MODE",
  "EXPERIENCE_ENGINE_EMBEDDING_PROVIDER",
  "EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER",
  "EXPERIENCE_ENGINE_EMBEDDING_MODEL",
  "EXPERIENCE_ENGINE_EMBEDDING_DTYPE",
  "EXPERIENCE_ENGINE_SYNC_SECOND_OPINION_MODE",
  "EXPERIENCE_ENGINE_SYNC_SECOND_OPINION_MODEL",
  "EXPERIENCE_ENGINE_HYBRID_ENABLED",
  "EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED",
  "EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED",
  "EXPERIENCE_ENGINE_HYBRID_EXPLAIN_PROVIDER_MODE",
  "EXPERIENCE_ENGINE_HYBRID_EXPLAIN_MODEL_PROFILE_VERSION",
  "EXPERIENCE_ENGINE_HYBRID_POSTMORTEM_PROVIDER_MODE",
  "EXPERIENCE_ENGINE_HYBRID_POSTMORTEM_MODEL_PROFILE_VERSION",
  "AZURE_OPENAI_ENDPOINT",
  "AWS_REGION"
] as const;

export type SupportedRouteOverrideKey =
  (typeof SUPPORTED_ROUTE_OVERRIDE_KEYS)[number];

export const CONFIGURATION_INVALIDATION_BINDINGS = [
  "home_id",
  "package_generation_id",
  "configuration_generation_id",
  "capability",
  "route_fingerprint",
  "effective_route_set_id",
  "provider_family",
  "model_or_deployment_fingerprint",
  "auth_mode",
  "secret_ref_set_fingerprint",
  "resolved_secret_material_fingerprint",
  "endpoint_identity_fingerprint",
  "quality_profile",
  "contract_version",
  "profile_version",
  "provider_adapter_version",
  "request_schema_version",
  "response_schema_version",
  "profile_registry_digest",
  "benchmark_evidence_ref",
  "override_snapshot_fingerprint"
] as const;

export const RUNTIME_ROUTE_WRITER_MATRIX = {
  supervisor: ["replace_projection"],
  worker: ["submit_observation"],
  plugin: ["read_projection"]
} as const;

export const PRODUCTION_SEMANTIC_FALLBACK_POLICY = {
  policy_version: "production-semantic-fallback-v1",
  provider_failure_behavior: "blocked_no_semantic_substitution",
  legacy_rule_mode_available: true,
  legacy_rule_mode_requires_explicit_opt_in: true,
  legacy_rule_mode_label: "legacy_rule_compatibility",
  silent_auto_to_rule_fallback: false,
  queue_claiming_enabled: false,
  semantic_production_writes_enabled: false,
  custom_generation_live_delivery_policy_version:
    CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION,
  custom_generated_node_delivery_state: "shadow_only"
} as const;

export const RUNTIME_CONFIGURATION_CONTRACT_FIXTURE = {
  contract_version: RUNTIME_CONFIGURATION_CONTRACT_VERSION,
  capabilities: RUNTIME_CONFIGURATION_CAPABILITIES,
  quality_profiles: QUALITY_PROFILES,
  profile_entry_statuses: PROFILE_ENTRY_STATUSES,
  validation_statuses: VALIDATION_STATUSES,
  benchmark_assurance_levels: BENCHMARK_ASSURANCE_LEVELS,
  runtime_health_states: RUNTIME_HEALTH_STATES,
  active_route_kinds: ACTIVE_ROUTE_KINDS,
  invalidation_bindings: CONFIGURATION_INVALIDATION_BINDINGS,
  route_writer_matrix: RUNTIME_ROUTE_WRITER_MATRIX,
  supported_route_override_keys: SUPPORTED_ROUTE_OVERRIDE_KEYS,
  semantic_fallback_policy: PRODUCTION_SEMANTIC_FALLBACK_POLICY
} as const;
