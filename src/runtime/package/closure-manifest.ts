import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, posix, resolve, sep, win32 } from "node:path";
import {
  FIXED_CONTROL_PLANE_DDL
} from "../identity/control-plane-contract.js";
import {
  RUNTIME_CLOSURE_MANIFEST_VERSION
} from "../identity/constants.js";
import { RuntimeIdentityError } from "../identity/errors.js";
import type {
  RuntimeClosureAsset,
  RuntimeClosureManifest,
  RuntimeClosureManifestContent
} from "../identity/types.js";
import { canonicalJson, sha256Text } from "./package-generation.js";
import {
  loadPackagedProfileRegistry,
  writeBoundMinimumProfileRegistry
} from "../configuration/registry.js";

export const RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH =
  "dist/runtime/package/runtime-closure-manifest.json" as const;

export const RUNTIME_CONTROL_DDL_ASSET_RELATIVE_PATH =
  "dist/runtime/package/assets/control-plane-v1.sql" as const;

export const RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH =
  "dist/runtime/package/assets/profiles/registry.json" as const;

export const RUNTIME_MIGRATION_REGISTRY_RELATIVE_PATH =
  "dist/runtime/package/assets/migrations/registry.json" as const;

export const RUNTIME_PROCESS_AUTHORITY_REGISTRY_RELATIVE_PATH =
  "dist/runtime/package/assets/process/registry.json" as const;

export const RUNTIME_CLOSURE_REQUIRED_ENTRYPOINTS: Array<Omit<RuntimeClosureAsset, "sha256">> = [
  { role: "openclaw_plugin", path: "dist/plugin/openclaw-plugin.js" },
  { role: "package_local_supervisor", path: "dist/runtime/package/supervisor-entrypoint.js" },
  { role: "package_local_worker", path: "dist/runtime/package/worker-entrypoint.js" }
];

export const RUNTIME_CLOSURE_REQUIRED_RUNTIME_FILES: Array<Omit<RuntimeClosureAsset, "sha256">> = [
  { role: "runtime_identity_constants", path: "dist/runtime/identity/constants.js" },
  { role: "runtime_identity_errors", path: "dist/runtime/identity/errors.js" },
  { role: "runtime_home_identity", path: "dist/runtime/identity/home-identity.js" },
  { role: "machine_integrity_key", path: "dist/runtime/identity/integrity-key.js" },
  { role: "runtime_identity_binding", path: "dist/runtime/identity/binding.js" },
  { role: "fixed_control_contract", path: "dist/runtime/identity/control-plane-contract.js" },
  { role: "fixed_control_bootstrap", path: "dist/runtime/identity/control-plane-bootstrap.js" },
  { role: "runtime_identity_inspection", path: "dist/runtime/identity/inspection.js" },
  { role: "runtime_schema_constants", path: "dist/runtime/schema/constants.js" },
  { role: "runtime_schema_types", path: "dist/runtime/schema/types.js" },
  { role: "runtime_schema_errors", path: "dist/runtime/schema/errors.js" },
  { role: "runtime_schema_version", path: "dist/runtime/schema/schema-version.js" },
  { role: "runtime_sqlite_policy", path: "dist/runtime/schema/sqlite-policy.js" },
  { role: "runtime_schema_compatibility", path: "dist/runtime/schema/compatibility.js" },
  { role: "runtime_migration_authority", path: "dist/runtime/schema/migration-authority.js" },
  { role: "runtime_schema_inspection", path: "dist/runtime/schema/inspection.js" },
  { role: "runtime_process_constants", path: "dist/runtime/process/constants.js" },
  { role: "runtime_process_types", path: "dist/runtime/process/types.js" },
  { role: "runtime_process_errors", path: "dist/runtime/process/errors.js" },
  { role: "runtime_process_clock", path: "dist/runtime/process/clock.js" },
  { role: "runtime_process_database", path: "dist/runtime/process/database.js" },
  { role: "runtime_gateway_heartbeat", path: "dist/runtime/process/gateway-heartbeat.js" },
  { role: "runtime_launch_authority", path: "dist/runtime/process/launch-authority.js" },
  { role: "runtime_fresh_supervisor_authority", path: "dist/runtime/process/fresh-supervisor-authority.js" },
  { role: "runtime_supervisor_authority", path: "dist/runtime/process/supervisor-authority.js" },
  { role: "runtime_worker_authority", path: "dist/runtime/process/worker-authority.js" },
  { role: "runtime_process_lifecycle", path: "dist/runtime/process/process-lifecycle.js" },
  { role: "runtime_process_policy", path: "dist/runtime/process/lifecycle.js" },
  { role: "runtime_process_inspection", path: "dist/runtime/process/inspection.js" },
  { role: "runtime_process_registry", path: RUNTIME_PROCESS_AUTHORITY_REGISTRY_RELATIVE_PATH },
  { role: "runtime_configuration_constants", path: "dist/runtime/configuration/constants.js" },
  { role: "runtime_configuration_types", path: "dist/runtime/configuration/types.js" },
  { role: "runtime_configuration_errors", path: "dist/runtime/configuration/errors.js" },
  { role: "runtime_configuration_integrity", path: "dist/runtime/configuration/integrity.js" },
  { role: "runtime_profile_registry", path: "dist/runtime/configuration/registry.js" },
  { role: "runtime_configuration_generation", path: "dist/runtime/configuration/generation.js" },
  { role: "runtime_configuration_validation", path: "dist/runtime/configuration/validation.js" },
  { role: "runtime_route_authority", path: "dist/runtime/configuration/route-authority.js" },
  { role: "runtime_configuration_product_boundaries", path: "dist/runtime/configuration/product-boundaries.js" },
  { role: "runtime_configuration_inspection", path: "dist/runtime/configuration/inspection.js" },
  { role: "fenced_learning_queue_constants", path: "dist/runtime/learning-queue/constants.js" },
  { role: "fenced_learning_queue_types", path: "dist/runtime/learning-queue/types.js" },
  { role: "fenced_learning_queue_errors", path: "dist/runtime/learning-queue/errors.js" },
  { role: "fenced_learning_queue_authority", path: "dist/runtime/learning-queue/authority.js" },
  { role: "fenced_learning_queue_failure_policy", path: "dist/runtime/learning-queue/failure-policy.js" },
  { role: "fenced_learning_queue_delivery_policy", path: "dist/runtime/learning-queue/delivery-policy.js" },
  { role: "semantic_origin_provenance", path: "dist/runtime/learning-queue/provenance.js" },
  { role: "fenced_learning_queue_repository", path: "dist/runtime/learning-queue/repository.js" },
  { role: "fenced_learning_queue_inspection", path: "dist/runtime/learning-queue/inspection.js" },
  { role: "runtime_package_generation", path: "dist/runtime/package/package-generation.js" },
  { role: "runtime_closure_validator", path: "dist/runtime/package/closure-manifest.js" },
  { role: "profile_registry", path: RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH }
];

