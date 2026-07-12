import type { MachineIntegrityKey } from "../identity/types.js";
import {
  canonicalJson
} from "../package/package-generation.js";
import {
  CONFIGURATION_INVALIDATION_BINDINGS,
  RUNTIME_CONFIGURATION_CAPABILITIES,
  VALIDATION_STATE_SCHEMA_VERSION
} from "./constants.js";
import { RuntimeConfigurationError } from "./errors.js";
import {
  fingerprintResolvedSecretMaterial,
  fingerprintValidationIdentity
} from "./integrity.js";
import {
  computeProfileEntryDigest,
  computeProfileRegistryDigest,
  parseAndVerifyProfileRegistry,
  selectProfileRegistryEntry
} from "./registry.js";
import type {
  CapabilityValidationProbeResult,
  PackagedProfileRegistry,
  ProfileRegistryEntry,
  RuntimeConfigurationSecrets,
  RuntimeConfigurationSettings,
  RuntimeProfileSelectionContext,
  RuntimeRouteDefinition,
  RuntimeValidationState,
  RuntimeValidationRecord
} from "./types.js";

export type RuntimeValidationBindingExpectation = Pick<
  RuntimeValidationRecord,
  typeof CONFIGURATION_INVALIDATION_BINDINGS[number]
>;

const assertFiniteNonNegative = (
  value: number | null,
  field: string
): void => {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      `${field} must be null or a finite non-negative number.`
    );
  }
};

const assertResolvedSecrets = (
  route: RuntimeRouteDefinition,
  secrets: RuntimeConfigurationSecrets
): Array<[string, string]> => {
  const refs = [...new Set(route.secret_refs)].sort();
  if (refs.length !== route.secret_refs.length) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      `Route ${route.route_id} contains duplicate secret references.`
    );
  }
  return refs.map((ref) => {
    const value = secrets.values[ref];
    if (typeof value !== "string" || value.length === 0) {
      throw new RuntimeConfigurationError(
        "EE_VALIDATION_BINDING_INVALID",
        `Route ${route.route_id} has unresolved secret reference ${ref}.`
      );
    }
    return [ref, value];
  });
};

export type RuntimeRouteIdentityFingerprints = {
  secretRefSetFingerprint: string;
  resolvedSecretMaterialFingerprint: string;
  modelOrDeploymentFingerprint: string;
  endpointIdentityFingerprint: string;
  routeFingerprint: string;
  authIdentityFingerprint: string;
};

export const deriveRouteIdentityFingerprints = (options: {
  capability: RuntimeValidationRecord["capability"];
  route: RuntimeRouteDefinition;
  secrets: RuntimeConfigurationSecrets;
  integrityKey: MachineIntegrityKey;
}): RuntimeRouteIdentityFingerprints => {
  const resolvedSecrets = assertResolvedSecrets(options.route, options.secrets);
  const secretRefSetFingerprint = fingerprintValidationIdentity(
    options.integrityKey,
    canonicalJson(resolvedSecrets.map(([ref]) => ref))
  );
  const normalizedAuthBinding = canonicalJson({
    capability: options.capability,
    route_id: options.route.route_id,
    provider_family: options.route.provider_family,
    auth_mode: options.route.auth_mode,
    secret_refs: resolvedSecrets.map(([ref]) => ref)
  });
  const resolvedSecretMaterialFingerprint = fingerprintResolvedSecretMaterial(
    options.integrityKey,
    normalizedAuthBinding,
    canonicalJson(resolvedSecrets)
  );
  const modelOrDeploymentFingerprint = fingerprintValidationIdentity(
    options.integrityKey,
    canonicalJson({
      provider_family: options.route.provider_family,
      model_or_deployment_identity: options.route.model_or_deployment_identity
    })
  );
  const endpointIdentityFingerprint = fingerprintValidationIdentity(
    options.integrityKey,
    canonicalJson({
      provider_family: options.route.provider_family,
      endpoint_identity: options.route.endpoint_identity
    })
  );
  const authIdentityFingerprint = fingerprintValidationIdentity(
    options.integrityKey,
    canonicalJson({
      auth_mode: options.route.auth_mode,
      secret_ref_set_fingerprint: secretRefSetFingerprint,
      resolved_secret_material_fingerprint: resolvedSecretMaterialFingerprint
    })
  );
  const routeFingerprint = fingerprintValidationIdentity(
    options.integrityKey,
    canonicalJson({
      route_id: options.route.route_id,
      provider_family: options.route.provider_family,
      model_or_deployment_fingerprint: modelOrDeploymentFingerprint,
      endpoint_identity_fingerprint: endpointIdentityFingerprint,
      auth_mode: options.route.auth_mode,
      secret_ref_set_fingerprint: secretRefSetFingerprint,
      resolved_secret_material_fingerprint: resolvedSecretMaterialFingerprint,
      provider_adapter_version: options.route.provider_adapter_version,
      request_schema_version: options.route.request_schema_version,
      response_schema_version: options.route.response_schema_version
    })
  );
  return {
    secretRefSetFingerprint,
    resolvedSecretMaterialFingerprint,
    modelOrDeploymentFingerprint,
    endpointIdentityFingerprint,
    routeFingerprint,
    authIdentityFingerprint
  };
};

