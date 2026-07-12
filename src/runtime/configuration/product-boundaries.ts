import type { DeliveryState } from "../../types/domain.js";
import {
  CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION,
  PRODUCTION_SEMANTIC_FALLBACK_POLICY,
  RUNTIME_CONFIGURATION_CAPABILITIES
} from "./constants.js";
import { RuntimeConfigurationError } from "./errors.js";
import type {
  RuntimeCapabilityProductState,
  RuntimeConfigurationSettings
} from "./types.js";

export type CoreLearningQualityProjection = {
  quality_profile: RuntimeConfigurationSettings["quality_profile"];
  profile_id: string;
  profile_version: string;
  setup_state: "configured" | "incomplete";
  validation_state: "valid" | "stale" | "invalid" | "missing";
  benchmark_assurance: "recommended" | "supported" | "unbenchmarked";
  runtime_health: "healthy" | "degraded" | "paused" | "explicitly_disabled";
  core_learning_quality:
    | "production"
    | "contract_valid_quality_unbenchmarked"
    | "not_production_ready";
  production_ready: boolean;
  queue_claiming_enabled: false;
  semantic_production_writes_enabled: false;
  capability_states: RuntimeCapabilityProductState[];
};

const assuranceRank = {
  unbenchmarked: 0,
  supported: 1,
  recommended: 2
} as const;

const worstAssurance = (
  states: readonly RuntimeCapabilityProductState[]
): CoreLearningQualityProjection["benchmark_assurance"] => {
  let result: CoreLearningQualityProjection["benchmark_assurance"] = "recommended";
  for (const state of states) {
    if (assuranceRank[state.benchmark_assurance] < assuranceRank[result]) {
      result = state.benchmark_assurance;
    }
  }
  return result;
};

export const assertExplicitLegacyRuleMode = (options: {
  settings: RuntimeConfigurationSettings;
  selectedBecauseProviderFailed?: boolean;
}): void => {
  if (!options.settings.legacy_rule_mode.enabled) {
    return;
  }
  if (
    options.settings.legacy_rule_mode.label !== "legacy_rule_compatibility" ||
    options.selectedBecauseProviderFailed
  ) {
    throw new RuntimeConfigurationError(
      "EE_LEGACY_RULE_MODE_FORBIDDEN",
      "Legacy rule mode must be an explicit separately labeled operator selection and cannot be entered after provider failure."
    );
  }
};

export const resolveSemanticGenerationRouteAvailability = (options: {
  capability: "learning_gate" | "distillation" | "hybrid_postmortem";
  hasCurrentValidatedRoute: boolean;
  hasCurrentValidatedFallback: boolean;
  legacyRuleModeExplicitlyEnabled: boolean;
  providerFailureTriggeredSelection?: boolean;
}): {
  allowed: boolean;
  behavior: "model_route" | "validated_fallback" | "legacy_rule_compatibility" | "blocked";
  failure_code: string | null;
  consumes_content_retry: false;
} => {
  if (options.hasCurrentValidatedRoute) {
    return {
      allowed: true,
      behavior: "model_route",
      failure_code: null,
      consumes_content_retry: false
    };
  }
  if (options.hasCurrentValidatedFallback) {
    return {
      allowed: true,
      behavior: "validated_fallback",
      failure_code: null,
      consumes_content_retry: false
    };
  }
  if (
    options.legacyRuleModeExplicitlyEnabled &&
    !options.providerFailureTriggeredSelection
  ) {
    return {
      allowed: true,
      behavior: "legacy_rule_compatibility",
      failure_code: null,
      consumes_content_retry: false
    };
  }
  return {
    allowed: false,
    behavior: "blocked",
    failure_code: options.capability === "distillation"
      ? "EE_PROVIDER_CONFIGURATION_INVALID"
      : "EE_PROVIDER_CONTRACT_INVALID",
    consumes_content_retry: false
  };
};

