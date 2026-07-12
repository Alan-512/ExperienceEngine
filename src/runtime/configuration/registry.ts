import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import {
  BENCHMARK_ASSURANCE_LEVELS,
  PROFILE_ENTRY_STATUSES,
  PROFILE_REGISTRY_SCHEMA_VERSION,
  QUALITY_PROFILES,
  ROUTE_IDENTITY_MATCH_KINDS,
  RUNTIME_CONFIGURATION_CAPABILITIES
} from "./constants.js";
import { RuntimeConfigurationError } from "./errors.js";
import type {
  PackagedProfileRegistry,
  ProfileCapabilityContract,
  ProfileRegistryEntry,
  ProfileRouteSpec
} from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseComparableVersion = (value: string, field: string): [number, number, number] => {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/u.exec(value.trim());
  if (!match) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `${field} contains unsupported version ${value}.`
    );
  }
  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10)
  ];
};

const compareVersions = (left: string, right: string): number => {
  const leftParts = parseComparableVersion(left, "observed version");
  const rightParts = parseComparableVersion(right, "required version");
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta < 0 ? -1 : 1;
    }
  }
  return 0;
};

const matchesVersionRange = (
  version: string,
  range: string,
  field: string
): boolean => {
  const clauses = range.trim().split(/\s+/u).filter(Boolean);
  if (clauses.length === 0) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `${field} must not be empty.`
    );
  }
  return clauses.every((clause) => {
    const match = /^(>=|<=|>|<|=)?(v?\d+(?:\.\d+){0,2}(?:[-+].*)?)$/u.exec(clause);
    if (!match) {
      throw new RuntimeConfigurationError(
        "EE_PROFILE_INCOMPATIBLE",
        `${field} contains unsupported range clause ${clause}.`
      );
    }
    const comparison = compareVersions(version, match[2]);
    switch (match[1] ?? "=") {
      case ">=": return comparison >= 0;
      case "<=": return comparison <= 0;
      case ">": return comparison > 0;
      case "<": return comparison < 0;
      case "=": return comparison === 0;
      default: return false;
    }
  });
};

const canonicalEntryContent = (
  entry: Omit<ProfileRegistryEntry, "entry_digest"> | ProfileRegistryEntry
): Omit<ProfileRegistryEntry, "entry_digest"> => {
  const { entry_digest: _entryDigest, ...content } = entry as ProfileRegistryEntry;
  return content;
};

export const computeProfileEntryDigest = (
  entry: Omit<ProfileRegistryEntry, "entry_digest"> | ProfileRegistryEntry
): string => sha256Text(canonicalJson(canonicalEntryContent(entry)));

const canonicalRegistryContent = (
  registry: Omit<PackagedProfileRegistry, "registry_digest"> | PackagedProfileRegistry
): Omit<PackagedProfileRegistry, "registry_digest"> => {
  const { registry_digest: _registryDigest, ...content } = registry as PackagedProfileRegistry;
  return content;
};

export const computeProfileRegistryDigest = (
  registry: Omit<PackagedProfileRegistry, "registry_digest"> | PackagedProfileRegistry
): string => sha256Text(canonicalJson(canonicalRegistryContent(registry)));

const customCapabilityContracts = (): Record<
  typeof RUNTIME_CONFIGURATION_CAPABILITIES[number],
  ProfileCapabilityContract
> => ({
  learning_gate: {
    required_for_production: true,
    contract_version: "learning-gate-contract-v1",
    route_spec_id: "custom-reasoning-route-v1",
    benchmark_assurance: "unbenchmarked",
    benchmark_evidence_ref: null
  },
  distillation: {
    required_for_production: true,
    contract_version: "distillation-contract-v1",
    route_spec_id: "custom-reasoning-route-v1",
    benchmark_assurance: "unbenchmarked",
    benchmark_evidence_ref: null
  },
  embedding: {
    required_for_production: true,
    contract_version: "embedding-contract-v1",
    route_spec_id: "custom-embedding-route-v1",
    benchmark_assurance: "unbenchmarked",
    benchmark_evidence_ref: null
  },
  sync_second_opinion: {
    required_for_production: false,
    contract_version: "sync-second-opinion-contract-v1",
    route_spec_id: "custom-reasoning-route-v1",
    benchmark_assurance: "unbenchmarked",
    benchmark_evidence_ref: null
  },
  hybrid_postmortem: {
    required_for_production: false,
    contract_version: "hybrid-postmortem-contract-v1",
    route_spec_id: "custom-reasoning-route-v1",
    benchmark_assurance: "unbenchmarked",
    benchmark_evidence_ref: null
  }
});