const matchingProfileContract = (options: {
  entry: ProfileRegistryEntry;
  capability: RuntimeValidationRecord["capability"];
  route: RuntimeRouteDefinition;
  modelOrDeploymentFingerprint: string;
}): ProfileRegistryEntry["capability_contracts"][RuntimeValidationRecord["capability"]] => {
  const contract = options.entry.capability_contracts[options.capability];
  const routeSpec = options.entry.route_specs[contract.route_spec_id];
  if (!routeSpec) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      `Profile contract ${options.capability} references missing route spec.`
    );
  }
  const providerMatches =
    options.entry.quality_profile === "custom" ||
    routeSpec.provider_family === options.route.provider_family;
  const authMatches = routeSpec.auth_modes.includes(options.route.auth_mode);
  const adapterMatches =
    routeSpec.provider_adapter_version === options.route.provider_adapter_version;
  const identityMatches =
    routeSpec.allowed_model_or_deployment_fingerprints.length === 0 ||
    routeSpec.allowed_model_or_deployment_fingerprints.includes(
      options.modelOrDeploymentFingerprint
    );
  if (!providerMatches || !authMatches || !identityMatches || !adapterMatches) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      `Route ${options.route.route_id} does not match profile contract ${options.capability}.`
    );
  }
  return contract;
};

const isStrictIsoTimestamp = (value: string): boolean => {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
};

const assertPersistedValidationMetadata = (record: RuntimeValidationRecord): void => {
  if (!record.validation_record_id || !isStrictIsoTimestamp(record.validated_at)) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Validation records require a non-empty id and canonical ISO timestamp."
    );
  }
  assertFiniteNonNegative(record.latency_ms, "latency_ms");
  assertFiniteNonNegative(record.response_size_bytes, "response_size_bytes");
  if (
    record.embedding_vector_dimensions !== null &&
    (
      !Number.isSafeInteger(record.embedding_vector_dimensions) ||
      record.embedding_vector_dimensions <= 0
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "embedding_vector_dimensions must be null or a positive safe integer."
    );
  }
  if (
    record.capability === "embedding" &&
    record.validation_status === "valid" &&
    record.embedding_vector_dimensions === null
  ) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Valid embedding records require vector dimensions."
    );
  }
  if (record.capability !== "embedding" && record.embedding_vector_dimensions !== null) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      `Capability ${record.capability} cannot persist embedding dimensions.`
    );
  }
  if (record.validation_status === "valid" && record.failure_code !== null) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Valid validation records cannot retain a failure code."
    );
  }
  if (record.validation_status === "invalid" && !record.failure_code) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Invalid validation records require a stable failure code."
    );
  }
};

