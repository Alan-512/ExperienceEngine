import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIXED_CONTROL_PLANE_DDL
} from "../../src/runtime/identity/control-plane-contract.js";
import type { RuntimePackageGenerationIdentity } from "../../src/runtime/identity/types.js";
import { createRuntimeSchemaPackageCompatibility } from "../../src/runtime/schema/compatibility.js";
import { RuntimeSchemaError } from "../../src/runtime/schema/errors.js";
import {
  RuntimeMigrationAuthorityRepository,
  RuntimeMigrationCoordinator,
  RuntimeMigrationRegistry,
  initializeRuntimeSchemaMetadata,
  readRuntimeMigrationState
} from "../../src/runtime/schema/migration-authority.js";
import { configureRuntimeSqlitePolicy } from "../../src/runtime/schema/sqlite-policy.js";
import type {
  RuntimeMigrationLease,
  RuntimeSchemaPackageCompatibility,
  SupervisorMigrationAuthorityEvidence,
  SupervisorMigrationAuthorityProvider
} from "../../src/runtime/schema/types.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];
const HOME_ID = "home-migration-test";
const PACKAGE_ID = "pkg-runtime-schema-v1";
const START = "2026-07-12T00:00:00.000Z";

const packageIdentity: RuntimePackageGenerationIdentity = {
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  package_generation_id: PACKAGE_ID,
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

const packageCompatibility: RuntimeSchemaPackageCompatibility =
  createRuntimeSchemaPackageCompatibility({
    packageIdentity,
    supportedMigrationFromVersions: ["legacy-learning-v0"]
  });

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-runtime-migration-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const createFixture = (): {
  db: DatabaseSync;
  repository: RuntimeMigrationAuthorityRepository;
} => {
  const db = new DatabaseSync(join(makeTempDir(), "runtime.db"));
  configureRuntimeSqlitePolicy(db, { accessMode: "read_write", role: "migration_owner" });
  db.exec(FIXED_CONTROL_PLANE_DDL);
  db.prepare(
    `INSERT INTO runtime_control_meta (
      control_schema_version,
      home_id,
      home_layout_version,
      path_normalization_version,
      normalized_path_fingerprint,
      integrity_key_id,
      home_path_fingerprint_key_id,
      database_relative_path,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "runtime-control-v1",
    HOME_ID,
    "home-layout-v1",
    "home-path-normalization-v1",
    "home-fingerprint",
    "ik-test",
    "ik-test",
    "sqlite/experienceengine.db",
    START
  );
  initializeRuntimeSchemaMetadata({
    db,
    homeId: HOME_ID,
    verifyCurrentSchema(targetDb, schemaVersion) {
      if (schemaVersion !== "legacy-learning-v0") {
        throw new Error(`unexpected schema version ${schemaVersion}`);
      }
      if (targetDb.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'experience_nodes'"
      ).get()) {
        throw new Error("legacy empty-home fixture unexpectedly contains learning tables");
      }
    },
    writer: "package_local_initializer"
  });
  return {
    db,
    repository: new RuntimeMigrationAuthorityRepository(db, HOME_ID)
  };
};

const authority = (
  ownerId: string,
  epoch: number,
  observedAt = START,
  expiresAt = "2026-07-12T00:10:00.000Z"
): SupervisorMigrationAuthorityEvidence => ({
  available: true,
  fresh: true,
  authority_contract_version: "runtime-supervisor-authority-v1",
  authority_source: "s3_objective_database_predicate",
  home_id: HOME_ID,
  supervisor_owner_id: ownerId,
  supervisor_lease_epoch: epoch,
  package_generation_id: PACKAGE_ID,
  observed_at: observedAt,
  expires_at: expiresAt
});

const provider = (
  evidence: SupervisorMigrationAuthorityEvidence
): SupervisorMigrationAuthorityProvider => ({
  getFreshSupervisorAuthorityInTransaction() {
    return evidence;
  }
});

const acquire = async (
  repository: RuntimeMigrationAuthorityRepository,
  ownerId = "supervisor-a",
  epoch = 1,
  observedAt = START
): Promise<RuntimeMigrationLease> => repository.acquire({
  ownerId,
  migrationId: "learning-schema-v1",
  packageCompatibility,
  authorityProvider: provider(authority(ownerId, epoch, observedAt)),
  leaseDurationMs: 60_000
});

describe("runtime schema migration authority", () => {
  it("initializes only schema metadata and does not opportunistically create learning tables", () => {
    const { db } = createFixture();
    try {
      expect(readRuntimeMigrationState(db, HOME_ID)).toMatchObject({
        schema_contract_version: "runtime-schema-contract-v1",
        current_schema_version: "legacy-learning-v0",
        target_schema_version: "legacy-learning-v0",
        migration_fencing_token: 0,
        migration_status: "ready"
      });
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      ).all() as Array<{ name: string }>;
      expect(tables.some((table) => table.name === "experience_nodes")).toBe(false);
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)
        .toBe(0);
      expect(() => initializeRuntimeSchemaMetadata({
        db,
        homeId: HOME_ID,
        verifyCurrentSchema() {},
        writer: "plugin"
      })).toThrowError(expect.objectContaining<Partial<RuntimeSchemaError>>({
        code: "EE_MIGRATION_OWNER_FORBIDDEN"
      }));
    } finally {
      db.close();
    }
  });

  it("rejects metadata reads when the physical SQLite schema version is contradictory", () => {
    const { db } = createFixture();
    try {
      db.exec("PRAGMA user_version = 1");
      expect(() => readRuntimeMigrationState(db, HOME_ID)).toThrowError(
        expect.objectContaining<Partial<RuntimeSchemaError>>({
          code: "EE_SCHEMA_METADATA_INVALID"
        })
      );
    } finally {
      db.close();
    }
  });

  it("refuses to initialize metadata when physical schema verification fails", () => {
    const db = new DatabaseSync(join(makeTempDir(), "invalid-baseline.db"));
    configureRuntimeSqlitePolicy(db, { accessMode: "read_write", role: "migration_owner" });
    db.exec(FIXED_CONTROL_PLANE_DDL);
    db.prepare(
      `INSERT INTO runtime_control_meta (
        control_schema_version, home_id, home_layout_version,
        path_normalization_version, normalized_path_fingerprint,
        integrity_key_id, home_path_fingerprint_key_id,
        database_relative_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "runtime-control-v1",
      HOME_ID,
      "home-layout-v1",
      "home-path-normalization-v1",
      "home-fingerprint",
      "ik-test",
      "ik-test",
      "sqlite/experienceengine.db",
      START
    );
    try {
      expect(() => initializeRuntimeSchemaMetadata({
        db,
        homeId: HOME_ID,
        verifyCurrentSchema() {
          throw new Error("physical schema verification failed");
        },
        writer: "package_local_initializer"
      })).toThrowError(/physical schema verification failed/);
      expect(db.prepare("SELECT * FROM migration_state").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("fails closed through the default runtime coordinator before S3 authority exists", async () => {
    const { db, repository } = createFixture();
    try {
      const coordinator = new RuntimeMigrationCoordinator(repository);
      await expect(coordinator.acquire({
        ownerId: "supervisor-a",
        migrationId: "learning-schema-v1",
        packageCompatibility,
        leaseDurationMs: 60_000
      })).rejects.toMatchObject({
        code: "EE_MIGRATION_SUPERVISOR_AUTHORITY_REQUIRED"
      });
      expect(repository.read()?.migration_fencing_token).toBe(0);
    } finally {
      db.close();
    }
  });

  it("evaluates the objective supervisor predicate inside the same BEGIN IMMEDIATE transaction", async () => {
    const { db, repository } = createFixture();
    let observedInTransaction = false;
    const transactionalProvider: SupervisorMigrationAuthorityProvider = {
      getFreshSupervisorAuthorityInTransaction(input) {
        observedInTransaction = input.db.isTransaction;
        return authority("supervisor-a", 1);
      }
    };
    try {
      await expect(repository.acquire({
        ownerId: "supervisor-a",
        migrationId: "learning-schema-v1",
        packageCompatibility,
        authorityProvider: transactionalProvider,
        leaseDurationMs: 60_000
      })).resolves.toMatchObject({
        migration_owner_id: "supervisor-a",
        migration_supervisor_lease_epoch: 1,
        migration_fencing_token: 1
      });
      expect(observedInTransaction).toBe(true);
    } finally {
      db.close();
    }
  });

  it("exposes no plugin or ordinary-worker acquisition route", () => {
    const { db, repository } = createFixture();
    try {
      expect("acquireWithAuthorityEvidence" in repository).toBe(false);
      for (const writer of ["plugin", "worker"] as const) {
        expect(() => initializeRuntimeSchemaMetadata({
          db,
          homeId: HOME_ID,
          verifyCurrentSchema() {},
          writer
        })).toThrowError(expect.objectContaining<Partial<RuntimeSchemaError>>({
          code: "EE_MIGRATION_OWNER_FORBIDDEN"
        }));
      }
    } finally {
      db.close();
    }
  });

  it("allows only one fresh owner and fences the old owner after expired takeover", async () => {
    const { db, repository } = createFixture();
    try {
      const first = await acquire(repository);
      expect(first.migration_fencing_token).toBe(1);
      expect(first.migration_revision).toBe(1);
      await expect(acquire(repository, "supervisor-b", 2, "2026-07-12T00:00:30.000Z"))
        .rejects.toMatchObject({
          code: "EE_MIGRATION_AUTHORITY_STALE"
        });

      const second = await acquire(repository, "supervisor-b", 2, "2026-07-12T00:01:01.000Z");
      expect(second.migration_fencing_token).toBe(2);
      const registry = new RuntimeMigrationRegistry([{
        migration_id: "learning-schema-v1",
        step_id: "legacy-to-v1",
        from_schema_version: "legacy-learning-v0",
        to_schema_version: "runtime-schema-v1",
        recovery_mode: "restartable_step",
        verify_source(targetDb) {
          expect(targetDb.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fenced_probe'"
          ).get()).toBeUndefined();
        },
        apply(targetDb) {
          targetDb.exec("CREATE TABLE fenced_probe (id TEXT PRIMARY KEY)");
        },
        verify_target(targetDb) {
          expect(targetDb.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fenced_probe'"
          ).get()).toMatchObject({ name: "fenced_probe" });
        }
      }]);
      await expect(repository.executeNextStep({
        lease: first,
        registry,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:01:02.000Z"
        ))
      })).rejects.toMatchObject({
        code: "EE_MIGRATION_AUTHORITY_STALE"
      });
      await expect(repository.executeNextStep({
        lease: second,
        registry,
        authorityProvider: provider(authority(
          "supervisor-b",
          2,
          "2026-07-12T00:01:02.000Z"
        ))
      })).resolves.toMatchObject({
        current_schema_version: "runtime-schema-v1",
        migration_status: "verifying",
        migration_fencing_token: 2,
        migration_revision: 2
      });
    } finally {
      db.close();
    }
  });

  it("commits each restartable migration step and checkpoint atomically, then releases ready authority", async () => {
    const { db, repository } = createFixture();
    try {
      const lease = await acquire(repository);
      const registry = new RuntimeMigrationRegistry([{
        migration_id: "learning-schema-v1",
        step_id: "legacy-to-v1",
        from_schema_version: "legacy-learning-v0",
        to_schema_version: "runtime-schema-v1",
        recovery_mode: "restartable_step",
        verify_source(targetDb) {
          expect(targetDb.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runtime_schema_probe'"
          ).get()).toBeUndefined();
        },
        apply(targetDb) {
          targetDb.exec("CREATE TABLE runtime_schema_probe (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
          targetDb.prepare("INSERT INTO runtime_schema_probe (id, value) VALUES (?, ?)")
            .run("row-1", "committed");
        },
        verify_target(targetDb) {
          expect(targetDb.prepare("SELECT * FROM runtime_schema_probe").all()).toEqual([
            { id: "row-1", value: "committed" }
          ]);
        }
      }]);
      const checkpoint = await repository.executeNextStep({
        lease,
        registry,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:00:01.000Z"
        ))
      });
      expect(checkpoint).toEqual({
        migration_id: "learning-schema-v1",
        step_id: "legacy-to-v1",
        migration_fencing_token: 1,
        migration_revision: 1,
        current_schema_version: "runtime-schema-v1",
        target_schema_version: "runtime-schema-v1",
        migration_status: "verifying"
      });
      expect(db.prepare("SELECT * FROM runtime_schema_probe").all()).toEqual([
        { id: "row-1", value: "committed" }
      ]);
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)
        .toBe(1);

      await expect(repository.complete({
        lease,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:00:02.000Z"
        ))
      })).resolves.toMatchObject({
        current_schema_version: "runtime-schema-v1",
        target_schema_version: "runtime-schema-v1",
        migration_status: "ready",
        migration_owner_id: null,
        migration_supervisor_lease_epoch: null,
        migration_package_generation_id: null,
        last_completed_migration_id: "learning-schema-v1",
        last_error_code: null
      });
      await expect(repository.complete({
        lease,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:00:03.000Z"
        ))
      })).rejects.toMatchObject({
        code: "EE_MIGRATION_AUTHORITY_STALE"
      });
    } finally {
      db.close();
    }
  });

  it("rolls back partial DDL and schema checkpoint when a restartable step fails", async () => {
    const { db, repository } = createFixture();
    try {
      const lease = await acquire(repository);
      const registry = new RuntimeMigrationRegistry([{
        migration_id: "learning-schema-v1",
        step_id: "legacy-to-v1",
        from_schema_version: "legacy-learning-v0",
        to_schema_version: "runtime-schema-v1",
        recovery_mode: "restartable_step",
        verify_source() {},
        apply(targetDb) {
          targetDb.exec("CREATE TABLE rollback_probe (id TEXT PRIMARY KEY)");
          throw new Error("simulated migration crash");
        },
        verify_target() {}
      }]);
      await expect(repository.executeNextStep({
        lease,
        registry,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:00:01.000Z"
        ))
      })).rejects.toThrowError(/simulated migration crash/);
      expect(db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rollback_probe'"
      ).get()).toBeUndefined();
      expect(repository.read()).toMatchObject({
        current_schema_version: "legacy-learning-v0",
        migration_status: "preparing",
        migration_fencing_token: 1
      });
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)
        .toBe(0);
      await expect(repository.fail({
        lease,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:00:02.000Z"
        )),
        errorCode: "EE_MIGRATION_STEP_FAILED"
      })).resolves.toMatchObject({
        migration_status: "failed",
        migration_owner_id: null,
        last_error_code: "EE_MIGRATION_STEP_FAILED"
      });
    } finally {
      db.close();
    }
  });

  it("rejects every later migration mutation after objective supervisor authority is lost", async () => {
    const { db, repository } = createFixture();
    try {
      const lease = await acquire(repository);
      const registry = new RuntimeMigrationRegistry([{
        migration_id: "learning-schema-v1",
        step_id: "legacy-to-v1",
        from_schema_version: "legacy-learning-v0",
        to_schema_version: "runtime-schema-v1",
        recovery_mode: "restartable_step",
        verify_source(targetDb) {
          expect(targetDb.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'authority_loss_probe'"
          ).get()).toBeUndefined();
        },
        apply(targetDb) {
          targetDb.exec("CREATE TABLE authority_loss_probe (id TEXT PRIMARY KEY)");
        },
        verify_target(targetDb) {
          expect(targetDb.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'authority_loss_probe'"
          ).get()).toMatchObject({ name: "authority_loss_probe" });
        }
      }]);

      await expect(repository.executeNextStep({
        lease,
        registry,
        authorityProvider: provider(authority(
          "supervisor-a",
          2,
          "2026-07-12T00:00:01.000Z"
        ))
      })).rejects.toMatchObject({ code: "EE_MIGRATION_AUTHORITY_STALE" });
      expect(db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'authority_loss_probe'"
      ).get()).toBeUndefined();
      expect(repository.read()).toMatchObject({
        current_schema_version: "legacy-learning-v0",
        migration_status: "preparing",
        migration_fencing_token: 1
      });

      await repository.executeNextStep({
        lease,
        registry,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:00:02.000Z"
        ))
      });
      await expect(repository.complete({
        lease,
        authorityProvider: provider({
          available: false,
          fresh: false,
          authority_contract_version: "runtime-supervisor-authority-v1",
          reason: "supervisor_not_current"
        }),
      })).rejects.toMatchObject({
        code: "EE_MIGRATION_SUPERVISOR_AUTHORITY_REQUIRED"
      });
      expect(repository.read()).toMatchObject({
        current_schema_version: "runtime-schema-v1",
        migration_status: "verifying",
        migration_owner_id: "supervisor-a"
      });
    } finally {
      db.close();
    }
  });

  it("rejects async migration steps and renewals after supervisor epoch loss", async () => {
    const { db, repository } = createFixture();
    try {
      const lease = await acquire(repository);
      const asyncRegistry = new RuntimeMigrationRegistry([{
        migration_id: "learning-schema-v1",
        step_id: "legacy-to-v1",
        from_schema_version: "legacy-learning-v0",
        to_schema_version: "runtime-schema-v1",
        recovery_mode: "restartable_step",
        verify_source() {},
        apply: (async () => undefined) as unknown as (targetDb: DatabaseSync) => void,
        verify_target() {}
      }]);
      await expect(repository.executeNextStep({
        lease,
        registry: asyncRegistry,
        authorityProvider: provider(authority(
          "supervisor-a",
          1,
          "2026-07-12T00:00:01.000Z"
        ))
      })).rejects.toMatchObject({
        code: "EE_SQLITE_TRANSACTION_ASYNC_FORBIDDEN"
      });
      expect(repository.read()).toMatchObject({
        current_schema_version: "legacy-learning-v0",
        migration_status: "preparing"
      });

      await expect(repository.renew({
        lease,
        authorityProvider: provider(authority(
          "supervisor-a",
          2,
          "2026-07-12T00:00:02.000Z"
        )),
        leaseDurationMs: 60_000
      })).rejects.toMatchObject({
        code: "EE_MIGRATION_AUTHORITY_STALE"
      });
    } finally {
      db.close();
    }
  });
});