export const RUNTIME_CLOSURE_REQUIRED_SCHEMA_AND_MIGRATIONS: Array<Omit<RuntimeClosureAsset, "sha256">> = [
  { role: "legacy_learning_schema", path: "dist/store/sqlite/schema.sql" },
  { role: "fixed_control_plane_schema", path: RUNTIME_CONTROL_DDL_ASSET_RELATIVE_PATH },
  { role: "migration_registry", path: RUNTIME_MIGRATION_REGISTRY_RELATIVE_PATH }
];

const sha256Bytes = (value: Buffer): string => createHash("sha256").update(value).digest("hex");

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const assertSafePackageRelativePath = (path: string): void => {
  const normalized = path.replace(/\\/gu, "/");
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized.includes("\0") ||
    posix.isAbsolute(normalized) ||
    win32.isAbsolute(path) ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized === ".."
  ) {
    throw new RuntimeIdentityError(
      "EE_RUNTIME_CLOSURE_INVALID",
      `Runtime closure path is not package-relative: ${path}.`
    );
  }
};

const resolvePackageAsset = (packageRoot: string, packageRelativePath: string): string => {
  assertSafePackageRelativePath(packageRelativePath);
  const root = resolve(packageRoot);
  const asset = resolve(root, ...packageRelativePath.split("/"));
  if (asset !== root && !asset.startsWith(`${root}${sep}`)) {
    throw new RuntimeIdentityError(
      "EE_RUNTIME_CLOSURE_INVALID",
      `Runtime closure path escapes the package root: ${packageRelativePath}.`
    );
  }
  return asset;
};

