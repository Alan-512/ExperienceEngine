import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import {
  DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES
} from "../runtime/activation/constants.js";
import {
  createS6LearningQueueMaintenanceAuthorityProvider
} from "../runtime/activation/authority.js";
import {
  DeferredOpenClawRuntimeNativeService,
  type DeferredOpenClawRuntimeBinding,
  type OpenClawRuntimeLifecycleContext,
  type OpenClawRuntimeNativeService
} from "../runtime/activation/native-service.js";
import {
  createProductionOpenClawRuntimeService,
  createUnavailableOpenClawRuntimeNativeService
} from "../runtime/activation/production-service.js";
import {
  createOperatingSystemProcessStartTokenResolver
} from "../runtime/activation/process-identity.js";
import {
  RuntimePackageLocalServiceController
} from "../runtime/activation/service-controller.js";
import {
  RuntimeGatewayActivationHandshakeCoordinator,
  type RuntimeGatewayHandshakeContextProvider
} from "../runtime/activation/orchestrator.js";
import {
  recoverCurrentRuntimeConfigurationRouteAuthority
} from "../runtime/activation/configuration-route-authority.js";
import {
  inspectOpenClawRuntimeStatus
} from "../runtime/activation/status.js";
import type {
  RuntimeCapabilityRouteAuthorityProvider,
  RuntimeCapabilityRouteAuthorityEvidence,
  VerifiedPackageClosureEvidence
} from "../runtime/activation/types.js";
import {
  RUNTIME_CONFIGURATION_CAPABILITIES
} from "../runtime/configuration/constants.js";
import type {
  CoreLearningQualityProjection
} from "../runtime/configuration/product-boundaries.js";
import type {
  RuntimeCapabilityProductState
} from "../runtime/configuration/types.js";
import {
  RUNTIME_CONTROL_SCHEMA_VERSION
} from "../runtime/identity/constants.js";
import {
  initializeRuntimeHomeIdentity
} from "../runtime/identity/control-plane-bootstrap.js";
import {
  createGatewayRuntimeIdentityEnvelope
} from "../runtime/identity/binding.js";
import {
  resolveCanonicalRuntimeHome
} from "../runtime/identity/home-identity.js";
import {
  RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
  RUNTIME_WORKER_PROTOCOL_VERSION
} from "../runtime/process/constants.js";
import {
  configureRuntimeSqlitePolicy
} from "../runtime/schema/sqlite-policy.js";
import {
  initializeRuntimeSchemaMetadata
} from "../runtime/schema/migration-authority.js";
import {
  RUNTIME_SCHEMA_VERSION_ORDER
} from "../runtime/schema/constants.js";
import {
  assertRuntimeClosureManifest,
  createRuntimeClosureManifest
} from "../runtime/package/closure-manifest.js";
import {
  canonicalJson,
  createRuntimePackageGenerationIdentity,
  sha256Text
} from "../runtime/package/package-generation.js";
import {
  readPersistedOpenClawInstallState,
  type PersistedOpenClawInstallState
} from "./openclaw-install-state.js";
import { bootstrapDatabase } from "../store/sqlite/db.js";

class OpenClawProductionRuntimeBindingError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "OpenClawProductionRuntimeBindingError";
  }
}

const assertNonEmpty = (value: string | undefined, code: string, field: string): string => {
  if (!value || value.trim().length === 0) {
    throw new OpenClawProductionRuntimeBindingError(
      code,
      `${field} is required for installed OpenClaw production runtime binding.`
    );
  }
  return value;
};

