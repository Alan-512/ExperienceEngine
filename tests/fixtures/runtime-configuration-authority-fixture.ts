import { DatabaseSync } from "node:sqlite";
import {
  initializeRuntimeHomeIdentity
} from "../../src/runtime/identity/control-plane-bootstrap.js";
import type {
  MachineIntegrityKey,
  RuntimePackageGenerationIdentity
} from "../../src/runtime/identity/types.js";
import {
  createBoundMinimumProfileRegistry
} from "../../src/runtime/configuration/registry.js";
import {
  CONFIGURATION_SECRETS_SCHEMA_VERSION,
  CONFIGURATION_SETTINGS_SCHEMA_VERSION,
  VALIDATION_STATE_SCHEMA_VERSION
} from "../../src/runtime/configuration/constants.js";
import {
  computeEffectiveRouteSetId,
  createSupportedRouteOverrideSnapshot
} from "../../src/runtime/configuration/route-authority.js";
import {
  createCapabilityValidationRecord
} from "../../src/runtime/configuration/validation.js";
import type {
  PackagedProfileRegistry,
  RuntimeConfigurationCandidate,
  RuntimeConfigurationSecrets,
  RuntimeConfigurationSettings,
  RuntimeRouteDefinition,
  RuntimeValidationRecord
} from "../../src/runtime/configuration/types.js";

export const CONFIGURATION_FIXTURE_START = "2026-07-12T12:00:00.000Z";
export const CONFIGURATION_FIXTURE_PACKAGE_BUILD_ID =
  "build_runtime_configuration_fixture";
export const CONFIGURATION_FIXTURE_PROFILE_SELECTION_CONTEXT = {
  currentEeVersion: "0.4.8",
  nodeVersion: "20.0.0",
  platform: "win32" as const,
  architecture: "x64",
  hostApiVersion: "2026.4.1",
  gatewayVersion: "2026.4.1"
};

export const createRuntimeConfigurationHome = async (home: string): Promise<{
  db: DatabaseSync;
  homeId: string;
  canonicalHome: string;
  integrityKey: MachineIntegrityKey;
}> => {
  const initialized = await initializeRuntimeHomeIdentity({
    writer: "package_local_initializer",
    explicitOpenClawHome: home,
    env: {},
    defaultHome: home,
    now: () => new Date(CONFIGURATION_FIXTURE_START)
  });
  return {
    db: new DatabaseSync(initialized.resolution.databasePath),
    homeId: initialized.homeIdentity.home_id,
    canonicalHome: initialized.resolution.resolvedHome,
    integrityKey: initialized.integrityKey
  };
};

export const createConfigurationFixtureRegistry = (): PackagedProfileRegistry =>
  createBoundMinimumProfileRegistry({
    packageName: "@alan512/experienceengine",
    packageVersion: "0.4.8",
    packageBuildId: CONFIGURATION_FIXTURE_PACKAGE_BUILD_ID,
    publishedAt: CONFIGURATION_FIXTURE_START
  });

export const createConfigurationFixturePackageIdentity = (
  registry: PackagedProfileRegistry
): RuntimePackageGenerationIdentity => ({
  package_name: registry.package_name,
  package_version: registry.package_version,
  package_generation_id: "pkg-runtime-configuration-fixture",
  artifact_integrity: "artifact-runtime-configuration-fixture",
  install_record_identity: "install-runtime-configuration-fixture",
  plugin_entrypoint: "dist/plugin/openclaw-plugin.js",
  supervisor_entrypoint: "dist/runtime/package/supervisor-entrypoint.js",
  worker_entrypoint: "dist/runtime/package/worker-entrypoint.js",
  supervisor_protocol_version: "runtime-supervisor-v1",
  worker_protocol_version: "runtime-worker-v1",
  control_protocol_version: "runtime-control-v1",
  profile_registry_digest: registry.registry_digest,
  min_read_schema_version: "legacy-learning-v0",
  max_read_schema_version: "runtime-schema-v1",
  min_write_schema_version: "legacy-learning-v0",
  max_write_schema_version: "runtime-schema-v1",
  target_schema_version: "legacy-learning-v0",
  published_channel: "local_test"
});

const reasoningRoute = (routeId: string): RuntimeRouteDefinition => ({
  route_id: routeId,
  provider_family: "openai_compatible",
  model_or_deployment_identity: "fixture-reasoning-model",
  endpoint_identity: "https://fixture.invalid/v1/chat/completions",
  auth_mode: "api_key",
  secret_refs: ["EXPERIENCE_ENGINE_DISTILLER_API_KEY"],
  provider_adapter_version: "runtime-provider-adapter-v1",
  request_schema_version: "reasoning-request-v1",
  response_schema_version: "reasoning-response-v1"
});

const embeddingRoute = (): RuntimeRouteDefinition => ({
  route_id: "embedding-primary",
  provider_family: "embedding_api",
  model_or_deployment_identity: "fixture-embedding-model",
  endpoint_identity: "https://fixture.invalid/v1/embeddings",
  auth_mode: "api_key",
  secret_refs: ["OPENAI_API_KEY"],
  provider_adapter_version: "runtime-embedding-adapter-v1",
  request_schema_version: "embedding-request-v1",
  response_schema_version: "embedding-response-v1"
});

