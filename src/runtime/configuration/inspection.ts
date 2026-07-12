import {
  PRODUCTION_SEMANTIC_FALLBACK_POLICY,
  RUNTIME_CONFIGURATION_AUTHORITY_STAGE,
  RUNTIME_CONFIGURATION_CONTRACT_VERSION
} from "./constants.js";
import type {
  RuntimeConfigurationPointerRow,
  RuntimeRouteEnvelope,
  VerifiedRuntimeConfigurationGeneration
} from "./types.js";
import type {
  RuntimeRouteProjectionReadResult
} from "./route-authority.js";

export type RuntimeConfigurationAuthorityInspection = {
  stage: typeof RUNTIME_CONFIGURATION_AUTHORITY_STAGE;
  contract_version: typeof RUNTIME_CONFIGURATION_CONTRACT_VERSION;
  immutable_configuration_generation_supported: true;
  profile_registry_supported: true;
  capability_validation_supported: true;
  route_envelope_supported: true;
  current_configuration_state: "missing" | "incomplete" | "complete";
  effective_route_set_id: string | null;
  runtime_route_projection_state:
    | "missing"
    | "invalid"
    | "authority_mismatch"
    | "current";
  mutable_route_projection_authority_connected: false;
  queue_claiming_enabled: false;
  semantic_production_writes_enabled: false;
  production_learning_ready: false;
  learning_runtime_active: false;
};

export const inspectRuntimeConfigurationAuthority = (options: {
  pointer?: RuntimeConfigurationPointerRow;
  verifiedGeneration?: VerifiedRuntimeConfigurationGeneration;
  envelope?: RuntimeRouteEnvelope;
  routeProjection?: RuntimeRouteProjectionReadResult;
} = {}): RuntimeConfigurationAuthorityInspection => {
  const hasPointerAuthority = Boolean(
    options.pointer?.generation_id && options.pointer.manifest_digest
  );
  const verifiedGenerationMatches = Boolean(
    hasPointerAuthority &&
    options.verifiedGeneration?.manifest.generation_id === options.pointer?.generation_id &&
    options.verifiedGeneration?.manifestDigest === options.pointer?.manifest_digest
  );
  return {
  stage: RUNTIME_CONFIGURATION_AUTHORITY_STAGE,
  contract_version: RUNTIME_CONFIGURATION_CONTRACT_VERSION,
  immutable_configuration_generation_supported: true,
  profile_registry_supported: true,
  capability_validation_supported: true,
  route_envelope_supported: true,
  current_configuration_state: !options.pointer
    ? "missing"
    : verifiedGenerationMatches
      ? "complete"
      : "incomplete",
  effective_route_set_id: options.envelope?.effective_route_set_id ?? null,
  runtime_route_projection_state: options.routeProjection?.status ?? "missing",
  mutable_route_projection_authority_connected: false,
  queue_claiming_enabled: PRODUCTION_SEMANTIC_FALLBACK_POLICY.queue_claiming_enabled,
  semantic_production_writes_enabled:
    PRODUCTION_SEMANTIC_FALLBACK_POLICY.semantic_production_writes_enabled,
  production_learning_ready: false,
  learning_runtime_active: false
  };
};