const assertInstallRecord = (options: {
  state: PersistedOpenClawInstallState | null;
  expectedVersion: string;
  expectedDataDir: string;
  expectedSqlitePath: string;
}): PersistedOpenClawInstallState => {
  const state = options.state;
  if (!state) {
    throw new OpenClawProductionRuntimeBindingError(
      "EE_OPENCLAW_INSTALL_RECORD_REQUIRED",
      "The persisted OpenClaw install record is required before production runtime activation."
    );
  }
  if (
    state.adapter !== "openclaw" ||
    state.hostWiring?.wired !== true ||
    state.installedVersion !== options.expectedVersion ||
    !state.installedAt ||
    !Number.isFinite(Date.parse(state.installedAt)) ||
    !state.installMode ||
    !state.installSource ||
    resolve(state.dataDir ?? "") !== resolve(options.expectedDataDir) ||
    resolve(state.sqlitePath ?? "") !== resolve(options.expectedSqlitePath)
  ) {
    throw new OpenClawProductionRuntimeBindingError(
      "EE_OPENCLAW_INSTALL_RECORD_MISMATCH",
      "The persisted OpenClaw install record does not match the loaded package and canonical runtime home."
    );
  }
  return state;
};

export const deriveOpenClawInstallRecordIdentity = (options: {
  installState: PersistedOpenClawInstallState;
  packageRoot: string;
  stateDir: string;
  closureManifestDigest: string;
  packageBuildId: string;
}): string => `install_${sha256Text(canonicalJson({
  adapter: options.installState.adapter,
  installed_at: options.installState.installedAt,
  installed_version: options.installState.installedVersion,
  install_mode: options.installState.installMode,
  install_source: options.installState.installSource,
  host_wiring: options.installState.hostWiring,
  package_root: resolve(options.packageRoot),
  host_state_dir: resolve(options.stateDir),
  closure_manifest_digest: options.closureManifestDigest,
  package_build_id: options.packageBuildId
}))}`;

const conservativeCapabilityStates = (): RuntimeCapabilityProductState[] =>
  RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => ({
    capability,
    required_for_production: DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES.includes(
      capability as typeof DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES[number]
    ),
    validation_status: "missing",
    benchmark_assurance: "unbenchmarked",
    runtime_health: "unknown_warming",
    active_route_kind: "none"
  }));

const conservativeQualityProjection = (): CoreLearningQualityProjection => ({
  quality_profile: "custom",
  profile_id: "installed-runtime-unverified",
  profile_version: "1",
  setup_state: "incomplete",
  validation_state: "missing",
  benchmark_assurance: "unbenchmarked",
  runtime_health: "paused",
  core_learning_quality: "not_production_ready",
  production_ready: false,
  queue_claiming_enabled: false,
  semantic_production_writes_enabled: false,
  capability_states: conservativeCapabilityStates()
});

