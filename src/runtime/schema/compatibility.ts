import {
  ACTIVE_RUNTIME_MIGRATION_STATUSES,
  RUNTIME_PLUGIN_MODE_PERMISSIONS,
  RUNTIME_SCHEMA_CONTRACT_VERSION,
  RUNTIME_SCHEMA_VERSION_ORDER
} from "./constants.js";
import { RuntimeSchemaError } from "./errors.js";
import type { RuntimePackageGenerationIdentity } from "../identity/types.js";
import type {
  RuntimeMigrationStateRecord,
  RuntimeSchemaCompatibilityProjection,
  RuntimeSchemaPackageCompatibility,
  RuntimeSchemaVersion
} from "./types.js";

const versionIndex = (version: RuntimeSchemaVersion): number =>
  RUNTIME_SCHEMA_VERSION_ORDER.indexOf(
    version as typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
  );

const packageCompatibilityIsValid = (
  compatibility: Omit<RuntimeSchemaPackageCompatibility, never>
): boolean => {
  const versions = [
    compatibility.min_read_schema_version,
    compatibility.max_read_schema_version,
    compatibility.min_write_schema_version,
    compatibility.max_write_schema_version,
    compatibility.target_schema_version,
    ...compatibility.supported_migration_from_versions
  ];
  if (versions.some((version) => versionIndex(version) < 0)) {
    return false;
  }
  const minRead = versionIndex(compatibility.min_read_schema_version);
  const maxRead = versionIndex(compatibility.max_read_schema_version);
  const minWrite = versionIndex(compatibility.min_write_schema_version);
  const maxWrite = versionIndex(compatibility.max_write_schema_version);
  const target = versionIndex(compatibility.target_schema_version);
  return Boolean(compatibility.package_generation_id) &&
    minRead <= maxRead &&
    minWrite <= maxWrite &&
    minWrite <= target &&
    target <= maxWrite &&
    new Set(compatibility.supported_migration_from_versions).size ===
      compatibility.supported_migration_from_versions.length &&
    compatibility.supported_migration_from_versions.every(
      (version) => versionIndex(version) < target
    );
};

export const createRuntimeSchemaPackageCompatibility = (options: {
  packageIdentity: RuntimePackageGenerationIdentity;
  supportedMigrationFromVersions: readonly RuntimeSchemaVersion[];
}): RuntimeSchemaPackageCompatibility => {
  const compatibility = {
    package_generation_id: options.packageIdentity.package_generation_id,
    min_read_schema_version: options.packageIdentity.min_read_schema_version,
    max_read_schema_version: options.packageIdentity.max_read_schema_version,
    min_write_schema_version: options.packageIdentity.min_write_schema_version,
    max_write_schema_version: options.packageIdentity.max_write_schema_version,
    target_schema_version: options.packageIdentity.target_schema_version,
    supported_migration_from_versions: [...options.supportedMigrationFromVersions]
  } as unknown as RuntimeSchemaPackageCompatibility;
  if (!packageCompatibilityIsValid(compatibility)) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_INCOMPATIBLE",
      "Package schema ranges or supported migration sources are invalid."
    );
  }
  return compatibility;
};

const inVersionRange = (
  version: RuntimeSchemaVersion,
  minimum: RuntimeSchemaVersion,
  maximum: RuntimeSchemaVersion
): boolean => {
  const value = versionIndex(version);
  const min = versionIndex(minimum);
  const max = versionIndex(maximum);
  return value >= 0 && min >= 0 && max >= 0 && min <= value && value <= max;
};

const projection = (options: {
  homeId: string;
  state?: RuntimeMigrationStateRecord;
  packageCompatibility: RuntimeSchemaPackageCompatibility;
  mode: RuntimeSchemaCompatibilityProjection["plugin_mode"];
  reason: RuntimeSchemaCompatibilityProjection["reason"];
  readCompatible?: boolean;
  writeCompatible?: boolean;
  migrationRequired?: boolean;
}): RuntimeSchemaCompatibilityProjection => ({
  projection_schema_version: "runtime-schema-compatibility-v1",
  home_id: options.homeId,
  current_schema_version: options.state?.current_schema_version ?? null,
  target_schema_version: options.packageCompatibility.target_schema_version,
  migration_status: options.state?.migration_status ?? "missing",
  plugin_mode: options.mode,
  reason: options.reason,
  permissions: RUNTIME_PLUGIN_MODE_PERMISSIONS[options.mode],
  schema_read_compatible: options.readCompatible ?? false,
  schema_write_compatible: options.writeCompatible ?? false,
  migration_required: options.migrationRequired ?? false,
  production_learning_ready: false
});

