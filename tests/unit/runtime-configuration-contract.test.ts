import { describe, expect, it } from "vitest";
import {
  CONFIGURATION_INVALIDATION_BINDINGS,
  CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION,
  PRODUCTION_SEMANTIC_FALLBACK_POLICY,
  RUNTIME_CONFIGURATION_CAPABILITIES,
  RUNTIME_CONFIGURATION_CONTRACT_FIXTURE,
  RUNTIME_ROUTE_WRITER_MATRIX,
  SUPPORTED_ROUTE_OVERRIDE_KEYS
} from "../../src/runtime/configuration/constants.js";
import {
  RuntimeConfigurationError
} from "../../src/runtime/configuration/errors.js";
import {
  applyCustomShadowOnlyDeliveryCap,
  assertExplicitLegacyRuleMode,
  deriveCoreLearningQualityProjection,
  resolveSemanticGenerationRouteAvailability
} from "../../src/runtime/configuration/product-boundaries.js";
import {
  computeProfileEntryDigest,
  computeProfileRegistryDigest,
  createBoundMinimumProfileRegistry,
  parseAndVerifyProfileRegistry,
  selectProfileRegistryEntry
} from "../../src/runtime/configuration/registry.js";
import {
  createConfigurationFixtureSettings
} from "../fixtures/runtime-configuration-authority-fixture.js";