export const assertExactConfigurationValidationState = (options: {
  validationState: RuntimeValidationState;
  settings: RuntimeConfigurationSettings;
  secrets: RuntimeConfigurationSecrets;
  profileRegistry: PackagedProfileRegistry;
  integrityKey: MachineIntegrityKey;
  homeId: string;
  packageGenerationId: string;
  configurationGenerationId: string;
  effectiveRouteSetId: string;
  overrideSnapshotFingerprint: string;
  selectionMode: "new_generation" | "existing_generation";
  profileSelectionContext: RuntimeProfileSelectionContext;
}): ProfileRegistryEntry => {
  if (options.validationState.validation_schema_version !== VALIDATION_STATE_SCHEMA_VERSION) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Validation state schema version does not match the frozen S4 contract."
    );
  }
  const profileRegistry = parseAndVerifyProfileRegistry({
    value: options.profileRegistry,
    expectedPackageName: options.profileRegistry.package_name,
    expectedPackageVersion: options.profileRegistry.package_version,
    expectedPackageBuildId: options.profileRegistry.package_build_id
  });
  if (profileRegistry.registry_digest !== computeProfileRegistryDigest(profileRegistry)) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Profile registry digest is invalid."
    );
  }
  const profileEntry = selectProfileRegistryEntry({
    registry: profileRegistry,
    qualityProfile: options.settings.quality_profile,
    profileId: options.settings.profile_id,
    profileVersion: options.settings.profile_version,
    currentEeVersion: options.profileSelectionContext.currentEeVersion,
    nodeVersion: options.profileSelectionContext.nodeVersion,
    platform: options.profileSelectionContext.platform,
    architecture: options.profileSelectionContext.architecture,
    hostApiVersion: options.profileSelectionContext.hostApiVersion,
    gatewayVersion: options.profileSelectionContext.gatewayVersion,
    customAcknowledged: options.settings.custom_profile_acknowledged,
    allowDeprecatedCurrentSelection: options.selectionMode === "existing_generation"
  });
  if (profileEntry.entry_digest !== computeProfileEntryDigest(profileEntry)) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Configuration profile selection digest is invalid."
    );
  }

  const recordIds = new Set<string>();
  const expectedRecordKeys = new Set<string>();
  const observedRecordKeys = new Set<string>();
  for (const record of options.validationState.records) {
    assertPersistedValidationMetadata(record);
    if (recordIds.has(record.validation_record_id)) {
      throw new RuntimeConfigurationError(
        "EE_VALIDATION_BINDING_INVALID",
        `Duplicate validation record id ${record.validation_record_id}.`
      );
    }
    recordIds.add(record.validation_record_id);
    observedRecordKeys.add(`${record.capability}\0${record.route_id}`);
  }
  if (observedRecordKeys.size !== options.validationState.records.length) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Each capability route must have at most one validation record."
    );
  }

  for (const capability of RUNTIME_CONFIGURATION_CAPABILITIES) {
    const configured = options.settings.capability_routes[capability];
    const contract = profileEntry.capability_contracts[capability];
    if (
      configured.required_for_production !== contract.required_for_production ||
      configured.contract_version !== contract.contract_version
    ) {
      throw new RuntimeConfigurationError(
        "EE_VALIDATION_BINDING_INVALID",
        `Capability ${capability} does not match its selected profile contract.`
      );
    }
    const routes = [
      ...(configured.primary_route ? [configured.primary_route] : []),
      ...configured.fallback_routes
    ];
    if (configured.enabled && routes.length === 0) {
      throw new RuntimeConfigurationError(
        "EE_VALIDATION_BINDING_INVALID",
        `Enabled capability ${capability} has no route to validate.`
      );
    }
    const routeIds = new Set<string>();
    for (const route of routes) {
      if (!route.route_id || routeIds.has(route.route_id)) {
        throw new RuntimeConfigurationError(
          "EE_VALIDATION_BINDING_INVALID",
          `Capability ${capability} contains an empty or duplicate route id.`
        );
      }
      routeIds.add(route.route_id);
      const recordKey = `${capability}\0${route.route_id}`;
      expectedRecordKeys.add(recordKey);
      const record = options.validationState.records.find((candidate) =>
        candidate.capability === capability && candidate.route_id === route.route_id
      );
      if (!record) {
        throw new RuntimeConfigurationError(
          "EE_VALIDATION_BINDING_INVALID",
          `Capability ${capability} route ${route.route_id} has no validation record.`
        );
      }
      const fingerprints = deriveRouteIdentityFingerprints({
        capability,
        route,
        secrets: options.secrets,
        integrityKey: options.integrityKey
      });
      const matchingContract = matchingProfileContract({
        entry: profileEntry,
        capability,
        route,
        modelOrDeploymentFingerprint: fingerprints.modelOrDeploymentFingerprint
      });
      const expectedAssurance = options.settings.quality_profile === "custom"
        ? "unbenchmarked"
        : matchingContract.benchmark_assurance;
      const expectedBindings: RuntimeValidationBindingExpectation = {
        home_id: options.homeId,
        package_generation_id: options.packageGenerationId,
        configuration_generation_id: options.configurationGenerationId,
        capability,
        route_fingerprint: fingerprints.routeFingerprint,
        effective_route_set_id: options.effectiveRouteSetId,
        provider_family: route.provider_family,
        model_or_deployment_fingerprint: fingerprints.modelOrDeploymentFingerprint,
        auth_mode: route.auth_mode,
        secret_ref_set_fingerprint: fingerprints.secretRefSetFingerprint,
        resolved_secret_material_fingerprint:
          fingerprints.resolvedSecretMaterialFingerprint,
        endpoint_identity_fingerprint: fingerprints.endpointIdentityFingerprint,
        quality_profile: options.settings.quality_profile,
        contract_version: matchingContract.contract_version,
        profile_version: options.settings.profile_version,
        provider_adapter_version: route.provider_adapter_version,
        request_schema_version: route.request_schema_version,
        response_schema_version: route.response_schema_version,
        profile_registry_digest: profileRegistry.registry_digest,
        benchmark_evidence_ref: matchingContract.benchmark_evidence_ref,
        override_snapshot_fingerprint: options.overrideSnapshotFingerprint
      };
      for (const field of CONFIGURATION_INVALIDATION_BINDINGS) {
        if (record[field] !== expectedBindings[field]) {
          throw new RuntimeConfigurationError(
            "EE_VALIDATION_BINDING_INVALID",
            `Validation record ${record.validation_record_id} mismatches ${field}.`
          );
        }
      }
      if (
        record.profile_id !== options.settings.profile_id ||
        record.benchmark_assurance !== expectedAssurance
      ) {
        throw new RuntimeConfigurationError(
          "EE_VALIDATION_BINDING_INVALID",
          `Validation record ${record.validation_record_id} mismatches profile identity or assurance.`
        );
      }
    }
  }
  if (
    expectedRecordKeys.size !== observedRecordKeys.size ||
    [...observedRecordKeys].some((key) => !expectedRecordKeys.has(key))
  ) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Validation state contains records for undeclared capability routes."
    );
  }
  return profileEntry;
};