export const applyCustomShadowOnlyDeliveryCap = (options: {
  containsUnbenchmarkedOrigin: boolean;
  containsRevokedProfileOrigin?: boolean;
  requestedDeliveryState: DeliveryState;
}): {
  policy_version: typeof CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION;
  delivery_state: DeliveryState;
  capped: boolean;
  reason_code: string | null;
} => {
  if (options.containsRevokedProfileOrigin) {
    return {
      policy_version: CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION,
      delivery_state: "quarantined",
      capped: true,
      reason_code: "revoked_profile_origin"
    };
  }
  if (options.containsUnbenchmarkedOrigin) {
    return {
      policy_version: CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION,
      delivery_state: "shadow_only",
      capped: true,
      reason_code: "custom_unbenchmarked_origin_shadow_only"
    };
  }
  return {
    policy_version: CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION,
    delivery_state: options.requestedDeliveryState,
    capped: false,
    reason_code: null
  };
};

export const deriveCoreLearningQualityProjection = (options: {
  settings: RuntimeConfigurationSettings;
  capabilityStates: readonly RuntimeCapabilityProductState[];
}): CoreLearningQualityProjection => {
  const byCapability = new Map(
    options.capabilityStates.map((state) => [state.capability, state])
  );
  if (
    byCapability.size !== RUNTIME_CONFIGURATION_CAPABILITIES.length ||
    RUNTIME_CONFIGURATION_CAPABILITIES.some((capability) => !byCapability.has(capability))
  ) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_INVALID",
      "Capability product-state projection must be exhaustive."
    );
  }
  assertExplicitLegacyRuleMode({ settings: options.settings });
  const requiredStates = options.capabilityStates.filter(
    (state) => state.required_for_production
  );
  const setupComplete = requiredStates.every((state) =>
    options.settings.capability_routes[state.capability].enabled
  );
  const validationState: CoreLearningQualityProjection["validation_state"] =
    requiredStates.some((state) => state.validation_status === "invalid")
      ? "invalid"
      : requiredStates.some((state) => state.validation_status === "stale")
        ? "stale"
        : requiredStates.some((state) => state.validation_status === "missing")
          ? "missing"
          : "valid";
  const explicitlyDisabled = requiredStates.some((state) =>
    !options.settings.capability_routes[state.capability].enabled ||
    state.runtime_health === "disabled"
  );
  const blocked = requiredStates.some((state) =>
    state.runtime_health === "blocked" ||
    state.runtime_health === "unknown_warming"
  );
  const degraded = requiredStates.some((state) =>
    state.runtime_health === "degraded_fallback" ||
    state.active_route_kind === "fallback"
  );
  const runtimeHealth: CoreLearningQualityProjection["runtime_health"] =
    explicitlyDisabled
      ? "explicitly_disabled"
      : blocked
        ? "paused"
        : degraded
          ? "degraded"
          : "healthy";
  const assurance = worstAssurance(requiredStates);
  const evaluatedReady =
    options.settings.quality_profile === "evaluated_recommended" &&
    setupComplete &&
    validationState === "valid" &&
    assurance !== "unbenchmarked" &&
    (runtimeHealth === "healthy" || runtimeHealth === "degraded");
  const customContractValid =
    options.settings.quality_profile === "custom" &&
    options.settings.custom_profile_acknowledged &&
    setupComplete &&
    validationState === "valid";
  return {
    quality_profile: options.settings.quality_profile,
    profile_id: options.settings.profile_id,
    profile_version: options.settings.profile_version,
    setup_state: setupComplete ? "configured" : "incomplete",
    validation_state: validationState,
    benchmark_assurance: options.settings.quality_profile === "custom"
      ? "unbenchmarked"
      : assurance,
    runtime_health: runtimeHealth,
    core_learning_quality: evaluatedReady
      ? "production"
      : customContractValid
        ? "contract_valid_quality_unbenchmarked"
        : "not_production_ready",
    production_ready: evaluatedReady,
    queue_claiming_enabled: PRODUCTION_SEMANTIC_FALLBACK_POLICY.queue_claiming_enabled,
    semantic_production_writes_enabled:
      PRODUCTION_SEMANTIC_FALLBACK_POLICY.semantic_production_writes_enabled,
    capability_states: [...options.capabilityStates]
  };
};
