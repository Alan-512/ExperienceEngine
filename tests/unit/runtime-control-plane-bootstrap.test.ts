import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootstrapFixedControlPlane,
  initializeRuntimeHomeIdentity,
  inspectFixedControlPlaneSchema
} from "../../src/runtime/identity/control-plane-bootstrap.js";
import {
  FIXED_CONTROL_PLANE_TABLE_CONTRACTS,
  FIXED_CONTROL_PLANE_TABLE_NAMES
} from "../../src/runtime/identity/control-plane-contract.js";
import { RuntimeIdentityError } from "../../src/runtime/identity/errors.js";
import { resolveCanonicalRuntimeHome } from "../../src/runtime/identity/home-identity.js";
import {
  createOrAdoptMachineIntegrityKey,
  resolveMachineIntegrityKeyPath
} from "../../src/runtime/identity/integrity-key.js";
import type { FixedControlBootstrapWriter } from "../../src/runtime/identity/constants.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];
const OS_PERMISSION_TEST_TIMEOUT_MS = 15_000;

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-control-bootstrap-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const expectedColumns: Record<string, string[]> = {
  runtime_control_meta: [
    "control_schema_version",
    "home_id",
    "home_layout_version",
    "path_normalization_version",
    "normalized_path_fingerprint",
    "integrity_key_id",
    "home_path_fingerprint_key_id",
    "database_relative_path",
    "created_at"
  ],
  gateway_heartbeats: [
    "home_id",
    "gateway_instance_id",
    "gateway_process_id",
    "gateway_process_start_token",
    "package_generation_id",
    "heartbeat_at",
    "expires_at"
  ],
  supervisor_launch_state: [
    "home_id",
    "launch_revision",
    "gateway_instance_id",
    "package_generation_id",
    "launch_authorization_id",
    "launch_authorized_generation_id",
    "launch_authorization_role",
    "launch_authorization_revision",
    "launch_authorization_state_revision",
    "expected_current_activation_revision",
    "expected_active_package_generation_id",
    "expected_pending_package_generation_id",
    "current_launch_attempt_id",
    "launch_owner_gateway_instance_id",
    "launch_owner_process_start_token",
    "restart_window_started_at",
    "launch_count_in_window",
    "last_supervisor_owner_id",
    "last_process_exit_code",
    "last_process_exit_at",
    "next_launch_at",
    "launch_started_at",
    "launch_expires_at",
    "launch_state",
    "last_failure_code"
  ],
  supervisor_launch_attempts: [
    "home_id",
    "launch_attempt_id",
    "attempt_state_revision",
    "attempt_state",
    "launch_authorization_id",
    "launch_authorization_revision",
    "launch_authorization_state_revision_at_consumption",
    "launch_authorization_role",
    "package_generation_id",
    "launch_activation_revision_at_consumption",
    "expected_active_package_generation_id",
    "expected_pending_package_generation_id",
    "launch_owner_gateway_instance_id",
    "launch_owner_process_start_token",
    "child_process_id",
    "child_process_start_token",
    "supervisor_owner_id",
    "supervisor_lease_epoch",
    "reserved_at",
    "attempt_expires_at",
    "lease_acquired_at",
    "terminal_at",
    "terminal_code"
  ],
  supervisor_leases: [
    "supervisor_lease_key",
    "home_id",
    "owner_id",
    "owner_process_id",
    "owner_process_start_token",
    "gateway_instance_id",
    "launch_attempt_id",
    "launch_authorization_id",
    "launch_authorization_revision",
    "launch_authorization_state_revision_at_consumption",
    "launch_authorization_role",
    "launch_activation_revision_at_consumption",
    "package_generation_id",
    "artifact_integrity",
    "supervisor_protocol_version",
    "lease_state_revision",
    "lease_epoch",
    "state",
    "launch_attempt_state_revision_at_acquisition",
    "worker_restart_window_started_at",
    "worker_restart_count_in_window",
    "started_at",
    "heartbeat_at",
    "expires_at",
    "shutdown_requested_at",
    "lease_terminal_at",
    "lease_terminal_reason",
    "last_failure_code"
  ],
  worker_leases: [
    "worker_lease_key",
    "home_id",
    "owner_id",
    "owner_process_id",
    "owner_process_start_token",
    "supervisor_owner_id",
    "supervisor_lease_epoch",
    "package_generation_id",
    "artifact_integrity",
    "worker_protocol_version",
    "schema_version",
    "fencing_token",
    "worker_mode",
    "state",
    "started_at",
    "heartbeat_at",
    "expires_at",
    "shutdown_requested_at",
    "drain_deadline_at",
    "last_failure_code"
  ],
  migration_state: [
    "home_id",
    "schema_contract_version",
    "current_schema_version",
    "target_schema_version",
    "migration_id",
    "migration_owner_id",
    "migration_supervisor_lease_epoch",
    "migration_fencing_token",
    "migration_package_generation_id",
    "migration_started_at",
    "migration_heartbeat_at",
    "migration_expires_at",
    "migration_status",
    "last_completed_migration_id",
    "last_error_code"
  ],
  configuration_generations: [
    "generation_id",
    "home_id",
    "parent_generation_id",
    "manifest_digest",
    "integrity_key_id",
    "profile_registry_digest",
    "created_by_instance_id",
    "created_at",
    "committed_at",
    "generation_state"
  ],
  configuration_pointer: [
    "home_id",
    "pointer_schema_version",
    "pointer_revision",
    "generation_id",
    "previous_generation_id",
    "manifest_digest",
    "commit_id",
    "committed_at"
  ],
  package_activation_state: [
    "home_id",
    "activation_revision",
    "active_package_generation_id",
    "pending_package_generation_id",
    "previous_package_generation_id",
    "pending_transition_kind",
    "activation_deadline_at",
    "preactivation_handshake_id",
    "production_activation_handshake_id",
    "launch_authorization_id",
    "launch_authorized_generation_id",
    "launch_authorization_role",
    "launch_authorization_state",
    "launch_authorization_revision",
    "launch_authorization_state_revision",
    "launch_authorization_issued_at",
    "launch_authorization_expires_at",
    "launch_authorization_consumed_by_attempt_id",
    "launch_authorization_consumed_at",
    "activation_state",
    "blocked_boundary",
    "blocked_from_state",
    "updated_by_kind",
    "updated_by_gateway_instance_id",
    "updated_by_supervisor_owner_id",
    "updated_by_supervisor_lease_epoch",
    "updated_at",
    "last_failure_code"
  ],
  package_launch_authorizations: [
    "home_id",
    "launch_authorization_id",
    "authorization_revision",
    "authorization_state_revision",
    "authorization_state",
    "authorized_package_generation_id",
    "authorization_role",
    "launch_activation_revision_at_issuance",
    "expected_active_package_generation_id",
    "expected_pending_package_generation_id",
    "issued_by_kind",
    "issued_by_gateway_instance_id",
    "issued_by_supervisor_owner_id",
    "issued_by_supervisor_lease_epoch",
    "issued_at",
    "expires_at",
    "consumed_by_launch_attempt_id",
    "consumed_at",
    "terminal_at",
    "terminal_code"
  ],
  control_request_idempotency: [
    "home_id",
    "control_request_id",
    "request_digest",
    "requested_operation",
    "expected_projection_revision",
    "expected_supervisor_lease_epoch",
    "expected_gateway_instance_id",
    "request_state",
    "result_projection_revision",
    "result_code",
    "result_digest",
    "created_at",
    "completed_at",
    "expires_at"
  ],
  activation_handshakes: [
    "activation_record_schema_version",
    "activation_id",
    "state_revision",
    "handshake_purpose",
    "nonce_digest",
    "home_id",
    "gateway_instance_id",
    "plugin_package_generation_id",
    "current_activation_revision",
    "launch_activation_revision_at_consumption",
    "active_package_generation_id",
    "pending_package_generation_id",
    "launch_authorization_id",
    "launch_authorization_revision",
    "launch_authorization_state_revision_at_consumption",
    "launch_authorization_role",
    "supervisor_launch_attempt_id",
    "configuration_generation_id",
    "effective_route_set_id",
    "supervisor_owner_id",
    "supervisor_lease_epoch",
    "worker_owner_id",
    "worker_fencing_token",
    "worker_mode",
    "schema_version",
    "requested_at",
    "supervisor_acknowledged_at",
    "worker_acknowledged_at",
    "acknowledged_at",
    "expires_at",
    "status",
    "failure_code",
    "last_writer_kind",
    "last_writer_owner_id",
    "last_writer_supervisor_lease_epoch"
  ]
};

