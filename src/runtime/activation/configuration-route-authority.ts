import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  RUNTIME_CONFIGURATION_CAPABILITIES,
  type RuntimeConfigurationCapability
} from "../configuration/constants.js";
import {
  RuntimeConfigurationGenerationRepository,
  readRuntimeConfigurationPointer
} from "../configuration/generation.js";
import {
  deriveCoreLearningQualityProjection,
  type CoreLearningQualityProjection
} from "../configuration/product-boundaries.js";
import {
  createRuntimeRouteEnvelope
} from "../configuration/route-authority.js";
import {
  loadPackagedProfileRegistry
} from "../configuration/registry.js";
import {
  RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH
} from "../package/closure-manifest.js";
import type {
  RuntimeCapabilityProductState,
  RuntimeProfileSelectionContext,
  RuntimeValidationRecord,
  VerifiedRuntimeConfigurationGeneration
} from "../configuration/types.js";
import type {
  MachineIntegrityKey,
  RuntimePackageGenerationIdentity
} from "../identity/types.js";
import {
  PACKAGE_ACTIVATION_TIMING_POLICY
} from "../process/constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import type {
  RuntimeCapabilityRouteAuthorityEvidence,
  RuntimeCapabilityRouteAuthorityProvider
} from "./types.js";
import type {
  RuntimeGatewayHandshakeContextProvider
} from "./orchestrator.js";

export const OPENCLAW_RUNTIME_PROFILE_SELECTION_CONTEXT = Object.freeze({
  hostApiVersion: "2026.4.1",
  gatewayVersion: "2026.4.1"
} as const);

export type RecoveredRuntimeConfigurationRouteAuthority = {
  verifiedGeneration: VerifiedRuntimeConfigurationGeneration;
  qualityProjection: CoreLearningQualityProjection;
  routeAuthorityProvider: RuntimeCapabilityRouteAuthorityProvider;
  handshakeContextProvider: RuntimeGatewayHandshakeContextProvider;
  snapshotRouteAuthorities: () => RuntimeCapabilityRouteAuthorityEvidence[];
};

const selectionContext = (
  packageIdentity: RuntimePackageGenerationIdentity
): RuntimeProfileSelectionContext => ({
  currentEeVersion: packageIdentity.package_version,
  nodeVersion: process.versions.node,
  platform: process.platform,
  architecture: process.arch,
  hostApiVersion:
    OPENCLAW_RUNTIME_PROFILE_SELECTION_CONTEXT.hostApiVersion,
  gatewayVersion:
    OPENCLAW_RUNTIME_PROFILE_SELECTION_CONTEXT.gatewayVersion
});

const primaryValidationRecord = (options: {
  generation: VerifiedRuntimeConfigurationGeneration;
  capability: RuntimeConfigurationCapability;
  effectiveRouteSetId: string;
  routeFingerprint: string | null;
}): RuntimeValidationRecord | undefined => {
  const route = options.generation.settings.capability_routes[
    options.capability
  ].primary_route;
  if (!route || !options.routeFingerprint) {
    return undefined;
  }
  return options.generation.validationState.records.find((record) =>
    record.capability === options.capability &&
    record.route_id === route.route_id &&
    record.route_fingerprint === options.routeFingerprint &&
    record.effective_route_set_id === options.effectiveRouteSetId
  );
};

const capabilityProductStates = (options: {
  generation: VerifiedRuntimeConfigurationGeneration;
  effectiveRouteSetId: string;
  primaryFingerprints: ReadonlyMap<RuntimeConfigurationCapability, string>;
}): RuntimeCapabilityProductState[] => RUNTIME_CONFIGURATION_CAPABILITIES.map(
  (capability) => {
    const configured = options.generation.settings.capability_routes[capability];
    const record = primaryValidationRecord({
      generation: options.generation,
      capability,
      effectiveRouteSetId: options.effectiveRouteSetId,
      routeFingerprint: options.primaryFingerprints.get(capability) ?? null
    });
    if (!configured.enabled) {
      return {
        capability,
        required_for_production: configured.required_for_production,
        validation_status: record?.validation_status ?? "missing",
        benchmark_assurance: record?.benchmark_assurance ?? "unbenchmarked",
        runtime_health: "disabled",
        active_route_kind: "none"
      };
    }
    const current = record?.validation_status === "valid";
    return {
      capability,
      required_for_production: configured.required_for_production,
      validation_status: record?.validation_status ?? "missing",
      benchmark_assurance: record?.benchmark_assurance ?? "unbenchmarked",
      runtime_health: current ? "healthy" : "blocked",
      active_route_kind: current ? "primary" : "none"
    };
  }
);