export const createConfigurationFixtureSettings = (): RuntimeConfigurationSettings => ({
  settings_schema_version: CONFIGURATION_SETTINGS_SCHEMA_VERSION,
  quality_profile: "custom",
  profile_id: "custom-contract-v1",
  profile_version: "1.0.0",
  custom_profile_acknowledged: true,
  legacy_rule_mode: {
    enabled: false,
    label: "legacy_rule_compatibility"
  },
  capability_routes: {
    learning_gate: {
      enabled: true,
      required_for_production: true,
      contract_version: "learning-gate-contract-v1",
      primary_route: reasoningRoute("learning-gate-primary"),
      fallback_routes: [],
      fallback_trigger_codes: []
    },
    distillation: {
      enabled: true,
      required_for_production: true,
      contract_version: "distillation-contract-v1",
      primary_route: reasoningRoute("distillation-primary"),
      fallback_routes: [reasoningRoute("distillation-fallback")],
      fallback_trigger_codes: ["EE_PROVIDER_TRANSIENT", "EE_PROVIDER_RATE_LIMITED"]
    },
    embedding: {
      enabled: true,
      required_for_production: true,
      contract_version: "embedding-contract-v1",
      primary_route: embeddingRoute(),
      fallback_routes: [],
      fallback_trigger_codes: []
    },
    sync_second_opinion: {
      enabled: false,
      required_for_production: false,
      contract_version: "sync-second-opinion-contract-v1",
      primary_route: null,
      fallback_routes: [],
      fallback_trigger_codes: []
    },
    hybrid_postmortem: {
      enabled: false,
      required_for_production: false,
      contract_version: "hybrid-postmortem-contract-v1",
      primary_route: null,
      fallback_routes: [],
      fallback_trigger_codes: []
    }
  }
});

export const createConfigurationFixtureSecrets = (): RuntimeConfigurationSecrets => ({
  secrets_schema_version: CONFIGURATION_SECRETS_SCHEMA_VERSION,
  values: {
    EXPERIENCE_ENGINE_DISTILLER_API_KEY: "fixture-distiller-secret",
    OPENAI_API_KEY: "fixture-embedding-secret"
  }
});

export const createConfigurationFixtureCandidate = (options: {
  homeId: string;
  integrityKey: MachineIntegrityKey;
  generationId?: string;
  parentGenerationId?: string | null;
  settings?: RuntimeConfigurationSettings;
  secrets?: RuntimeConfigurationSecrets;
  env?: NodeJS.ProcessEnv;
}): {
  candidate: RuntimeConfigurationCandidate;
  registry: PackagedProfileRegistry;
  packageIdentity: RuntimePackageGenerationIdentity;
  effectiveRouteSetId: string;
  validationRecords: RuntimeValidationRecord[];
} => {
  const generationId = options.generationId ?? "config-generation-1";
  const settings = options.settings ?? createConfigurationFixtureSettings();
  const secrets = options.secrets ?? createConfigurationFixtureSecrets();
  const registry = createConfigurationFixtureRegistry();
  const packageIdentity = createConfigurationFixturePackageIdentity(registry);
  const profileEntry = registry.entries[0];
  const overrideSnapshot = createSupportedRouteOverrideSnapshot({
    env: options.env ?? {},
    integrityKey: options.integrityKey
  });
  const effectiveRouteSetId = computeEffectiveRouteSetId({
    homeId: options.homeId,
    configurationGenerationId: generationId,
    packageGenerationId: packageIdentity.package_generation_id,
    overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
    settings,
    secrets,
    integrityKey: options.integrityKey
  });
  const validationRecords: RuntimeValidationRecord[] = [];
  for (const capability of ["learning_gate", "distillation", "embedding"] as const) {
    const configured = settings.capability_routes[capability];
    for (const route of [
      ...(configured.primary_route ? [configured.primary_route] : []),
      ...configured.fallback_routes
    ]) {
      validationRecords.push(createCapabilityValidationRecord({
        validationRecordId: `validation-${capability}-${route.route_id}`,
        configurationGenerationId: generationId,
        homeId: options.homeId,
        packageGenerationId: packageIdentity.package_generation_id,
        capability,
        route,
        effectiveRouteSetId,
        overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
        qualityProfile: settings.quality_profile,
        profileId: settings.profile_id,
        profileVersion: settings.profile_version,
        profileRegistry: registry,
        profileEntry,
        secrets,
        integrityKey: options.integrityKey,
        probe: {
          reachable: true,
          contract_valid: true,
          response_schema_valid: true,
          latency_ms: 15,
          response_size_bytes: 128,
          embedding_vector: capability === "embedding" ? [0.1, 0.2, 0.3] : null,
          failure_code: null
        },
        validatedAt: CONFIGURATION_FIXTURE_START
      }));
    }
  }
  const candidate: RuntimeConfigurationCandidate = {
    generationId,
    parentGenerationId: options.parentGenerationId ?? null,
    settings,
    secrets,
    validationState: {
      validation_schema_version: VALIDATION_STATE_SCHEMA_VERSION,
      records: validationRecords
    },
    packageIdentity,
    profileRegistry: registry,
    profileSelectionContext: CONFIGURATION_FIXTURE_PROFILE_SELECTION_CONTEXT,
    overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
    createdByInstanceId: "configuration-fixture-initializer",
    createdAt: CONFIGURATION_FIXTURE_START
  };
  return {
    candidate,
    registry,
    packageIdentity,
    effectiveRouteSetId,
    validationRecords
  };
};
