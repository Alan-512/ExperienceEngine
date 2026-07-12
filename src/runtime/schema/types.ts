import type { DatabaseSync } from "node:sqlite";
import type {
  RuntimeMigrationStatus,
  RuntimePluginDatabaseMode,
  RuntimePluginDatabaseOperation
} from "./constants.js";

export type RuntimeSchemaVersion = string;

declare const runtimeSchemaPackageCompatibilityBrand: unique symbol;

export type RuntimeSchemaPackageCompatibility = {
  package_generation_id: string;
  min_read_schema_version: RuntimeSchemaVersion;
  max_read_schema_version: RuntimeSchemaVersion;
  min_write_schema_version: RuntimeSchemaVersion;
  max_write_schema_version: RuntimeSchemaVersion;
  target_schema_version: RuntimeSchemaVersion;
  supported_migration_from_versions: readonly RuntimeSchemaVersion[];
  readonly [runtimeSchemaPackageCompatibilityBrand]: true;
};

export type RuntimeMigrationRevision = number;

export type RuntimeMigrationStateRecord = {
  home_id: string;
  schema_contract_version: string;
  current_schema_version: RuntimeSchemaVersion | null;
  target_schema_version: RuntimeSchemaVersion | null;
  migration_id: string | null;
  migration_owner_id: string | null;
  migration_supervisor_lease_epoch: number | null;
  migration_fencing_token: number;
  migration_package_generation_id: string | null;
  migration_started_at: string | null;
  migration_heartbeat_at: string | null;
  migration_expires_at: string | null;
  migration_status: RuntimeMigrationStatus;
  last_completed_migration_id: string | null;
  last_error_code: string | null;
};

export type RuntimeSchemaCompatibilityReason =
  | "schema_current_read_write_compatible"
  | "schema_read_compatible_write_blocked"
  | "host_wiring_incomplete"
  | "migration_active"
  | "migration_recovery_required"
  | "schema_metadata_uninitialized"
  | "schema_older_migration_available"
  | "schema_contract_mismatch"
  | "home_identity_mismatch"
  | "migration_package_mismatch"
  | "migration_state_invalid"
  | "schema_version_unknown"
  | "schema_newer_than_package"
  | "schema_older_without_migration_path"
  | "migration_failed";

export type RuntimeSchemaCompatibilityProjection = {
  projection_schema_version: "runtime-schema-compatibility-v1";
  home_id: string;
  current_schema_version: RuntimeSchemaVersion | null;
  target_schema_version: RuntimeSchemaVersion;
  migration_status: RuntimeMigrationStatus | "missing";
  plugin_mode: RuntimePluginDatabaseMode;
  reason: RuntimeSchemaCompatibilityReason;
  permissions: Readonly<Record<RuntimePluginDatabaseOperation, boolean>>;
  schema_read_compatible: boolean;
  schema_write_compatible: boolean;
  migration_required: boolean;
  production_learning_ready: false;
};

export type AvailableSupervisorMigrationAuthority = {
  available: true;
  fresh: true;
  authority_contract_version: "runtime-supervisor-authority-v1";
  authority_source: "s3_objective_database_predicate";
  home_id: string;
  supervisor_owner_id: string;
  supervisor_lease_epoch: number;
  package_generation_id: string;
  observed_at: string;
  expires_at: string;
};

export type UnavailableSupervisorMigrationAuthority = {
  available: false;
  fresh: false;
  authority_contract_version: "runtime-supervisor-authority-v1";
  reason: "s3_not_connected" | "supervisor_not_current" | "supervisor_authority_expired";
};

export type SupervisorMigrationAuthorityEvidence =
  | AvailableSupervisorMigrationAuthority
  | UnavailableSupervisorMigrationAuthority;

export interface SupervisorMigrationAuthorityProvider {
  getFreshSupervisorAuthorityInTransaction(input: {
    db: DatabaseSync;
    homeId: string;
    packageGenerationId: string;
    supervisorOwnerId: string;
    expectedSupervisorLeaseEpoch?: number;
  }): SupervisorMigrationAuthorityEvidence;
}

export type RuntimeMigrationLease = {
  home_id: string;
  migration_id: string;
  migration_owner_id: string;
  migration_supervisor_lease_epoch: number;
  migration_fencing_token: number;
  migration_revision: RuntimeMigrationRevision;
  migration_package_generation_id: string;
  source_schema_version: RuntimeSchemaVersion;
  target_schema_version: RuntimeSchemaVersion;
  migration_expires_at: string;
};

export type RuntimeMigrationStep = {
  migration_id: string;
  step_id: string;
  from_schema_version: RuntimeSchemaVersion;
  to_schema_version: RuntimeSchemaVersion;
  recovery_mode: "restartable_step";
  verify_source(db: DatabaseSync): void;
  apply(db: DatabaseSync): void;
  verify_target(db: DatabaseSync): void;
};

export type RuntimeSchemaPhysicalVerifier = (
  db: DatabaseSync,
  schemaVersion: RuntimeSchemaVersion
) => void;

export type RuntimeMigrationCheckpoint = {
  migration_id: string;
  step_id: string;
  migration_fencing_token: number;
  migration_revision: RuntimeMigrationRevision;
  current_schema_version: RuntimeSchemaVersion;
  target_schema_version: RuntimeSchemaVersion;
  migration_status: "migrating" | "verifying";
};

export type RuntimeSqliteOperationCategory =
  | "lease"
  | "claim"
  | "migration"
  | "protected_result_commit";

export type RuntimeSqlitePolicyReport = {
  sqlite_runtime_policy_version: "sqlite-runtime-v1";
  access_mode: "read_write" | "read_only";
  role: "plugin" | "migration_owner" | "supervisor" | "worker" | "operator";
  journal_mode: string;
  synchronous: number;
  foreign_keys: number;
  busy_timeout_ms: number;
  verified: boolean;
};