const bindAssets = (
  packageRoot: string,
  declarations: Array<Omit<RuntimeClosureAsset, "sha256">>
): RuntimeClosureAsset[] => declarations.map((declaration) => {
  const absolutePath = resolvePackageAsset(packageRoot, declaration.path);
  let bytes: Buffer;
  try {
    bytes = readFileSync(absolutePath);
  } catch (error) {
    throw new RuntimeIdentityError(
      "EE_RUNTIME_CLOSURE_INVALID",
      `Required runtime asset is missing: ${declaration.role} (${declaration.path}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return {
    ...declaration,
    sha256: sha256Bytes(bytes)
  };
});

const digestSelectedPackageMetadata = (packageJson: Record<string, unknown>): {
  dependencyRequirementsDigest: string;
  compatibilityMetadataDigest: string;
} => ({
  dependencyRequirementsDigest: sha256Text(canonicalJson({
    engines: packageJson.engines ?? {},
    dependencies: packageJson.dependencies ?? {}
  })),
  compatibilityMetadataDigest: sha256Text(canonicalJson({
    openclaw: packageJson.openclaw ?? {},
    runtime_identity_contract: "phase-0.5a.1-freeze-2026-07-11",
    runtime_activation: "disabled_until_later_slices"
  }))
});

const createPackageBuildId = (options: {
  packageName: string;
  packageVersion: string;
  requiredEntrypoints: RuntimeClosureAsset[];
  requiredRuntimeFiles: RuntimeClosureAsset[];
  requiredSchemaAndMigrations: RuntimeClosureAsset[];
  dependencyRequirementsDigest: string;
  compatibilityMetadataDigest: string;
}): string => `build_${sha256Text(canonicalJson({
  package_name: options.packageName,
  package_version: options.packageVersion,
  required_entrypoints: options.requiredEntrypoints,
  required_runtime_files: options.requiredRuntimeFiles.filter(
    (asset) => asset.role !== "profile_registry"
  ),
  profile_registry_contract: RUNTIME_CLOSURE_REQUIRED_RUNTIME_FILES.find(
    (asset) => asset.role === "profile_registry"
  ),
  required_schema_and_migrations: options.requiredSchemaAndMigrations,
  dependency_requirements_digest: options.dependencyRequirementsDigest,
  compatibility_metadata_digest: options.compatibilityMetadataDigest
}))}`;

const readPackageIdentity = (packageRoot: string): {
  packageJson: Record<string, unknown>;
  packageName: string;
  packageVersion: string;
} => {
  const packageJson = readJson<Record<string, unknown>>(resolve(packageRoot, "package.json"));
  const packageName = packageJson.name;
  const packageVersion = packageJson.version;
  if (typeof packageName !== "string" || typeof packageVersion !== "string") {
    throw new RuntimeIdentityError(
      "EE_RUNTIME_CLOSURE_INVALID",
      "package.json must contain string name and version fields."
    );
  }
  return { packageJson, packageName, packageVersion };
};

const createRuntimeBuildIdentity = (packageRoot: string): {
  packageName: string;
  packageVersion: string;
  packageBuildId: string;
  metadataDigests: ReturnType<typeof digestSelectedPackageMetadata>;
} => {
  const { packageJson, packageName, packageVersion } = readPackageIdentity(packageRoot);
  const requiredEntrypoints = bindAssets(packageRoot, RUNTIME_CLOSURE_REQUIRED_ENTRYPOINTS);
  const requiredRuntimeFiles = bindAssets(
    packageRoot,
    RUNTIME_CLOSURE_REQUIRED_RUNTIME_FILES.filter((asset) => asset.role !== "profile_registry")
  );
  const requiredSchemaAndMigrations = bindAssets(
    packageRoot,
    RUNTIME_CLOSURE_REQUIRED_SCHEMA_AND_MIGRATIONS
  );
  const metadataDigests = digestSelectedPackageMetadata(packageJson);
  return {
    packageName,
    packageVersion,
    packageBuildId: createPackageBuildId({
      packageName,
      packageVersion,
      requiredEntrypoints,
      requiredRuntimeFiles,
      requiredSchemaAndMigrations,
      ...metadataDigests
    }),
    metadataDigests
  };
};

export const createRuntimeClosureManifest = (packageRoot: string): RuntimeClosureManifest => {
  const buildIdentity = createRuntimeBuildIdentity(packageRoot);
  const { packageName, packageVersion, packageBuildId, metadataDigests } = buildIdentity;
  const requiredEntrypoints = bindAssets(packageRoot, RUNTIME_CLOSURE_REQUIRED_ENTRYPOINTS);
  const requiredRuntimeFiles = bindAssets(packageRoot, RUNTIME_CLOSURE_REQUIRED_RUNTIME_FILES);
  const requiredSchemaAndMigrations = bindAssets(packageRoot, RUNTIME_CLOSURE_REQUIRED_SCHEMA_AND_MIGRATIONS);
  const profileRegistryAsset = requiredRuntimeFiles.find(
    (asset) => asset.role === "profile_registry"
  );
  if (!profileRegistryAsset) {
    throw new RuntimeIdentityError(
      "EE_RUNTIME_CLOSURE_INVALID",
      "Runtime closure profile registry asset is missing."
    );
  }

  const profileRegistryPath = resolvePackageAsset(
    packageRoot,
    RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH
  );
  const profileRegistry = loadPackagedProfileRegistry({
    path: profileRegistryPath,
    expectedPackageName: packageName,
    expectedPackageVersion: packageVersion,
    expectedPackageBuildId: packageBuildId
  });
  const content: RuntimeClosureManifestContent = {
    closure_manifest_version: RUNTIME_CLOSURE_MANIFEST_VERSION,
    package_name: packageName,
    package_version: packageVersion,
    package_build_id: packageBuildId,
    required_entrypoints: requiredEntrypoints,
    required_runtime_files: requiredRuntimeFiles,
    required_schema_and_migrations: requiredSchemaAndMigrations,
    profile_registry_digest: profileRegistry.registry_digest,
    dependency_requirements_digest: metadataDigests.dependencyRequirementsDigest,
    compatibility_metadata_digest: metadataDigests.compatibilityMetadataDigest
  };

  return {
    ...content,
    closure_manifest_digest: sha256Text(canonicalJson(content))
  };
};

export const writeRuntimePackageIdentityAssets = (packageRoot: string): RuntimeClosureManifest => {
  const controlDdlPath = resolvePackageAsset(packageRoot, RUNTIME_CONTROL_DDL_ASSET_RELATIVE_PATH);
  mkdirSync(dirname(controlDdlPath), { recursive: true });
  writeFileSync(controlDdlPath, FIXED_CONTROL_PLANE_DDL, "utf8");

  const buildIdentity = createRuntimeBuildIdentity(packageRoot);
  const profileRegistryPath = resolvePackageAsset(
    packageRoot,
    RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH
  );
  writeBoundMinimumProfileRegistry({
    path: profileRegistryPath,
    packageName: buildIdentity.packageName,
    packageVersion: buildIdentity.packageVersion,
    packageBuildId: buildIdentity.packageBuildId
  });

  const manifest = createRuntimeClosureManifest(packageRoot);
  const manifestPath = resolvePackageAsset(packageRoot, RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
};

export type RuntimeClosureValidationReport = {
  valid: boolean;
  manifestPath: string;
  closureManifestDigest?: string;
  packageBuildId?: string;
  issues: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readAssetGroup = (
  manifest: Record<string, unknown>,
  field: "required_entrypoints" | "required_runtime_files" | "required_schema_and_migrations",
  issues: string[]
): RuntimeClosureAsset[] => {
  const value = manifest[field];
  if (!Array.isArray(value)) {
    issues.push(`invalid_asset_group:${field}`);
    return [];
  }
  const assets: RuntimeClosureAsset[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.role !== "string" ||
      typeof item.path !== "string" ||
      typeof item.sha256 !== "string"
    ) {
      issues.push(`invalid_asset_record:${field}`);
      continue;
    }
    assets.push({ role: item.role, path: item.path, sha256: item.sha256 });
  }
  return assets;
};

export const validateRuntimeClosureManifest = (packageRoot: string): RuntimeClosureValidationReport => {
  const manifestPath = resolvePackageAsset(packageRoot, RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH);
  const issues: string[] = [];
  let rawManifest: unknown;
  try {
    rawManifest = readJson<unknown>(manifestPath);
  } catch (error) {
    return {
      valid: false,
      manifestPath,
      issues: [`manifest_unreadable:${error instanceof Error ? error.message : String(error)}`]
    };
  }

  if (!isRecord(rawManifest)) {
    return {
      valid: false,
      manifestPath,
      issues: ["manifest_invalid_shape"]
    };
  }
  const manifestRecord = rawManifest;
  const manifest = rawManifest as unknown as RuntimeClosureManifest;
  const requiredEntrypoints = readAssetGroup(manifestRecord, "required_entrypoints", issues);
  const requiredRuntimeFiles = readAssetGroup(manifestRecord, "required_runtime_files", issues);
  const requiredSchemaAndMigrations = readAssetGroup(
    manifestRecord,
    "required_schema_and_migrations",
    issues
  );
  const manifestAssets = [
    ...requiredEntrypoints,
    ...requiredRuntimeFiles,
    ...requiredSchemaAndMigrations
  ];

  if (manifest.closure_manifest_version !== RUNTIME_CLOSURE_MANIFEST_VERSION) {
    issues.push(`manifest_version:${manifest.closure_manifest_version}`);
  }
  const { closure_manifest_digest: observedDigest, ...content } = manifest;
  const expectedDigest = sha256Text(canonicalJson(content));
  if (observedDigest !== expectedDigest) {
    issues.push("closure_manifest_digest_mismatch");
  }

  const expectedRoles = new Map<string, string>([
    ...RUNTIME_CLOSURE_REQUIRED_ENTRYPOINTS,
    ...RUNTIME_CLOSURE_REQUIRED_RUNTIME_FILES,
    ...RUNTIME_CLOSURE_REQUIRED_SCHEMA_AND_MIGRATIONS
  ].map((asset) => [asset.role, asset.path]));
  const observedRoles = new Map<string, string>();
  const observedPaths = new Set<string>();
  for (const asset of manifestAssets) {
    if (observedRoles.has(asset.role)) {
      issues.push(`duplicate_role:${asset.role}`);
    }
    if (observedPaths.has(asset.path)) {
      issues.push(`duplicate_path:${asset.path}`);
    }
    observedRoles.set(asset.role, asset.path);
    observedPaths.add(asset.path);

    try {
      const bytes = readFileSync(resolvePackageAsset(packageRoot, asset.path));
      if (sha256Bytes(bytes) !== asset.sha256) {
        issues.push(`asset_digest_mismatch:${asset.role}`);
      }
    } catch (error) {
      issues.push(`asset_missing:${asset.role}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const [role, path] of expectedRoles) {
    if (observedRoles.get(role) !== path) {
      issues.push(`required_role_mismatch:${role}`);
    }
  }
  if (observedRoles.size !== expectedRoles.size) {
    issues.push("asset_set_not_exhaustive");
  }
  const profileAsset = manifestAssets.find((asset) => asset.role === "profile_registry");
  if (!profileAsset) {
    issues.push("profile_registry_asset_missing");
  } else {
    try {
      const registry = loadPackagedProfileRegistry({
        path: resolvePackageAsset(packageRoot, profileAsset.path),
        expectedPackageName: String(manifest.package_name),
        expectedPackageVersion: String(manifest.package_version),
        expectedPackageBuildId: String(manifest.package_build_id)
      });
      if (registry.registry_digest !== manifest.profile_registry_digest) {
        issues.push("profile_registry_digest_mismatch");
      }
    } catch (error) {
      issues.push(
        `profile_registry_invalid:${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  try {
    const expectedManifest = createRuntimeClosureManifest(packageRoot);
    if (manifest.package_name !== expectedManifest.package_name) {
      issues.push("package_name_mismatch");
    }
    if (manifest.package_version !== expectedManifest.package_version) {
      issues.push("package_version_mismatch");
    }
    if (manifest.package_build_id !== expectedManifest.package_build_id) {
      issues.push("package_build_id_mismatch");
    }
    if (
      manifest.dependency_requirements_digest !== expectedManifest.dependency_requirements_digest
    ) {
      issues.push("dependency_requirements_digest_mismatch");
    }
    if (
      manifest.compatibility_metadata_digest !== expectedManifest.compatibility_metadata_digest
    ) {
      issues.push("compatibility_metadata_digest_mismatch");
    }
    if (canonicalJson(manifest) !== canonicalJson(expectedManifest)) {
      issues.push("manifest_generation_mismatch");
    }
  } catch (error) {
    issues.push(
      `expected_manifest_unavailable:${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    valid: issues.length === 0,
    manifestPath,
    closureManifestDigest: typeof manifest.closure_manifest_digest === "string"
      ? manifest.closure_manifest_digest
      : undefined,
    packageBuildId: typeof manifest.package_build_id === "string"
      ? manifest.package_build_id
      : undefined,
    issues
  };
};

export const assertRuntimeClosureManifest = (packageRoot: string): RuntimeClosureValidationReport => {
  const report = validateRuntimeClosureManifest(packageRoot);
  if (!report.valid) {
    throw new RuntimeIdentityError(
      "EE_RUNTIME_CLOSURE_INVALID",
      `Runtime closure validation failed: ${report.issues.join(", ")}.`
    );
  }
  return report;
};
