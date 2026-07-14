import { describe, expect, it } from "vitest";
import {
  RUNTIME_MIGRATION_STATUSES,
  RUNTIME_PLUGIN_DATABASE_MODES,
  RUNTIME_PLUGIN_DATABASE_OPERATIONS,
  RUNTIME_PLUGIN_MODE_PERMISSIONS
} from "../../src/runtime/schema/constants.js";
import {
  createRuntimeSchemaPackageCompatibility,
  evaluateRuntimeSchemaCompatibility
} from "../../src/runtime/schema/compatibility.js";
import { inspectRuntimeSchemaAuthority } from "../../src/runtime/schema/inspection.js";
import type { RuntimePackageGenerationIdentity } from "../../src/runtime/identity/types.js";
import type {
  RuntimeMigrationStateRecord,
  RuntimeSchemaPackageCompatibility
} from "../../src/runtime/schema/types.js";

const HOME_ID = "home-schema-test";
const NOW = "2026-07-12T00:00:00.000Z";

const packageIdentity: RuntimePackageGenerationIdentity = {
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  package_generation_id: "pkg-runtime-schema-v1",
  artifact_integrity: "sha256:fixture",
  install_record_identity: "install:fixture",
  plugin_entrypoint: "dist/plugin/openclaw-plugin.js",
  supervisor_entrypoint: "dist/runtime/package/supervisor-entrypoint.js",
  worker_entrypoint: "dist/runtime/package/worker-entrypoint.js",
  supervisor_protocol_version: "runtime-supervisor-v1",
  worker_protocol_version: "runtime-worker-v1",
  control_protocol_version: "runtime-control-v1",
  profile_registry_digest: "profile-fixture",
  min_read_schema_version: "runtime-schema-v1",
  max_read_schema_version: "runtime-schema-v1",
  min_write_schema_version: "runtime-schema-v1",
  max_write_schema_version: "runtime-schema-v1",
  target_schema_version: "runtime-schema-v1",
  install_origin: "local_pack",
  published_channel: "local_test"
};

const makePackageCompatibility = (
  overrides: Partial<RuntimePackageGenerationIdentity> = {},
  supportedMigrationFromVersions: readonly string[] = ["legacy-learning-v0"]
): RuntimeSchemaPackageCompatibility => createRuntimeSchemaPackageCompatibility({
  packageIdentity: { ...packageIdentity, ...overrides },
  supportedMigrationFromVersions
});

const packageCompatibility = makePackageCompatibility();

const readyState = (overrides: Partial<RuntimeMigrationStateRecord> = {}): RuntimeMigrationStateRecord => ({
  home_id: HOME_ID,
  schema_contract_version: "runtime-schema-contract-v1",
  current_schema_version: "runtime-schema-v1",
  target_schema_version: "runtime-schema-v1",
  migration_id: null,
  migration_owner_id: null,
  migration_supervisor_lease_epoch: null,
  migration_fencing_token: 0,
  migration_package_generation_id: null,
  migration_started_at: null,
  migration_heartbeat_at: null,
  migration_expires_at: null,
  migration_status: "ready",
  last_completed_migration_id: null,
  last_error_code: null,
  ...overrides
});