const customRouteSpecs = (): Record<string, ProfileRouteSpec> => ({
  "custom-reasoning-route-v1": {
    provider_family: "custom",
    identity_match_kind: "deployment_fingerprint_set",
    allowed_model_or_deployment_fingerprints: [],
    endpoint_policy: "operator_configured_private_identity",
    auth_modes: ["api_key", "google_adc", "ambient", "none"],
    provider_adapter_version: "runtime-provider-adapter-v1"
  },
  "custom-embedding-route-v1": {
    provider_family: "custom_embedding",
    identity_match_kind: "deployment_fingerprint_set",
    allowed_model_or_deployment_fingerprints: [],
    endpoint_policy: "operator_configured_private_identity",
    auth_modes: ["api_key", "ambient", "none"],
    provider_adapter_version: "runtime-embedding-adapter-v1"
  }
});

export const createBoundMinimumProfileRegistry = (options: {
  packageName: string;
  packageVersion: string;
  packageBuildId: string;
  publishedAt?: string;
}): PackagedProfileRegistry => {
  const entryWithoutDigest: Omit<ProfileRegistryEntry, "entry_digest"> = {
    profile_id: "custom-contract-v1",
    profile_version: "1.0.0",
    quality_profile: "custom",
    entry_status: "active",
    supersedes_profile_version: null,
    minimum_ee_version: options.packageVersion,
    maximum_ee_version: null,
    compatibility: {
      node_version_range: ">=20.0.0",
      os_families: ["win32", "linux", "darwin"],
      architectures: ["x64", "arm64"],
      host_api_range: ">=2026.4.1",
      gateway_version_range: ">=2026.4.1"
    },
    capability_contracts: customCapabilityContracts(),
    route_specs: customRouteSpecs(),
    embedding_profile: "custom-embedding-contract-v1",
    benchmark_evidence: null,
    expected_cost_class: "operator_selected",
    expected_latency_class: "operator_selected",
    published_at: options.publishedAt ?? "2026-07-12T00:00:00.000Z"
  };
  const entry: ProfileRegistryEntry = {
    ...entryWithoutDigest,
    entry_digest: computeProfileEntryDigest(entryWithoutDigest)
  };
  const registryWithoutDigest: Omit<PackagedProfileRegistry, "registry_digest"> = {
    registry_schema_version: PROFILE_REGISTRY_SCHEMA_VERSION,
    registry_version: "1.0.0",
    package_name: options.packageName,
    package_version: options.packageVersion,
    package_build_id: options.packageBuildId,
    entries: [entry]
  };
  return {
    ...registryWithoutDigest,
    registry_digest: computeProfileRegistryDigest(registryWithoutDigest)
  };
};

const assertExactStringArray = (
  value: unknown,
  field: string
): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      `${field} must be a string array.`
    );
  }
  return value as string[];
};

const assertCapabilityContracts = (
  value: unknown,
  field: string
): Record<typeof RUNTIME_CONFIGURATION_CAPABILITIES[number], ProfileCapabilityContract> => {
  if (!isRecord(value)) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      `${field} must be an object.`
    );
  }
  const observed = Object.keys(value).sort();
  const expected = [...RUNTIME_CONFIGURATION_CAPABILITIES].sort();
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      `${field} is not exhaustive.`
    );
  }
  const result = {} as Record<
    typeof RUNTIME_CONFIGURATION_CAPABILITIES[number],
    ProfileCapabilityContract
  >;
  for (const capability of RUNTIME_CONFIGURATION_CAPABILITIES) {
    const contract = value[capability];
    if (
      !isRecord(contract) ||
      typeof contract.required_for_production !== "boolean" ||
      typeof contract.contract_version !== "string" ||
      typeof contract.route_spec_id !== "string" ||
      typeof contract.benchmark_assurance !== "string" ||
      !BENCHMARK_ASSURANCE_LEVELS.includes(
        contract.benchmark_assurance as typeof BENCHMARK_ASSURANCE_LEVELS[number]
      ) ||
      !(
        contract.benchmark_evidence_ref === null ||
        (
          typeof contract.benchmark_evidence_ref === "string" &&
          contract.benchmark_evidence_ref.length > 0
        )
      )
    ) {
      throw new RuntimeConfigurationError(
        "EE_PROFILE_REGISTRY_INVALID",
        `${field}.${capability} is invalid.`
      );
    }
    result[capability] = contract as ProfileCapabilityContract;
  }
  return result;
};