export const bindInstalledOpenClawProductionRuntime = async (options: {
  packageRoot: string;
  config: ExperienceEngineConfig;
  lifecycleContext?: OpenClawRuntimeLifecycleContext;
  interactionActive?: boolean;
  routeAuthorityProvider?: RuntimeCapabilityRouteAuthorityProvider;
  handshakeContextProvider?: RuntimeGatewayHandshakeContextProvider;
  now?: () => Date;
}): Promise<DeferredOpenClawRuntimeBinding> => {
  const packageRoot = resolve(assertNonEmpty(
    options.packageRoot,
    "EE_OPENCLAW_RUNTIME_ROOT_REQUIRED",
    "OpenClaw plugin rootDir"
  ));
  const stateDir = resolve(assertNonEmpty(
    options.lifecycleContext?.stateDir,
    "EE_OPENCLAW_RUNTIME_STATE_DIR_REQUIRED",
    "OpenClaw service stateDir"
  ));
  const canonicalResolution = resolveCanonicalRuntimeHome({
    explicitOpenClawHome: options.config.dataDir
  });
  if (resolve(options.config.sqlitePath) !== resolve(canonicalResolution.databasePath)) {
    throw new OpenClawProductionRuntimeBindingError(
      "EE_OPENCLAW_RUNTIME_DATABASE_PATH_MISMATCH",
      "Configured sqlitePath must equal the canonical runtime-home database path."
    );
  }

  const closure = assertRuntimeClosureManifest(packageRoot);
  const closureManifestDigest = assertNonEmpty(
    closure.closureManifestDigest,
    "EE_RUNTIME_CLOSURE_INVALID",
    "closure manifest digest"
  );
  const packageBuildId = assertNonEmpty(
    closure.packageBuildId,
    "EE_RUNTIME_CLOSURE_INVALID",
    "package build id"
  );
  const manifest = createRuntimeClosureManifest(packageRoot);
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    overrides: {
      dataDir: options.config.dataDir,
      sqlitePath: options.config.sqlitePath,
      captureDir: options.config.captureDir
    }
  });
  const installState = assertInstallRecord({
    state: readPersistedOpenClawInstallState(paths.installStatePath),
    expectedVersion: manifest.package_version,
    expectedDataDir: canonicalResolution.resolvedHome,
    expectedSqlitePath: canonicalResolution.databasePath
  });
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const packageIdentity = createRuntimePackageGenerationIdentity({
    manifest,
    artifactIntegrity: `sha256:${closureManifestDigest}`,
    installRecordIdentity: deriveOpenClawInstallRecordIdentity({
      installState,
      packageRoot,
      stateDir,
      closureManifestDigest,
      packageBuildId
    }),
    publishedChannel: "local_test",
    compatibility: {
      supervisor_protocol_version: RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
      worker_protocol_version: RUNTIME_WORKER_PROTOCOL_VERSION,
      control_protocol_version: RUNTIME_CONTROL_SCHEMA_VERSION,
      min_read_schema_version: RUNTIME_SCHEMA_VERSION_ORDER[0],
      max_read_schema_version:
        RUNTIME_SCHEMA_VERSION_ORDER[RUNTIME_SCHEMA_VERSION_ORDER.length - 1],
      min_write_schema_version: RUNTIME_SCHEMA_VERSION_ORDER[0],
      max_write_schema_version:
        RUNTIME_SCHEMA_VERSION_ORDER[RUNTIME_SCHEMA_VERSION_ORDER.length - 1],
      target_schema_version: RUNTIME_SCHEMA_VERSION_ORDER[0]
    }
  });
  const packageClosure: VerifiedPackageClosureEvidence = {
    verified: true,
    package_identity: packageIdentity,
    closure_manifest_digest: closureManifestDigest,
    evidence_class: "local_pack",
    verified_at: observedAt
  };
  const home = await initializeRuntimeHomeIdentity({
    writer: "gateway_service_controller",
    explicitOpenClawHome: canonicalResolution.resolvedHome,
    now: options.now
  });
  const runtimeIdentityEnvelope = createGatewayRuntimeIdentityEnvelope({
    resolution: home.resolution,
    home: home.homeIdentity,
    package: packageIdentity
  });
  const db = new DatabaseSync(home.resolution.databasePath);
  try {
    configureRuntimeSqlitePolicy(db, {
      accessMode: "read_write",
      role: "plugin"
    });
    bootstrapDatabase(db);
    initializeRuntimeSchemaMetadata({
      db,
      homeId: home.homeIdentity.home_id,
      writer: "package_local_initializer",
      verifyCurrentSchema() {
        return undefined;
      }
    });
    const gatewayProcessStartToken =
      createOperatingSystemProcessStartTokenResolver()(process.pid);
    const gatewayInstanceId = `gateway_${randomUUID()}`;
    const resolvePackageGeneration = (generationId: string) =>
      generationId === packageIdentity.package_generation_id
        ? { packageRoot, packageClosure }
        : undefined;
    const recoveredRouteAuthority =
      options.routeAuthorityProvider && options.handshakeContextProvider
        ? undefined
        : await recoverCurrentRuntimeConfigurationRouteAuthority({
          db,
          canonicalHome: home.resolution.resolvedHome,
          homeId: home.homeIdentity.home_id,
          packageRoot,
          packageBuildId,
          packageIdentity,
          integrityKey: home.integrityKey
        });
    const routeAuthorityProvider = options.routeAuthorityProvider ??
      recoveredRouteAuthority?.routeAuthorityProvider;
    const handshakeContextProvider = options.handshakeContextProvider ??
      recoveredRouteAuthority?.handshakeContextProvider;
    const activationHandshakeCoordinator =
      routeAuthorityProvider && handshakeContextProvider
        ? new RuntimeGatewayActivationHandshakeCoordinator({
          db,
          homeId: home.homeIdentity.home_id,
          writer: {
            kind: "gateway_service_controller",
            gateway_instance_id: gatewayInstanceId,
            gateway_process_start_token: gatewayProcessStartToken,
            plugin_package_generation_id:
              packageIdentity.package_generation_id
          },
          routeAuthorityProvider,
          contextProvider: handshakeContextProvider
        })
        : undefined;
    const controller = new RuntimePackageLocalServiceController({
      db,
      homeId: home.homeIdentity.home_id,
      gatewayInstanceId,
      gatewayProcessId: process.pid,
      gatewayProcessStartToken,
      currentPluginPackageGenerationId: packageIdentity.package_generation_id,
      runtimeIdentityEnvelope,
      resolvePackageGeneration,
      activationHandshakeCoordinator
    });
    const qualityProjection = recoveredRouteAuthority?.qualityProjection ??
      conservativeQualityProjection();
    const service = createProductionOpenClawRuntimeService({
      db,
      homeId: home.homeIdentity.home_id,
      gatewayInstanceId,
      gatewayProcessStartToken,
      currentPluginPackageGenerationId: packageIdentity.package_generation_id,
      controller,
      statusProvider: () => inspectOpenClawRuntimeStatus({
        db,
        homeId: home.homeIdentity.home_id,
        interactionActive: options.interactionActive ?? true,
        packageInstalled: true,
        qualityProjection,
        routeAuthorities:
          recoveredRouteAuthority?.snapshotRouteAuthorities() ?? []
      }),
      resolvePackageGeneration,
      maintenanceAuthorityProvider:
        createS6LearningQueueMaintenanceAuthorityProvider({
          routeAuthorityProvider
        }),
      initializeOrResume: () => controller.start()
    });
    return {
      service,
      dispose: () => db.close()
    };
  } catch (error) {
    db.close();
    throw error;
  }
};

