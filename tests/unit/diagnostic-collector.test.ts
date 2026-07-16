import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { collectSafeDiagnosticManifest } from "../../src/diagnostics/collector.js";
import { prepareDiagnosticReviewDirectory } from "../../src/diagnostics/review-directory.js";

const roots: string[] = [];

const temporaryHome = (): string => {
  const root = mkdtempSync(join(tmpdir(), "experienceengine-diagnostic-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const safeHosts = [{
  host: "openclaw" as const,
  installed: true,
  wiring_state: "ready" as const,
  version: "2026.7.1"
}];

const createDiagnosticFixtureDatabase = (home: string): string => {
  const path = join(home, ".experienceengine", "sqlite", "experienceengine.db");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE task_runs (
      learning_status TEXT,
      final_status TEXT,
      created_at TEXT,
      updated_at TEXT,
      task_summary TEXT,
      prompt_excerpt TEXT
    );
    CREATE TABLE experience_candidates (
      lifecycle_state TEXT,
      failure_code TEXT,
      failure_class TEXT,
      failure_scope TEXT,
      last_error TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE experience_nodes (
      state TEXT,
      delivery_state TEXT,
      compact_hint TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE distillation_jobs (
      status TEXT,
      failure_code TEXT,
      failure_class TEXT,
      failure_scope TEXT,
      terminal_reason_code TEXT,
      last_error TEXT,
      home_id TEXT,
      claimed_package_generation_id TEXT,
      claimed_configuration_generation_id TEXT,
      claimed_supervisor_lease_epoch INTEGER,
      claim_fencing_token INTEGER,
      claim_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE attribution_records (
      attribution_verdict TEXT,
      created_at TEXT
    );
    CREATE TABLE runtime_control_meta (
      home_id TEXT,
      normalized_path_fingerprint TEXT
    );
    CREATE TABLE package_activation_state (
      home_id TEXT,
      activation_state TEXT,
      activation_revision INTEGER,
      active_package_generation_id TEXT,
      last_failure_code TEXT,
      updated_by_supervisor_lease_epoch INTEGER,
      updated_at TEXT
    );
    CREATE TABLE configuration_pointer (
      home_id TEXT,
      generation_id TEXT
    );
    CREATE TABLE supervisor_leases (
      home_id TEXT,
      state TEXT,
      lease_epoch INTEGER,
      package_generation_id TEXT,
      last_failure_code TEXT,
      heartbeat_at TEXT
    );
    CREATE TABLE worker_leases (
      home_id TEXT,
      state TEXT,
      fencing_token INTEGER,
      supervisor_lease_epoch INTEGER,
      package_generation_id TEXT,
      last_failure_code TEXT,
      heartbeat_at TEXT
    );
    CREATE TABLE migration_state (
      home_id TEXT,
      migration_status TEXT,
      current_schema_version TEXT,
      last_error_code TEXT,
      migration_package_generation_id TEXT,
      migration_supervisor_lease_epoch INTEGER,
      migration_fencing_token INTEGER,
      migration_heartbeat_at TEXT
    );
    CREATE TABLE activation_handshakes (
      failure_code TEXT,
      requested_at TEXT,
      home_id TEXT,
      plugin_package_generation_id TEXT,
      configuration_generation_id TEXT,
      supervisor_lease_epoch INTEGER,
      worker_fencing_token INTEGER
    );
  `);
  db.exec(`
    INSERT INTO task_runs VALUES (
      'captured', 'success', '2026-07-15T10:00:00.000Z', '2026-07-15T10:01:00.000Z',
      'SECRET_TASK_CONTENT D:\\private\\repo', 'SECRET_PROMPT'
    );
    INSERT INTO experience_candidates VALUES (
      'blocked', 'EE_PROVIDER_RATE_LIMITED', 'system_route', 'provider_route',
      'SECRET_PROVIDER_RESPONSE', '2026-07-15T10:00:00.000Z', '2026-07-15T10:02:00.000Z'
    );
    INSERT INTO experience_candidates VALUES (
      'failed', 'SECRET_ERROR_CODE', 'SECRET_CLASS', 'SECRET_SCOPE',
      'SECRET_STACK', '2026-07-15T10:00:00.000Z', '2026-07-15T10:03:00.000Z'
    );
    INSERT INTO experience_nodes VALUES (
      'active', 'eligible', 'SECRET_HINT', '2026-07-15T10:00:00.000Z', '2026-07-15T10:04:00.000Z'
    );
    INSERT INTO distillation_jobs VALUES (
      'blocked', 'EE_SQLITE_BUSY', 'system_route', 'sqlite', NULL, 'SECRET_SQL_ERROR',
      'home-identity-secret-value', 'pkg-generation-secret-value', 'config-generation-secret-value',
      4, 7, 'claim-secret-value', '2026-07-15T10:00:00.000Z', '2026-07-15T10:05:00.000Z'
    );
    INSERT INTO attribution_records VALUES ('strong_helped', '2026-07-15T10:06:00.000Z');
    INSERT INTO runtime_control_meta VALUES ('home-identity-secret-value', 'PATH_FINGERPRINT_SECRET');
    INSERT INTO package_activation_state VALUES (
      'home-identity-secret-value', 'active', 2, 'pkg-generation-secret-value', NULL, 4,
      '2026-07-15T10:07:00.000Z'
    );
    INSERT INTO configuration_pointer VALUES ('home-identity-secret-value', 'config-generation-secret-value');
    INSERT INTO supervisor_leases VALUES (
      'home-identity-secret-value', 'active', 4, 'pkg-generation-secret-value', NULL,
      '2026-07-15T10:08:00.000Z'
    );
    INSERT INTO worker_leases VALUES (
      'home-identity-secret-value', 'active', 7, 4, 'pkg-generation-secret-value', NULL,
      '2026-07-15T10:09:00.000Z'
    );
    INSERT INTO migration_state VALUES (
      'home-identity-secret-value', 'ready', 'legacy-learning-v0', NULL,
      'pkg-generation-secret-value', 4, 7, '2026-07-15T10:10:00.000Z'
    );
  `);
  db.close();
  return path;
};

describe("safe diagnostic collector", () => {
  it("does not initialize a missing home, key, or database", async () => {
    const home = temporaryHome();
    const productHome = join(home, ".experienceengine");

    const manifest = await collectSafeDiagnosticManifest({
      homeDir: home,
      env: {},
      packageVersion: "0.5.1",
      now: () => "2026-07-16T20:00:00.000Z"
    });

    expect(manifest.setup.setup_state).toBe("not_initialized");
    expect(manifest.database.present).toBe(false);
    expect(manifest.warnings).toContain("EE_DIAGNOSTIC_DATABASE_UNAVAILABLE");
    expect(manifest.warnings).toContain("EE_DIAGNOSTIC_IDENTITY_UNAVAILABLE");
    expect(existsSync(productHome)).toBe(false);
  });

  it("emits only allowlisted counts, prefixes, stable errors, and consented model identity", async () => {
    const home = temporaryHome();
    createDiagnosticFixtureDatabase(home);
    const manifest = await collectSafeDiagnosticManifest({
      homeDir: home,
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openrouter/example/model"
      },
      hosts: safeHosts,
      packageVersion: "0.5.1",
      includeModelId: true,
      now: () => "2026-07-16T20:00:00.000Z"
    });

    expect(manifest.setup.setup_state).toBe("ready");
    expect(manifest.database).toMatchObject({ present: true, integrity: "passed" });
    expect(manifest.counts.task_runs.total).toBe(1);
    expect(manifest.counts.candidates.total).toBe(2);
    expect(manifest.counts.nodes.primary.active).toBe(1);
    expect(manifest.counts.queue.primary.blocked).toBe(1);
    expect(manifest.runtime.home_id_prefix).toBe("home-identit");
    expect(manifest.runtime.package_generation_id_prefix).toBe("pkg-generati");
    expect(manifest.provider.exact_model_id).toBe("openrouter/example/model");
    expect(manifest.privacy.exact_model_id_included).toBe(true);
    expect(manifest.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ error_code: "EE_PROVIDER_RATE_LIMITED", occurrence_count: 1 }),
      expect.objectContaining({ error_code: "EE_SQLITE_BUSY", retryable: true })
    ]));
    expect(manifest.errors.some((error) => error.error_code === "SECRET_ERROR_CODE")).toBe(false);

    const serialized = JSON.stringify(manifest);
    for (const forbidden of [
      "SECRET_TASK_CONTENT",
      "SECRET_PROMPT",
      "SECRET_PROVIDER_RESPONSE",
      "SECRET_SQL_ERROR",
      "SECRET_HINT",
      "D:\\\\private\\\\repo",
      "PATH_FINGERPRINT_SECRET",
      "claim-secret-value"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("excludes exact model identity without explicit consent", async () => {
    const home = temporaryHome();
    const manifest = await collectSafeDiagnosticManifest({
      homeDir: home,
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openrouter/example/model"
      },
      hosts: [],
      packageVersion: "0.5.1",
      now: () => "2026-07-16T20:00:00.000Z"
    });
    expect(manifest.provider.exact_model_id).toBeNull();
    expect(manifest.privacy.exact_model_id_included).toBe(false);
  });
});

describe("diagnostic review directory", () => {
  it("creates exactly one manifest file and refuses a collision", async () => {
    const home = temporaryHome();
    const outputRoot = join(home, "review-output");
    const manifest = await collectSafeDiagnosticManifest({
      homeDir: home,
      env: {},
      hosts: [],
      packageVersion: "0.5.1",
      now: () => "2026-07-16T20:00:00.000Z"
    });
    const prepared = prepareDiagnosticReviewDirectory({
      manifest,
      outputRoot,
      homeDir: home,
      env: {},
      idFactory: () => "fixed-id"
    });

    expect(readdirSync(prepared.review_directory)).toEqual(["manifest.json"]);
    expect(JSON.parse(readFileSync(prepared.manifest_path, "utf8"))).toEqual(manifest);
    expect(() => prepareDiagnosticReviewDirectory({
      manifest,
      outputRoot,
      homeDir: home,
      env: {},
      idFactory: () => "fixed-id"
    })).toThrow();
    expect(readdirSync(prepared.review_directory)).toEqual(["manifest.json"]);
  });

  it("rejects a linked output root", async () => {
    const home = temporaryHome();
    const realRoot = join(home, "real-review-output");
    const linkedRoot = join(home, "linked-review-output");
    mkdirSync(realRoot, { recursive: true });
    try {
      const { symlinkSync } = await import("node:fs");
      symlinkSync(realRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    } catch {
      return;
    }
    const manifest = await collectSafeDiagnosticManifest({
      homeDir: home,
      env: {},
      hosts: [],
      packageVersion: "0.5.1",
      now: () => "2026-07-16T20:00:00.000Z"
    });
    expect(() => prepareDiagnosticReviewDirectory({
      manifest,
      outputRoot: linkedRoot,
      homeDir: home,
      env: {},
      idFactory: () => "fixed-id"
    })).toThrow("must be a real directory");
  });
});