const parseRouteSpecs = (value: unknown): Record<string, ProfileRouteSpec> => {
  if (!isRecord(value)) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      "route_specs must be an object."
    );
  }
  const result: Record<string, ProfileRouteSpec> = {};
  for (const [routeSpecId, routeSpec] of Object.entries(value)) {
    if (
      !routeSpecId ||
      !isRecord(routeSpec) ||
      typeof routeSpec.provider_family !== "string" ||
      typeof routeSpec.identity_match_kind !== "string" ||
      !ROUTE_IDENTITY_MATCH_KINDS.includes(
        routeSpec.identity_match_kind as typeof ROUTE_IDENTITY_MATCH_KINDS[number]
      ) ||
      typeof routeSpec.endpoint_policy !== "string" ||
      typeof routeSpec.provider_adapter_version !== "string"
    ) {
      throw new RuntimeConfigurationError(
        "EE_PROFILE_REGISTRY_INVALID",
        `Route spec ${routeSpecId || "<missing>"} is invalid.`
      );
    }
    result[routeSpecId] = {
      provider_family: routeSpec.provider_family,
      identity_match_kind: routeSpec.identity_match_kind as ProfileRouteSpec["identity_match_kind"],
      allowed_model_or_deployment_fingerprints: assertExactStringArray(
        routeSpec.allowed_model_or_deployment_fingerprints,
        `route_specs.${routeSpecId}.allowed_model_or_deployment_fingerprints`
      ),
      endpoint_policy: routeSpec.endpoint_policy,
      auth_modes: assertExactStringArray(
        routeSpec.auth_modes,
        `route_specs.${routeSpecId}.auth_modes`
      ),
      provider_adapter_version: routeSpec.provider_adapter_version
    };
  }
  return result;
};

const parseBenchmarkEvidence = (
  value: unknown
): ProfileRegistryEntry["benchmark_evidence"] => {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.evidence_id !== "string" ||
    value.evidence_id.length === 0 ||
    typeof value.evidence_version !== "string" ||
    value.evidence_version.length === 0 ||
    typeof value.benchmark_protocol_version !== "string" ||
    value.benchmark_protocol_version.length === 0 ||
    typeof value.scenario_set_digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.scenario_set_digest) ||
    typeof value.report_digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.report_digest) ||
    typeof value.publication_status !== "string" ||
    value.publication_status.length === 0
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      "Profile benchmark evidence is incomplete or malformed."
    );
  }
  return {
    evidence_id: value.evidence_id,
    evidence_version: value.evidence_version,
    benchmark_protocol_version: value.benchmark_protocol_version,
    scenario_set_digest: value.scenario_set_digest,
    report_digest: value.report_digest,
    publication_status: value.publication_status
  };
};