describe("fixed runtime control-plane bootstrap", () => {
  it("materializes the exhaustive frozen authority-table and field fixture", () => {
    expect(FIXED_CONTROL_PLANE_TABLE_NAMES).toEqual(Object.keys(expectedColumns));
    expect(new Set(FIXED_CONTROL_PLANE_TABLE_CONTRACTS.map((table) => table.name))).toEqual(
      new Set(FIXED_CONTROL_PLANE_TABLE_NAMES)
    );
    for (const table of FIXED_CONTROL_PLANE_TABLE_CONTRACTS) {
      expect(table.columns.map((column) => column.name), table.name).toEqual(
        expectedColumns[table.name]
      );
      expect(table.primaryKey.length, table.name).toBeGreaterThan(0);
    }
  });

  it("creates the integrity key before opening SQLite and commits revision-zero bootstrap identity", async () => {
    const home = makeTempDir();
    const databasePath = join(home, "sqlite", "experienceengine.db");
    const stages: string[] = [];
    const result = await initializeRuntimeHomeIdentity({
      writer: "package_local_initializer",
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
      onStage(stage) {
        stages.push(stage);
        if (stage === "integrity_key_adopted") {
          expect(existsSync(resolveMachineIntegrityKeyPath(home))).toBe(true);
          expect(existsSync(databasePath)).toBe(false);
        }
      }
    });

    expect(stages).toEqual([
      "home_resolved",
      "integrity_key_adopted",
      "database_opened",
      "control_plane_ready"
    ]);
    expect(result.status).toBe("created");

    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(inspectFixedControlPlaneSchema(db)).toEqual([]);
      const names = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      ).all() as Array<{ name: string }>;
      expect(names.map((row) => row.name)).toEqual(
        [...FIXED_CONTROL_PLANE_TABLE_NAMES].sort((left, right) => left.localeCompare(right))
      );
      const meta = db.prepare("SELECT * FROM runtime_control_meta").get() as Record<string, unknown>;
      expect(meta).toMatchObject({
        control_schema_version: "runtime-control-v1",
        home_id: result.homeIdentity.home_id,
        home_layout_version: "home-layout-v1",
        path_normalization_version: "home-path-normalization-v1",
        integrity_key_id: result.integrityKey.integrity_key_id,
        home_path_fingerprint_key_id: result.integrityKey.integrity_key_id,
        database_relative_path: "sqlite/experienceengine.db"
      });
      expect(db.prepare("SELECT * FROM package_activation_state").get()).toMatchObject({
        activation_revision: 0,
        activation_state: "uninitialized",
        pending_transition_kind: "none",
        launch_authorization_revision: 0,
        launch_authorization_state_revision: 0,
        updated_by_kind: null
      });
    } finally {
      db.close();
    }
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("is idempotent and never changes an unrelated learning table", async () => {
    const home = makeTempDir();
    const first = await initializeRuntimeHomeIdentity({
      writer: "gateway_service_controller",
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    });
    const db = new DatabaseSync(first.resolution.databasePath);
    db.exec("CREATE TABLE legacy_learning_probe (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO legacy_learning_probe (id, value) VALUES (?, ?)").run("row-1", "keep");
    db.close();

    const second = await initializeRuntimeHomeIdentity({
      writer: "supervisor",
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    });

    expect(second.status).toBe("adopted");
    expect(second.homeIdentity).toEqual(first.homeIdentity);
    expect(second.integrityKey.integrity_key_id).toBe(first.integrityKey.integrity_key_id);
    const verify = new DatabaseSync(first.resolution.databasePath, { readOnly: true });
    try {
      expect(verify.prepare("SELECT * FROM legacy_learning_probe").all()).toEqual([
        { id: "row-1", value: "keep" }
      ]);
    } finally {
      verify.close();
    }
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("converges separate processes on one key and home identity", async () => {
    const home = makeTempDir();
    const worker = resolve("tests", "fixtures", "runtime-home-bootstrap-worker.ts");
    const runWorker = () => execFileAsync(
      process.execPath,
      ["--import", "tsx", worker, home],
      { cwd: process.cwd(), windowsHide: true }
    );
    const [left, right] = await Promise.all([runWorker(), runWorker()]);
    const leftResult = JSON.parse(left.stdout.trim()) as Record<string, string>;
    const rightResult = JSON.parse(right.stdout.trim()) as Record<string, string>;

    expect(new Set([leftResult.homeId, rightResult.homeId]).size).toBe(1);
    expect(new Set([leftResult.integrityKeyId, rightResult.integrityKeyId]).size).toBe(1);
    expect(new Set([leftResult.fingerprint, rightResult.fingerprint]).size).toBe(1);
    expect(new Set([leftResult.status, rightResult.status])).toEqual(new Set(["created", "adopted"]));
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("rejects a partial control schema without adding missing tables", async () => {
    const home = makeTempDir();
    const resolution = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    });
    const key = await createOrAdoptMachineIntegrityKey(home);
    mkdirSync(dirname(resolution.databasePath), { recursive: true });
    const db = new DatabaseSync(resolution.databasePath);
    db.exec("CREATE TABLE runtime_control_meta (home_id TEXT PRIMARY KEY)");

    try {
      expect(() => bootstrapFixedControlPlane({
        db,
        openedDatabasePath: resolution.databasePath,
        writer: "package_local_initializer",
        resolution,
        integrityKey: key
      })).toThrowError(expect.objectContaining<Partial<RuntimeIdentityError>>({
        code: "EE_CONTROL_SCHEMA_INCOMPATIBLE"
      }));
      const names = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      ).all() as Array<{ name: string }>;
      expect(names.map((row) => row.name)).toEqual(["runtime_control_meta"]);
    } finally {
      db.close();
    }
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("rejects a DatabaseSync connected to a different main file before any DDL", async () => {
    const home = makeTempDir();
    const otherHome = makeTempDir();
    const resolution = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    });
    const key = await createOrAdoptMachineIntegrityKey(home);
    const wrongDatabasePath = join(otherHome, "wrong.db");
    const db = new DatabaseSync(wrongDatabasePath);
    try {
      expect(() => bootstrapFixedControlPlane({
        db,
        openedDatabasePath: resolution.databasePath,
        writer: "package_local_initializer",
        resolution,
        integrityKey: key
      })).toThrowError(expect.objectContaining<Partial<RuntimeIdentityError>>({
        code: "EE_HOME_IDENTITY_MISMATCH"
      }));
      expect(db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      ).all()).toEqual([]);
    } finally {
      db.close();
    }
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("rejects ordinary hook writers before any DDL", async () => {
    const home = makeTempDir();
    const resolution = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    });
    const key = await createOrAdoptMachineIntegrityKey(home);
    mkdirSync(dirname(resolution.databasePath), { recursive: true });
    const db = new DatabaseSync(resolution.databasePath);
    try {
      expect(() => bootstrapFixedControlPlane({
        db,
        openedDatabasePath: resolution.databasePath,
        writer: "ordinary_hook" as FixedControlBootstrapWriter,
        resolution,
        integrityKey: key
      })).toThrowError(expect.objectContaining<Partial<RuntimeIdentityError>>({
        code: "EE_BOOTSTRAP_WRITER_FORBIDDEN"
      }));
      expect(db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      ).all()).toEqual([]);
    } finally {
      db.close();
    }
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("fails closed when the committed home fingerprint is changed", async () => {
    const home = makeTempDir();
    const first = await initializeRuntimeHomeIdentity({
      writer: "package_local_initializer",
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    });
    const db = new DatabaseSync(first.resolution.databasePath);
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      "UPDATE runtime_control_meta SET normalized_path_fingerprint = ?"
    ).run("tampered");
    db.close();

    await expect(initializeRuntimeHomeIdentity({
      writer: "supervisor",
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    })).rejects.toMatchObject({ code: "EE_HOME_IDENTITY_MISMATCH" });
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("fails closed when the machine key file is replaced", async () => {
    const home = makeTempDir();
    const replacementHome = makeTempDir();
    const first = await initializeRuntimeHomeIdentity({
      writer: "package_local_initializer",
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    });
    await createOrAdoptMachineIntegrityKey(replacementHome);
    writeFileSync(
      resolveMachineIntegrityKeyPath(home),
      readFileSync(resolveMachineIntegrityKeyPath(replacementHome), "utf8"),
      "utf8"
    );

    await expect(initializeRuntimeHomeIdentity({
      writer: "supervisor",
      explicitOpenClawHome: home,
      env: {},
      defaultHome: home
    })).rejects.toMatchObject({ code: "EE_INTEGRITY_KEY_MISMATCH" });
    expect(dirname(first.resolution.databasePath)).toBe(join(home, "sqlite"));
  }, OS_PERMISSION_TEST_TIMEOUT_MS);
});