describe("runtime schema compatibility and plugin modes", () => {
  it("materializes exhaustive migration states, plugin modes, and permissions", () => {
    expect(RUNTIME_MIGRATION_STATUSES).toEqual([
      "idle",
      "preparing",
      "migrating",
      "verifying",
      "ready",
      "failed"
    ]);
    expect(RUNTIME_PLUGIN_DATABASE_MODES).toEqual([
      "interaction_ready",
      "interaction_read_only",
      "status_only_warming",
      "blocked_incompatible"
    ]);
    expect(Object.keys(RUNTIME_PLUGIN_MODE_PERMISSIONS).sort()).toEqual(
      [...RUNTIME_PLUGIN_DATABASE_MODES].sort()
    );
    for (const mode of RUNTIME_PLUGIN_DATABASE_MODES) {
      expect(Object.keys(RUNTIME_PLUGIN_MODE_PERMISSIONS[mode]).sort()).toEqual(
        [...RUNTIME_PLUGIN_DATABASE_OPERATIONS].sort()
      );
      expect(RUNTIME_PLUGIN_MODE_PERMISSIONS[mode].learning_write).toBe(false);
    }
  });

  it("projects interaction_ready only for current read/write schema and complete host wiring", () => {
    const result = evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: readyState(),
      packageCompatibility,
      hostWiringComplete: true,
      now: NOW
    });
    expect(result).toMatchObject({
      plugin_mode: "interaction_ready",
      reason: "schema_current_read_write_compatible",
      schema_read_compatible: true,
      schema_write_compatible: true,
      migration_required: false,
      production_learning_ready: false
    });
    expect(result.permissions.producer_write).toBe(true);
    expect(result.permissions.learning_write).toBe(false);
  });

  it("downgrades to interaction_read_only when host wiring or write compatibility is incomplete", () => {
    expect(evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: readyState(),
      packageCompatibility,
      hostWiringComplete: false,
      now: NOW
    })).toMatchObject({
      plugin_mode: "interaction_read_only",
      reason: "host_wiring_incomplete"
    });

    const readOnlyPackage = makePackageCompatibility({
      min_read_schema_version: "legacy-learning-v0",
      min_write_schema_version: "runtime-schema-v1"
    });
    expect(evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: readyState({
        current_schema_version: "legacy-learning-v0",
        target_schema_version: "runtime-schema-v1"
      }),
      packageCompatibility: readOnlyPackage,
      hostWiringComplete: true,
      now: NOW
    })).toMatchObject({
      plugin_mode: "interaction_read_only",
      reason: "schema_read_compatible_write_blocked",
      schema_read_compatible: true,
      schema_write_compatible: false,
      migration_required: true
    });
  });

  it("projects active and stale migrations as status-only warming", () => {
    const active = readyState({
      current_schema_version: "legacy-learning-v0",
      target_schema_version: "runtime-schema-v1",
      migration_id: "migration-v1",
      migration_owner_id: "supervisor-a",
      migration_supervisor_lease_epoch: 1,
      migration_fencing_token: 1,
      migration_package_generation_id: packageCompatibility.package_generation_id,
      migration_started_at: NOW,
      migration_heartbeat_at: NOW,
      migration_expires_at: "2026-07-12T00:01:00.000Z",
      migration_status: "migrating"
    });
    expect(evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: active,
      packageCompatibility,
      hostWiringComplete: true,
      now: NOW
    })).toMatchObject({ plugin_mode: "status_only_warming", reason: "migration_active" });

    expect(evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: { ...active, migration_expires_at: "2026-07-11T23:59:59.000Z" },
      packageCompatibility,
      hostWiringComplete: true,
      now: NOW
    })).toMatchObject({
      plugin_mode: "status_only_warming",
      reason: "migration_recovery_required"
    });
  });

  it("keeps older migratable schema warming and fails closed on incompatible metadata", () => {
    expect(evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: readyState({
        current_schema_version: "legacy-learning-v0",
        target_schema_version: "legacy-learning-v0"
      }),
      packageCompatibility,
      hostWiringComplete: true,
      now: NOW
    })).toMatchObject({
      plugin_mode: "status_only_warming",
      reason: "schema_older_migration_available"
    });

    expect(evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: readyState({ schema_contract_version: "unknown-contract" }),
      packageCompatibility,
      hostWiringComplete: true,
      now: NOW
    })).toMatchObject({
      plugin_mode: "blocked_incompatible",
      reason: "schema_contract_mismatch"
    });

    const oldOnlyPackage = makePackageCompatibility({
      min_read_schema_version: "legacy-learning-v0",
      max_read_schema_version: "legacy-learning-v0",
      min_write_schema_version: "legacy-learning-v0",
      max_write_schema_version: "legacy-learning-v0",
      target_schema_version: "legacy-learning-v0"
    }, []);
    expect(evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: readyState(),
      packageCompatibility: oldOnlyPackage,
      hostWiringComplete: true,
      now: NOW
    })).toMatchObject({
      plugin_mode: "blocked_incompatible",
      reason: "schema_newer_than_package"
    });
  });

  it("rejects malformed package ranges instead of comparing unknown version text", () => {
    expect(() => createRuntimeSchemaPackageCompatibility({
      packageIdentity: {
        ...packageIdentity,
        target_schema_version: "unknown-schema-v9"
      },
      supportedMigrationFromVersions: ["legacy-learning-v0"]
    })).toThrowError(expect.objectContaining({ code: "EE_SCHEMA_INCOMPATIBLE" }));
  });

  it("reports schema foundation without implying process or production activation", () => {
    const compatibility = evaluateRuntimeSchemaCompatibility({
      homeId: HOME_ID,
      state: readyState(),
      packageCompatibility,
      hostWiringComplete: true,
      now: NOW
    });
    expect(inspectRuntimeSchemaAuthority({ compatibility })).toEqual({
      projection_schema_version: "runtime-schema-authority-inspection-v1",
      stage: "schema_authority_foundation_only",
      sqlite_runtime_policy_version: "sqlite-runtime-v1",
      sqlite_policy_verified: false,
      plugin_mode: "interaction_ready",
      compatibility_reason: "schema_current_read_write_compatible",
      current_schema_version: "runtime-schema-v1",
      target_schema_version: "runtime-schema-v1",
      migration_status: "ready",
      production_learning_ready: false,
      learning_runtime_active: false,
      process_authority_connected: false
    });
  });
});