const assertProbeContract = (options: {
  capability: RuntimeValidationRecord["capability"];
  probe: CapabilityValidationProbeResult;
}): { status: "valid" | "invalid"; embeddingDimensions: number | null } => {
  assertFiniteNonNegative(options.probe.latency_ms, "latency_ms");
  assertFiniteNonNegative(options.probe.response_size_bytes, "response_size_bytes");
  let embeddingDimensions: number | null = null;
  if (options.capability === "embedding") {
    const vector = options.probe.embedding_vector;
    if (
      options.probe.reachable &&
      options.probe.contract_valid &&
      options.probe.response_schema_valid &&
      (!vector || vector.length === 0 || vector.some((value) => !Number.isFinite(value)))
    ) {
      throw new RuntimeConfigurationError(
        "EE_VALIDATION_BINDING_INVALID",
        "A successful embedding probe requires a non-empty finite vector."
      );
    }
    embeddingDimensions = vector?.length ?? null;
  } else if (options.probe.embedding_vector !== null) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      `Capability ${options.capability} cannot persist an embedding vector probe.`
    );
  }
  const valid =
    options.probe.reachable &&
    options.probe.contract_valid &&
    options.probe.response_schema_valid &&
    (options.capability !== "embedding" || embeddingDimensions !== null);
  if (!valid && !options.probe.failure_code) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Invalid validation probes require a stable failure code."
    );
  }
  if (valid && options.probe.failure_code !== null) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Successful validation probes cannot retain a failure code."
    );
  }
  return { status: valid ? "valid" : "invalid", embeddingDimensions };
};