describe("runtime configuration contract", () => {
  it("materializes exhaustive S4 capabilities, invalidation bindings, writers, and fail-closed product flags", () => {
    expect(RUNTIME_CONFIGURATION_CAPABILITIES).toEqual([
      "learning_gate",
      "distillation",
      "embedding",
      "sync_second_opinion",
      "hybrid_postmortem"
    ]);
    expect(RUNTIME_CONFIGURATION_CONTRACT_FIXTURE.capabilities).toBe(
      RUNTIME_CONFIGURATION_CAPABILITIES
    );
    expect(new Set(CONFIGURATION_INVALIDATION_BINDINGS).size).toBe(
      CONFIGURATION_INVALIDATION_BINDINGS.length
    );
    expect(SUPPORTED_ROUTE_OVERRIDE_KEYS).toContain("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    expect(SUPPORTED_ROUTE_OVERRIDE_KEYS).toContain("EXPERIENCE_ENGINE_EMBEDDING_MODEL");
    expect(RUNTIME_ROUTE_WRITER_MATRIX).toEqual({
      supervisor: ["replace_projection"],
      worker: ["submit_observation"],
      plugin: ["read_projection"]
    });
    expect(PRODUCTION_SEMANTIC_FALLBACK_POLICY).toMatchObject({
      silent_auto_to_rule_fallback: false,
      queue_claiming_enabled: false,
      semantic_production_writes_enabled: false,
      custom_generation_live_delivery_policy_version: "custom-shadow-only-v1",
      custom_generated_node_delivery_state: "shadow_only"
    });
  });

  it("ships only a truthful custom unbenchmarked minimum registry before benchmark evidence exists", () => {
    const registry = createBoundMinimumProfileRegistry({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8",
      packageBuildId: "build-test",
      publishedAt: "2026-07-12T00:00:00.000Z"
    });
    expect(registry.registry_digest).toBe(computeProfileRegistryDigest(registry));
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0]).toMatchObject({
      profile_id: "custom-contract-v1",
      quality_profile: "custom",
      entry_status: "active",
      benchmark_evidence: null
    });
    expect(registry.entries[0].entry_digest).toBe(
      computeProfileEntryDigest(registry.entries[0])
    );
    expect(Object.keys(registry.entries[0].capability_contracts).sort()).toEqual(
      [...RUNTIME_CONFIGURATION_CAPABILITIES].sort()
    );
    expect(
      Object.values(registry.entries[0].capability_contracts).every(
        (contract) => contract.benchmark_assurance === "unbenchmarked"
      )
    ).toBe(true);

    expect(() => selectProfileRegistryEntry({
      registry,
      qualityProfile: "custom",
      profileId: "custom-contract-v1",
      profileVersion: "1.0.0",
      currentEeVersion: "0.4.8",
      hostApiVersion: "2026.4.1",
      gatewayVersion: "2026.4.1",
      customAcknowledged: false
    })).toThrowError(RuntimeConfigurationError);
    expect(selectProfileRegistryEntry({
      registry,
      qualityProfile: "custom",
      profileId: "custom-contract-v1",
      profileVersion: "1.0.0",
      currentEeVersion: "0.4.8",
      hostApiVersion: "2026.4.1",
      gatewayVersion: "2026.4.1",
      customAcknowledged: true
    }).profile_id).toBe("custom-contract-v1");

    expect(() => selectProfileRegistryEntry({
      registry,
      qualityProfile: "custom",
      profileId: "custom-contract-v1",
      profileVersion: "1.0.0",
      currentEeVersion: "0.4.8",
      hostApiVersion: "2026.3.9",
      gatewayVersion: "2026.4.1",
      customAcknowledged: true
    })).toThrowError(/host api/iu);
    expect(() => selectProfileRegistryEntry({
      registry,
      qualityProfile: "custom",
      profileId: "custom-contract-v1",
      profileVersion: "1.0.0",
      currentEeVersion: "0.4.8",
      hostApiVersion: "2026.4.1",
      gatewayVersion: "2026.3.9",
      customAcknowledged: true
    })).toThrowError(/gateway/iu);
  });

  it("rejects registry tampering, revocation, and optimistic evaluated-profile claims", () => {
    const registry = createBoundMinimumProfileRegistry({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8",
      packageBuildId: "build-test"
    });
    const tampered = structuredClone(registry);
    tampered.entries[0].expected_cost_class = "tampered";
    expect(() => parseAndVerifyProfileRegistry({
      value: tampered,
      expectedPackageName: registry.package_name,
      expectedPackageVersion: registry.package_version,
      expectedPackageBuildId: registry.package_build_id
    })).toThrowError(/digest mismatch/u);

    const revoked = structuredClone(registry);
    revoked.entries[0].entry_status = "revoked";
    revoked.entries[0].entry_digest = computeProfileEntryDigest(revoked.entries[0]);
    revoked.registry_digest = computeProfileRegistryDigest(revoked);
    const verified = parseAndVerifyProfileRegistry({
      value: revoked,
      expectedPackageName: revoked.package_name,
      expectedPackageVersion: revoked.package_version,
      expectedPackageBuildId: revoked.package_build_id
    });
    expect(() => selectProfileRegistryEntry({
      registry: verified,
      qualityProfile: "custom",
      profileId: "custom-contract-v1",
      profileVersion: "1.0.0",
      currentEeVersion: "0.4.8",
      hostApiVersion: "2026.4.1",
      gatewayVersion: "2026.4.1",
      customAcknowledged: true
    })).toThrowError(/revoked/u);

    const malformedEvidence = structuredClone(registry);
    malformedEvidence.entries[0].benchmark_evidence = {
      evidence_id: "evidence-1",
      evidence_version: "1",
      benchmark_protocol_version: "benchmark-v1",
      scenario_set_digest: "not-a-digest",
      report_digest: "also-not-a-digest",
      publication_status: "published"
    };
    malformedEvidence.entries[0].entry_digest = computeProfileEntryDigest(
      malformedEvidence.entries[0]
    );
    malformedEvidence.registry_digest = computeProfileRegistryDigest(malformedEvidence);
    expect(() => parseAndVerifyProfileRegistry({
      value: malformedEvidence,
      expectedPackageName: malformedEvidence.package_name,
      expectedPackageVersion: malformedEvidence.package_version,
      expectedPackageBuildId: malformedEvidence.package_build_id
    })).toThrowError(/benchmark evidence/u);

    const optimisticCustom = structuredClone(registry);
    optimisticCustom.entries[0].capability_contracts.distillation.benchmark_assurance =
      "supported";
    optimisticCustom.entries[0].entry_digest = computeProfileEntryDigest(
      optimisticCustom.entries[0]
    );
    optimisticCustom.registry_digest = computeProfileRegistryDigest(optimisticCustom);
    expect(() => parseAndVerifyProfileRegistry({
      value: optimisticCustom,
      expectedPackageName: optimisticCustom.package_name,
      expectedPackageVersion: optimisticCustom.package_version,
      expectedPackageBuildId: optimisticCustom.package_build_id
    })).toThrowError(/custom profile/iu);
  });

  it("preserves custom-shadow-only-v1 regardless of requested delivery maturity", () => {
    for (const requestedDeliveryState of [
      "shadow_only",
      "conservative_only",
      "eligible",
      "shadow_probe"
    ] as const) {
      expect(applyCustomShadowOnlyDeliveryCap({
        containsUnbenchmarkedOrigin: true,
        requestedDeliveryState
      })).toEqual({
        policy_version: CUSTOM_GENERATION_LIVE_DELIVERY_POLICY_VERSION,
        delivery_state: "shadow_only",
        capped: true,
        reason_code: "custom_unbenchmarked_origin_shadow_only"
      });
    }
    expect(applyCustomShadowOnlyDeliveryCap({
      containsUnbenchmarkedOrigin: false,
      containsRevokedProfileOrigin: true,
      requestedDeliveryState: "eligible"
    }).delivery_state).toBe("quarantined");
  });

  it("blocks semantic generation instead of silently selecting rule fallback after provider failure", () => {
    expect(resolveSemanticGenerationRouteAvailability({
      capability: "distillation",
      hasCurrentValidatedRoute: false,
      hasCurrentValidatedFallback: false,
      legacyRuleModeExplicitlyEnabled: false
    })).toMatchObject({
      allowed: false,
      behavior: "blocked",
      consumes_content_retry: false
    });
    expect(resolveSemanticGenerationRouteAvailability({
      capability: "distillation",
      hasCurrentValidatedRoute: false,
      hasCurrentValidatedFallback: false,
      legacyRuleModeExplicitlyEnabled: true,
      providerFailureTriggeredSelection: true
    }).behavior).toBe("blocked");
    expect(resolveSemanticGenerationRouteAvailability({
      capability: "distillation",
      hasCurrentValidatedRoute: false,
      hasCurrentValidatedFallback: false,
      legacyRuleModeExplicitlyEnabled: true
    }).behavior).toBe("legacy_rule_compatibility");

    const settings = createConfigurationFixtureSettings();
    settings.legacy_rule_mode.enabled = true;
    expect(() => assertExplicitLegacyRuleMode({
      settings,
      selectedBecauseProviderFailed: true
    })).toThrowError(/cannot be entered after provider failure/u);
  });

  it("keeps setup, validation, assurance, runtime health, and activation orthogonal", () => {
    const settings = createConfigurationFixtureSettings();
    const capabilityStates = RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => ({
      capability,
      required_for_production: settings.capability_routes[capability].required_for_production,
      validation_status: "valid" as const,
      benchmark_assurance: "unbenchmarked" as const,
      runtime_health: settings.capability_routes[capability].enabled
        ? "healthy" as const
        : "disabled" as const,
      active_route_kind: settings.capability_routes[capability].enabled
        ? "primary" as const
        : "none" as const
    }));
    expect(deriveCoreLearningQualityProjection({ settings, capabilityStates })).toMatchObject({
      setup_state: "configured",
      validation_state: "valid",
      benchmark_assurance: "unbenchmarked",
      runtime_health: "healthy",
      core_learning_quality: "contract_valid_quality_unbenchmarked",
      production_ready: false,
      queue_claiming_enabled: false,
      semantic_production_writes_enabled: false
    });
  });
});