const parseEntry = (value: unknown): ProfileRegistryEntry => {
  if (!isRecord(value)) {
    throw new RuntimeConfigurationError("EE_PROFILE_REGISTRY_INVALID", "Registry entry is invalid.");
  }
  if (
    typeof value.profile_id !== "string" ||
    typeof value.profile_version !== "string" ||
    typeof value.quality_profile !== "string" ||
    !QUALITY_PROFILES.includes(value.quality_profile as typeof QUALITY_PROFILES[number]) ||
    typeof value.entry_status !== "string" ||
    !PROFILE_ENTRY_STATUSES.includes(value.entry_status as typeof PROFILE_ENTRY_STATUSES[number]) ||
    !(value.supersedes_profile_version === null || typeof value.supersedes_profile_version === "string") ||
    typeof value.minimum_ee_version !== "string" ||
    !(value.maximum_ee_version === null || typeof value.maximum_ee_version === "string") ||
    !isRecord(value.compatibility) ||
    typeof value.compatibility.node_version_range !== "string" ||
    typeof value.compatibility.host_api_range !== "string" ||
    typeof value.compatibility.gateway_version_range !== "string" ||
    typeof value.embedding_profile !== "string" ||
    typeof value.expected_cost_class !== "string" ||
    typeof value.expected_latency_class !== "string" ||
    typeof value.published_at !== "string" ||
    typeof value.entry_digest !== "string"
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      `Registry entry ${String(value.profile_id ?? "<missing>")} is incomplete.`
    );
  }
  const entry: ProfileRegistryEntry = {
    profile_id: value.profile_id,
    profile_version: value.profile_version,
    quality_profile: value.quality_profile as ProfileRegistryEntry["quality_profile"],
    entry_status: value.entry_status as ProfileRegistryEntry["entry_status"],
    supersedes_profile_version: value.supersedes_profile_version,
    minimum_ee_version: value.minimum_ee_version,
    maximum_ee_version: value.maximum_ee_version,
    compatibility: {
      node_version_range: value.compatibility.node_version_range,
      os_families: assertExactStringArray(
        value.compatibility.os_families,
        "compatibility.os_families"
      ),
      architectures: assertExactStringArray(
        value.compatibility.architectures,
        "compatibility.architectures"
      ),
      host_api_range: value.compatibility.host_api_range,
      gateway_version_range: value.compatibility.gateway_version_range
    },
    capability_contracts: assertCapabilityContracts(
      value.capability_contracts,
      "capability_contracts"
    ),
    route_specs: parseRouteSpecs(value.route_specs),
    embedding_profile: value.embedding_profile,
    benchmark_evidence: parseBenchmarkEvidence(value.benchmark_evidence),
    expected_cost_class: value.expected_cost_class,
    expected_latency_class: value.expected_latency_class,
    published_at: value.published_at,
    entry_digest: value.entry_digest
  };
  for (const capability of RUNTIME_CONFIGURATION_CAPABILITIES) {
    if (!entry.route_specs[entry.capability_contracts[capability].route_spec_id]) {
      throw new RuntimeConfigurationError(
        "EE_PROFILE_REGISTRY_INVALID",
        `Capability ${capability} references a missing route spec.`
      );
    }
  }
  if (entry.entry_digest !== computeProfileEntryDigest(entry)) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      `Registry entry ${entry.profile_id}@${entry.profile_version} digest mismatch.`
    );
  }
  if (
    entry.quality_profile === "evaluated_recommended" &&
    (
      entry.benchmark_evidence === null ||
      Object.values(entry.capability_contracts).some(
        (contract) =>
          contract.benchmark_assurance === "unbenchmarked" ||
          contract.benchmark_evidence_ref !== entry.benchmark_evidence?.evidence_id
      )
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      "Evaluated recommended entries require benchmark-backed capability contracts."
    );
  }
  if (
    entry.quality_profile === "custom" &&
    (
      entry.benchmark_evidence !== null ||
      Object.values(entry.capability_contracts).some(
        (contract) =>
          contract.benchmark_assurance !== "unbenchmarked" ||
          contract.benchmark_evidence_ref !== null
      )
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      "Custom profile entries must remain unbenchmarked and cannot reference benchmark evidence."
    );
  }
  return entry;
};

export const parseAndVerifyProfileRegistry = (options: {
  value: unknown;
  expectedPackageName: string;
  expectedPackageVersion: string;
  expectedPackageBuildId: string;
}): PackagedProfileRegistry => {
  if (
    !isRecord(options.value) ||
    options.value.registry_schema_version !== PROFILE_REGISTRY_SCHEMA_VERSION ||
    typeof options.value.registry_version !== "string" ||
    options.value.package_name !== options.expectedPackageName ||
    options.value.package_version !== options.expectedPackageVersion ||
    options.value.package_build_id !== options.expectedPackageBuildId ||
    typeof options.value.registry_digest !== "string" ||
    !Array.isArray(options.value.entries) ||
    options.value.entries.length === 0
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      "Packaged profile registry identity is invalid."
    );
  }
  const entries = options.value.entries.map(parseEntry);
  const identities = new Set<string>();
  for (const entry of entries) {
    const identity = `${entry.profile_id}\0${entry.profile_version}`;
    if (identities.has(identity)) {
      throw new RuntimeConfigurationError(
        "EE_PROFILE_REGISTRY_INVALID",
        `Duplicate profile registry entry ${entry.profile_id}@${entry.profile_version}.`
      );
    }
    identities.add(identity);
  }
  const registry: PackagedProfileRegistry = {
    registry_schema_version: options.value.registry_schema_version,
    registry_version: options.value.registry_version,
    package_name: options.value.package_name,
    package_version: options.value.package_version,
    package_build_id: options.value.package_build_id,
    registry_digest: options.value.registry_digest,
    entries
  };
  if (registry.registry_digest !== computeProfileRegistryDigest(registry)) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      "Packaged profile registry digest mismatch."
    );
  }
  return registry;
};

