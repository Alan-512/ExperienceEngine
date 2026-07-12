import {
  RUNTIME_SCHEMA_FOUNDATION_STAGE,
  SQLITE_RUNTIME_POLICY
} from "./constants.js";
import type {
  RuntimeSchemaCompatibilityProjection,
  RuntimeSqlitePolicyReport
} from "./types.js";

export type RuntimeSchemaAuthorityInspection = {
  projection_schema_version: "runtime-schema-authority-inspection-v1";
  stage: typeof RUNTIME_SCHEMA_FOUNDATION_STAGE;
  sqlite_runtime_policy_version: typeof SQLITE_RUNTIME_POLICY.sqlite_runtime_policy_version;
  sqlite_policy_verified: boolean;
  plugin_mode: RuntimeSchemaCompatibilityProjection["plugin_mode"];
  compatibility_reason: RuntimeSchemaCompatibilityProjection["reason"];
  current_schema_version: string | null;
  target_schema_version: string;
  migration_status: RuntimeSchemaCompatibilityProjection["migration_status"];
  production_learning_ready: false;
  learning_runtime_active: false;
  process_authority_connected: false;
};

export const inspectRuntimeSchemaAuthority = (options: {
  policy?: RuntimeSqlitePolicyReport;
  compatibility: RuntimeSchemaCompatibilityProjection;
}): RuntimeSchemaAuthorityInspection => ({
  projection_schema_version: "runtime-schema-authority-inspection-v1",
  stage: RUNTIME_SCHEMA_FOUNDATION_STAGE,
  sqlite_runtime_policy_version: SQLITE_RUNTIME_POLICY.sqlite_runtime_policy_version,
  sqlite_policy_verified: options.policy?.verified ?? false,
  plugin_mode: options.compatibility.plugin_mode,
  compatibility_reason: options.compatibility.reason,
  current_schema_version: options.compatibility.current_schema_version,
  target_schema_version: options.compatibility.target_schema_version,
  migration_status: options.compatibility.migration_status,
  production_learning_ready: false,
  learning_runtime_active: false,
  process_authority_connected: false
});