const migrationLeaseShapeIsValid = (state: RuntimeMigrationStateRecord): boolean =>
  Boolean(
    state.migration_id &&
    state.migration_owner_id &&
    state.migration_supervisor_lease_epoch &&
    state.migration_supervisor_lease_epoch >= 1 &&
    state.migration_fencing_token >= 1 &&
    state.migration_package_generation_id &&
    state.migration_started_at &&
    state.migration_heartbeat_at &&
    state.migration_expires_at
  );

export const evaluateRuntimeSchemaCompatibility = (options: {
  homeId: string;
  state?: RuntimeMigrationStateRecord;
  packageCompatibility: RuntimeSchemaPackageCompatibility;
  hostWiringComplete: boolean;
  now: string;
}): RuntimeSchemaCompatibilityProjection => {
  const { state, packageCompatibility } = options;
  if (!packageCompatibilityIsValid(packageCompatibility)) {
    return projection({
      ...options,
      mode: "blocked_incompatible",
      reason: "schema_version_unknown"
    });
  }
  if (!state) {
    return projection({
      ...options,
      mode: "status_only_warming",
      reason: "schema_metadata_uninitialized",
      migrationRequired: true
    });
  }
  if (state.home_id !== options.homeId) {
    return projection({ ...options, mode: "blocked_incompatible", reason: "home_identity_mismatch" });
  }
  if (state.schema_contract_version !== RUNTIME_SCHEMA_CONTRACT_VERSION) {
    return projection({ ...options, mode: "blocked_incompatible", reason: "schema_contract_mismatch" });
  }

  if (ACTIVE_RUNTIME_MIGRATION_STATUSES.includes(
    state.migration_status as typeof ACTIVE_RUNTIME_MIGRATION_STATUSES[number]
  )) {
    if (!migrationLeaseShapeIsValid(state)) {
      return projection({ ...options, mode: "blocked_incompatible", reason: "migration_state_invalid" });
    }
    if (state.migration_package_generation_id !== packageCompatibility.package_generation_id) {
      return projection({ ...options, mode: "blocked_incompatible", reason: "migration_package_mismatch" });
    }
    const expired = Date.parse(state.migration_expires_at!) <= Date.parse(options.now);
    return projection({
      ...options,
      mode: "status_only_warming",
      reason: expired ? "migration_recovery_required" : "migration_active",
      migrationRequired: true
    });
  }

  if (state.migration_status === "failed") {
    return projection({
      ...options,
      mode: "blocked_incompatible",
      reason: "migration_failed",
      migrationRequired: true
    });
  }

  const current = state.current_schema_version;
  if (!current) {
    return projection({
      ...options,
      mode: "status_only_warming",
      reason: "schema_metadata_uninitialized",
      migrationRequired: true
    });
  }
  if (versionIndex(current) < 0) {
    return projection({ ...options, mode: "blocked_incompatible", reason: "schema_version_unknown" });
  }

  const readCompatible = inVersionRange(
    current,
    packageCompatibility.min_read_schema_version,
    packageCompatibility.max_read_schema_version
  );
  const writeCompatible = inVersionRange(
    current,
    packageCompatibility.min_write_schema_version,
    packageCompatibility.max_write_schema_version
  );

  if (!readCompatible) {
    const currentIndex = versionIndex(current);
    const minReadIndex = versionIndex(packageCompatibility.min_read_schema_version);
    const maxReadIndex = versionIndex(packageCompatibility.max_read_schema_version);
    if (currentIndex > maxReadIndex && maxReadIndex >= 0) {
      return projection({ ...options, mode: "blocked_incompatible", reason: "schema_newer_than_package" });
    }
    if (
      currentIndex < minReadIndex &&
      packageCompatibility.supported_migration_from_versions.includes(current)
    ) {
      return projection({
        ...options,
        mode: "status_only_warming",
        reason: "schema_older_migration_available",
        migrationRequired: true
      });
    }
    return projection({
      ...options,
      mode: "blocked_incompatible",
      reason: "schema_older_without_migration_path"
    });
  }

  if (!writeCompatible || current !== packageCompatibility.target_schema_version) {
    return projection({
      ...options,
      mode: "interaction_read_only",
      reason: "schema_read_compatible_write_blocked",
      readCompatible: true,
      migrationRequired: current !== packageCompatibility.target_schema_version
    });
  }

  if (!options.hostWiringComplete) {
    return projection({
      ...options,
      mode: "interaction_read_only",
      reason: "host_wiring_incomplete",
      readCompatible: true,
      writeCompatible: true
    });
  }

  return projection({
    ...options,
    mode: "interaction_ready",
    reason: "schema_current_read_write_compatible",
    readCompatible: true,
    writeCompatible: true
  });
};