export const recoverCurrentRuntimeConfigurationRouteAuthority = async (options: {
  db: DatabaseSync;
  canonicalHome: string;
  homeId: string;
  packageRoot: string;
  packageBuildId: string;
  packageIdentity: RuntimePackageGenerationIdentity;
  integrityKey: MachineIntegrityKey;
  clock?: RuntimeProcessAuthorityClock;
}): Promise<RecoveredRuntimeConfigurationRouteAuthority | undefined> => {
  const profileRegistry = loadPackagedProfileRegistry({
    path: join(
      options.packageRoot,
      ...RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH.split("/")
    ),
    expectedPackageName: options.packageIdentity.package_name,
    expectedPackageVersion: options.packageIdentity.package_version,
    expectedPackageBuildId: options.packageBuildId
  });
  if (
    profileRegistry.registry_digest !==
      options.packageIdentity.profile_registry_digest
  ) {
    throw new Error(
      "Packaged profile registry digest does not match package generation identity."
    );
  }
  const repository = new RuntimeConfigurationGenerationRepository(
    options.db,
    options.canonicalHome,
    options.homeId
  );
  const generation = await repository.loadCurrent({
    expectedPackageGenerationId:
      options.packageIdentity.package_generation_id,
    profileRegistry,
    profileSelectionContext: selectionContext(options.packageIdentity)
  });
  if (!generation) {
    return undefined;
  }
  const createdAt = new Date().toISOString();
  const envelope = createRuntimeRouteEnvelope({
    homeId: options.homeId,
    configurationGenerationId: generation.manifest.generation_id,
    packageGenerationId: options.packageIdentity.package_generation_id,
    overrideSnapshotFingerprint:
      generation.manifest.override_snapshot_fingerprint,
    settings: generation.settings,
    secrets: generation.secrets,
    validationRecords: generation.validationState.records,
    profileRegistry,
    profileSelectionContext: generation.profileSelectionContext,
    integrityKey: options.integrityKey,
    createdAt
  });
  const primaryFingerprints = new Map<RuntimeConfigurationCapability, string>();
  for (const capability of RUNTIME_CONFIGURATION_CAPABILITIES) {
    const configured = generation.settings.capability_routes[capability];
    const fingerprint = envelope.capabilities[capability]
      .primary_route_fingerprint;
    if (configured.enabled && fingerprint) {
      primaryFingerprints.set(capability, fingerprint);
    }
  }
  const capabilityStates = capabilityProductStates({
    generation,
    effectiveRouteSetId: envelope.effective_route_set_id,
    primaryFingerprints
  });
  const qualityProjection = deriveCoreLearningQualityProjection({
    settings: generation.settings,
    capabilityStates
  });
  const currentPointerMatches = (db: DatabaseSync): boolean => {
    const pointer = readRuntimeConfigurationPointer(db, options.homeId);
    return Boolean(
      pointer &&
      pointer.generation_id === generation.manifest.generation_id &&
      pointer.manifest_digest === generation.manifestDigest
    );
  };
  const clock = options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
  const evidenceFor = (
    capability: RuntimeConfigurationCapability,
    observedAt: string
  ): RuntimeCapabilityRouteAuthorityEvidence | undefined => {
    const fingerprint = primaryFingerprints.get(capability);
    const record = primaryValidationRecord({
      generation,
      capability,
      effectiveRouteSetId: envelope.effective_route_set_id,
      routeFingerprint: fingerprint ?? null
    });
    if (
      !fingerprint ||
      !record ||
      record.validation_status !== "valid"
    ) {
      return undefined;
    }
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-capability-route-authority-v1",
      home_id: options.homeId,
      configuration_generation_id: generation.manifest.generation_id,
      package_generation_id:
        options.packageIdentity.package_generation_id,
      effective_route_set_id: envelope.effective_route_set_id,
      effective_route_revision:
        RUNTIME_CONFIGURATION_CAPABILITIES.indexOf(capability) + 1,
      capability,
      route_fingerprint: fingerprint,
      validation_current: true,
      observed_at: observedAt,
      expires_at: new Date(
        toProcessAuthorityEpochMs(observedAt) +
          PACKAGE_ACTIVATION_TIMING_POLICY.production_handshake_ttl_ms
      ).toISOString()
    };
  };
  const routeAuthorityProvider: RuntimeCapabilityRouteAuthorityProvider = {
    getCapabilityRouteAuthorityInTransaction(input) {
      if (
        !input.db.isTransaction ||
        input.homeId !== options.homeId ||
        input.configurationGenerationId !== generation.manifest.generation_id ||
        input.packageGenerationId !==
          options.packageIdentity.package_generation_id ||
        input.effectiveRouteSetId !== envelope.effective_route_set_id ||
        !currentPointerMatches(input.db)
      ) {
        return {
          available: false,
          fresh: false,
          authority_contract_version: "s6-capability-route-authority-v1",
          reason: "route_authority_not_current"
        };
      }
      const observedAt = clock.captureObservedNowInTransaction(input.db);
      return evidenceFor(input.capability, observedAt) ?? {
        available: false,
        fresh: false,
        authority_contract_version: "s6-capability-route-authority-v1",
        reason: "route_authority_unavailable"
      };
    }
  };
  const handshakeContextProvider: RuntimeGatewayHandshakeContextProvider = () =>
    currentPointerMatches(options.db)
      ? {
        configurationGenerationId: generation.manifest.generation_id,
        effectiveRouteSetId: envelope.effective_route_set_id
      }
      : undefined;
  const snapshotRouteAuthorities = (): RuntimeCapabilityRouteAuthorityEvidence[] => {
    if (!currentPointerMatches(options.db)) {
      return [];
    }
    const observedAt = new Date().toISOString();
    return RUNTIME_CONFIGURATION_CAPABILITIES.flatMap((capability) => {
      const evidence = evidenceFor(capability, observedAt);
      return evidence ? [evidence] : [];
    });
  };
  return {
    verifiedGeneration: generation,
    qualityProjection,
    routeAuthorityProvider,
    handshakeContextProvider,
    snapshotRouteAuthorities
  };
};

export const RECOVERED_CONFIGURATION_ROUTE_AUTHORITY_CONTRACT = Object.freeze({
  pointer_selected_generation_only: true,
  immutable_generation_verification_reused: true,
  profile_registry_digest_required: true,
  exact_validation_record_required: true,
  pointer_change_invalidates_evidence: true,
  route_evidence_ttl_ms:
    PACKAGE_ACTIVATION_TIMING_POLICY.production_handshake_ttl_ms
});