export const createDefaultInstalledOpenClawRuntimeService = (options: {
  packageRoot: string;
  config: ExperienceEngineConfig;
  interactionActive?: boolean;
  routeAuthorityProvider?: RuntimeCapabilityRouteAuthorityProvider;
  handshakeContextProvider?: RuntimeGatewayHandshakeContextProvider;
}): OpenClawRuntimeNativeService => new DeferredOpenClawRuntimeNativeService(
  (lifecycleContext) => bindInstalledOpenClawProductionRuntime({
    packageRoot: options.packageRoot,
    config: options.config,
    lifecycleContext,
    interactionActive: options.interactionActive,
    routeAuthorityProvider: options.routeAuthorityProvider,
    handshakeContextProvider: options.handshakeContextProvider
  }),
  createUnavailableOpenClawRuntimeNativeService({
    reason: "installed_package_runtime_not_bound_until_service_start",
    interactionActive: options.interactionActive ?? true
  })
);

export const OPENCLAW_INSTALLED_PRODUCTION_BINDING_CONTRACT = Object.freeze({
  requires_verified_closure: true,
  requires_persisted_install_record: true,
  requires_host_state_dir: true,
  canonical_database_path_required: true,
  published_channel_without_registry_evidence: "local_test",
  default_quality_projection: "not_production_ready",
  handshake_request_requires_verified_route_authority: true,
  default_current_configuration_recovery: true,
  commands_share_deferred_service_object: true
});