export const loadPackagedProfileRegistry = (options: {
  path: string;
  expectedPackageName: string;
  expectedPackageVersion: string;
  expectedPackageBuildId: string;
}): PackagedProfileRegistry => {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(options.path, "utf8"));
  } catch (error) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_REGISTRY_INVALID",
      `Packaged profile registry is unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return parseAndVerifyProfileRegistry({ ...options, value });
};

export const writeBoundMinimumProfileRegistry = (options: {
  path: string;
  packageName: string;
  packageVersion: string;
  packageBuildId: string;
}): PackagedProfileRegistry => {
  const registry = createBoundMinimumProfileRegistry(options);
  mkdirSync(dirname(options.path), { recursive: true });
  writeFileSync(options.path, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return registry;
};

export const selectProfileRegistryEntry = (options: {
  registry: PackagedProfileRegistry;
  qualityProfile: "evaluated_recommended" | "custom";
  profileId: string;
  profileVersion: string;
  currentEeVersion: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  architecture?: string;
  hostApiVersion: string;
  gatewayVersion: string;
  customAcknowledged?: boolean;
  allowDeprecatedCurrentSelection?: boolean;
}): ProfileRegistryEntry => {
  const entry = options.registry.entries.find(
    (candidate) =>
      candidate.profile_id === options.profileId &&
      candidate.profile_version === options.profileVersion &&
      candidate.quality_profile === options.qualityProfile
  );
  if (!entry) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `No exact profile entry ${options.profileId}@${options.profileVersion} exists.`
    );
  }
  if (
    entry.entry_status === "revoked" ||
    (entry.entry_status === "deprecated" && !options.allowDeprecatedCurrentSelection)
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `Profile ${entry.profile_id}@${entry.profile_version} is ${entry.entry_status}.`
    );
  }
  if (options.qualityProfile === "custom" && !options.customAcknowledged) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      "Custom profile selection requires explicit unbenchmarked-quality acknowledgment."
    );
  }
  if (
    compareVersions(options.currentEeVersion, entry.minimum_ee_version) < 0 ||
    (
      entry.maximum_ee_version !== null &&
      compareVersions(options.currentEeVersion, entry.maximum_ee_version) > 0
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `Profile ${entry.profile_id}@${entry.profile_version} is incompatible with EE ${options.currentEeVersion}.`
    );
  }
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;
  if (
    !entry.compatibility.os_families.includes(platform) ||
    !entry.compatibility.architectures.includes(architecture)
  ) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `Profile ${entry.profile_id}@${entry.profile_version} is incompatible with ${platform}/${architecture}.`
    );
  }
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  if (!matchesVersionRange(
    nodeVersion,
    entry.compatibility.node_version_range,
    "node_version_range"
  )) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `Profile ${entry.profile_id}@${entry.profile_version} requires ${entry.compatibility.node_version_range}.`
    );
  }
  if (!matchesVersionRange(
    options.hostApiVersion,
    entry.compatibility.host_api_range,
    "host_api_range"
  )) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `Profile ${entry.profile_id}@${entry.profile_version} is incompatible with host API ${options.hostApiVersion}.`
    );
  }
  if (!matchesVersionRange(
    options.gatewayVersion,
    entry.compatibility.gateway_version_range,
    "gateway_version_range"
  )) {
    throw new RuntimeConfigurationError(
      "EE_PROFILE_INCOMPATIBLE",
      `Profile ${entry.profile_id}@${entry.profile_version} is incompatible with gateway ${options.gatewayVersion}.`
    );
  }
  return entry;
};