export const createCapabilityValidationRecord = (options: {
  validationRecordId: string;
  configurationGenerationId: string;
  homeId: string;
  packageGenerationId: string;
  capability: RuntimeValidationRecord["capability"];
  route: RuntimeRouteDefinition;
  effectiveRouteSetId: string;
  overrideSnapshotFingerprint: string;
  qualityProfile: RuntimeValidationRecord["quality_profile"];
  profileId: string;
  profileVersion: string;
  profileRegistry: PackagedProfileRegistry;
  profileEntry: ProfileRegistryEntry;
  secrets: RuntimeConfigurationSecrets;
  integrityKey: MachineIntegrityKey;
  probe: CapabilityValidationProbeResult;
  validatedAt: string;
}): RuntimeValidationRecord => {
  if (!RUNTIME_CONFIGURATION_CAPABILITIES.includes(options.capability)) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      `Unknown validation capability ${options.capability}.`
    );
  }
  if (
    options.profileRegistry.registry_digest.length === 0 ||
    options.profileEntry.profile_id !== options.profileId ||
    options.profileEntry.profile_version !== options.profileVersion ||
    options.profileEntry.quality_profile !== options.qualityProfile
  ) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Validation profile binding does not match the selected registry entry."
    );
  }
  const fingerprints = deriveRouteIdentityFingerprints({
    capability: options.capability,
    route: options.route,
    secrets: options.secrets,
    integrityKey: options.integrityKey
  });
  const contract = matchingProfileContract({
    entry: options.profileEntry,
    capability: options.capability,
    route: options.route,
    modelOrDeploymentFingerprint: fingerprints.modelOrDeploymentFingerprint
  });
  if (
    !contract.contract_version ||
    !options.route.request_schema_version ||
    !options.route.response_schema_version ||
    !options.route.provider_adapter_version
  ) {
    throw new RuntimeConfigurationError(
      "EE_VALIDATION_BINDING_INVALID",
      "Route contract, adapter, request schema, and response schema must be explicit."
    );
  }
  const probe = assertProbeContract({
    capability: options.capability,
    probe: options.probe
  });
  return {
    validation_record_id: options.validationRecordId,
    configuration_generation_id: options.configurationGenerationId,
    home_id: options.homeId,
    package_generation_id: options.packageGenerationId,
    capability: options.capability,
    route_id: options.route.route_id,
    route_fingerprint: fingerprints.routeFingerprint,
    effective_route_set_id: options.effectiveRouteSetId,
    override_snapshot_fingerprint: options.overrideSnapshotFingerprint,
    provider_family: options.route.provider_family,
    model_or_deployment_fingerprint: fingerprints.modelOrDeploymentFingerprint,
    auth_mode: options.route.auth_mode,
    secret_ref_set_fingerprint: fingerprints.secretRefSetFingerprint,
    resolved_secret_material_fingerprint: fingerprints.resolvedSecretMaterialFingerprint,
    endpoint_identity_fingerprint: fingerprints.endpointIdentityFingerprint,
    quality_profile: options.qualityProfile,
    contract_version: contract.contract_version,
    profile_id: options.profileId,
    profile_version: options.profileVersion,
    provider_adapter_version: options.route.provider_adapter_version,
    request_schema_version: options.route.request_schema_version,
    response_schema_version: options.route.response_schema_version,
    profile_registry_digest: options.profileRegistry.registry_digest,
    benchmark_evidence_ref: contract.benchmark_evidence_ref,
    validation_status: probe.status,
    benchmark_assurance: options.qualityProfile === "custom"
      ? "unbenchmarked"
      : contract.benchmark_assurance,
    validated_at: options.validatedAt,
    latency_ms: options.probe.latency_ms,
    response_size_bytes: options.probe.response_size_bytes,
    embedding_vector_dimensions: probe.embeddingDimensions,
    failure_code: options.probe.failure_code
  };
};

export class RuntimeCapabilityValidator {
  async validate(options: Omit<
    Parameters<typeof createCapabilityValidationRecord>[0],
    "probe"
  > & {
    probe: () => Promise<CapabilityValidationProbeResult> |
      CapabilityValidationProbeResult;
  }): Promise<RuntimeValidationRecord> {
    const probeResult = await options.probe();
    return createCapabilityValidationRecord({
      ...options,
      probe: probeResult
    });
  }
}

export const evaluateValidationRecordCurrent = (
  record: RuntimeValidationRecord,
  expected: RuntimeValidationBindingExpectation
): RuntimeValidationRecord["validation_status"] => {
  if (record.validation_status === "invalid" || record.validation_status === "missing") {
    return record.validation_status;
  }
  for (const field of CONFIGURATION_INVALIDATION_BINDINGS) {
    if (record[field] !== expected[field]) {
      return "stale";
    }
  }
  return record.validation_status === "valid" ? "valid" : "stale";
};

export const validationRecordsByCapability = (
  records: readonly RuntimeValidationRecord[]
): Record<RuntimeValidationRecord["capability"], RuntimeValidationRecord[]> => {
  const result: Record<
    RuntimeValidationRecord["capability"],
    RuntimeValidationRecord[]
  > = {
    learning_gate: [],
    distillation: [],
    embedding: [],
    sync_second_opinion: [],
    hybrid_postmortem: []
  };
  for (const record of records) {
    result[record.capability].push(record);
  }
  return result;
};
