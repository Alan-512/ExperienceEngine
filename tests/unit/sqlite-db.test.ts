import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDatabase, resolveSQLiteSchemaPath, withTransaction } from "../../src/store/sqlite/db.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-sqlite-schema-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
    }
  }
});

describe("resolveSQLiteSchemaPath", () => {
  it("prefers a module-local schema asset when present", () => {
    const moduleDir = makeTempDir();
    const schemaPath = join(moduleDir, "schema.sql");
    writeFileSync(schemaPath, "-- schema\n", "utf8");

    expect(resolveSQLiteSchemaPath(moduleDir)).toBe(schemaPath);
  });

  it("falls back to the package-local source schema when the built asset is missing", () => {
    const packageRoot = makeTempDir();
    const moduleDir = join(packageRoot, "dist", "store", "sqlite");
    const sourceDir = join(packageRoot, "src", "store", "sqlite");
    const sourceSchemaPath = join(sourceDir, "schema.sql");

    mkdirSync(moduleDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(sourceSchemaPath, "-- schema\n", "utf8");

    expect(resolveSQLiteSchemaPath(moduleDir)).toBe(sourceSchemaPath);
  });

  it("throws an explicit error when no known schema asset exists", () => {
    const packageRoot = makeTempDir();
    const moduleDir = join(packageRoot, "dist", "store", "sqlite");
    mkdirSync(moduleDir, { recursive: true });

    expect(() => resolveSQLiteSchemaPath(moduleDir)).toThrowError(
      /Unable to locate ExperienceEngine SQLite schema/
    );
  });
});

describe("bootstrapDatabase", () => {
  it("adds new provenance columns to an existing experience_nodes table", () => {
    const runtimeDir = makeTempDir();
    const dbPath = join(runtimeDir, "experienceengine.db");
    const db = new DatabaseSync(dbPath);

    db.exec(`
      CREATE TABLE experience_nodes (
        id TEXT PRIMARY KEY,
        node_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        trigger_pattern TEXT NOT NULL,
        applicability_notes TEXT,
        env_signature TEXT,
        compact_hint TEXT NOT NULL,
        goal TEXT,
        recommended_steps_json TEXT,
        avoid_steps_json TEXT,
        fallback_steps_json TEXT,
        success_signal TEXT NOT NULL,
        stop_condition TEXT,
        escalation_condition TEXT,
        evidence_summary TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        state TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        helped_count INTEGER NOT NULL DEFAULT 0,
        harmed_count INTEGER NOT NULL DEFAULT 0,
        support_count INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT,
        last_helped_at TEXT,
        last_harmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    bootstrapDatabase(db);

    const columns = db.prepare("PRAGMA table_info(experience_nodes)").all() as Array<{ name: string }>;
    const columnNames = columns.map((column) => column.name);

    expect(columnNames).toContain("retrieval_text");
    expect(columnNames).toContain("embedding_json");
    expect(columnNames).toContain("origin_record_ids_json");
    expect(columnNames).toContain("helped_record_ids_json");
    expect(columnNames).toContain("harmed_record_ids_json");
    expect(columnNames).toContain("experience_kind");
    expect(columnNames).toContain("confidence_signal");
    expect(columnNames).toContain("validation_state");
    expect(columnNames).toContain("correction_scope");
    expect(columnNames).toContain("correction_category");
    expect(columnNames).toContain("deviation_pattern");
    expect(columnNames).toContain("corrected_constraint");
    expect(columnNames).toContain("delivery_state");
    expect(columnNames).toContain("consecutive_harmed_count");
    expect(columnNames).toContain("last_feedback_verdict");
    expect(columnNames).toContain("quarantined_at");
    expect(columnNames).toContain("quarantine_reason");
    expect(columnNames).toContain("embedding_manifest_id");
    expect(columnNames).toContain("migration_status");
    expect(columnNames).toContain("migration_last_error");
    expect(columnNames).toContain("migration_updated_at");
    expect(columnNames).toContain("source_fingerprint_hash");
    expect(columnNames).toContain("portable_validation_evidence_json");
    expect(columnNames).toContain("quarantine_lease_expires_at");
    expect(columnNames).toContain("quarantine_original_delivery_state");
    expect(columnNames).toContain("quarantine_release_attempt_count");
    expect(columnNames).toContain("quarantine_last_release_attempt_at");
    expect(columnNames).toContain("quarantine_release_reason");
    expect(columnNames).toContain("quarantine_no_harm_pass_count");
  });

  it("adds expectation-correction columns to an existing experience_candidates table", () => {
    const runtimeDir = makeTempDir();
    const dbPath = join(runtimeDir, "experienceengine.db");
    const db = new DatabaseSync(dbPath);

    db.exec(`
      CREATE TABLE experience_candidates (
        id TEXT PRIMARY KEY,
        source_record_id TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        node_type TEXT NOT NULL,
        trigger_pattern TEXT NOT NULL,
        compact_hint TEXT NOT NULL,
        success_signal TEXT NOT NULL,
        evidence_summary TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        source_outcome_signal TEXT NOT NULL,
        source_signal_json TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    bootstrapDatabase(db);

    const columns = db.prepare("PRAGMA table_info(experience_candidates)").all() as Array<{ name: string }>;
    const columnNames = columns.map((column) => column.name);

    expect(columnNames).toContain("experience_kind");
    expect(columnNames).toContain("confidence_signal");
    expect(columnNames).toContain("validation_state");
    expect(columnNames).toContain("correction_scope");
    expect(columnNames).toContain("correction_category");
    expect(columnNames).toContain("deviation_pattern");
    expect(columnNames).toContain("corrected_constraint");
  });

  it("creates additive V3 runtime tables for task runs, outcomes, and review events", () => {
    const runtimeDir = makeTempDir();
    const dbPath = join(runtimeDir, "experienceengine.db");
    const db = new DatabaseSync(dbPath);

    bootstrapDatabase(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((table) => table.name);

    expect(tableNames).toContain("task_runs");
    expect(tableNames).toContain("outcome_records");
    expect(tableNames).toContain("review_events");
    expect(tableNames).toContain("hybrid_review_artifacts");
    expect(tableNames).toContain("hybrid_invocation_traces");
  });

  it("adds trajectory columns to an existing attribution_records table", () => {
    const runtimeDir = makeTempDir();
    const dbPath = join(runtimeDir, "experienceengine.db");
    const db = new DatabaseSync(dbPath);

    db.exec(`
      CREATE TABLE attribution_records (
        id TEXT PRIMARY KEY,
        injection_id TEXT,
        node_id TEXT NOT NULL,
        delivered INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        attribution_verdict TEXT NOT NULL,
        confidence TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    bootstrapDatabase(db);

    const columns = db.prepare("PRAGMA table_info(attribution_records)").all() as Array<{ name: string }>;
    const columnNames = columns.map((column) => column.name);

    expect(columnNames).toContain("trajectory_verdict");
    expect(columnNames).toContain("trajectory_confidence");
    expect(columnNames).toContain("trajectory_matched_expectations_json");
    expect(columnNames).toContain("trajectory_violated_expectations_json");
    expect(columnNames).toContain("trajectory_evidence_refs_json");
  });

  it("creates scope_fingerprints table on bootstrap", () => {
    const runtimeDir = makeTempDir();
    const dbPath = join(runtimeDir, "experienceengine.db");
    const db = new DatabaseSync(dbPath);

    bootstrapDatabase(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((table) => table.name);

    expect(tableNames).toContain("scope_fingerprints");
  });

  it("adds current trace capsule columns to legacy trace tables", () => {
    const runtimeDir = makeTempDir();
    const dbPath = join(runtimeDir, "experienceengine.db");
    const db = new DatabaseSync(dbPath);

    db.exec(`
      CREATE TABLE trace_capsules (
        id TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL,
        task_json TEXT NOT NULL,
        outcome_json TEXT NOT NULL,
        capture_metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE trace_events (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE trace_evidence_refs (
        id TEXT PRIMARY KEY
      );
    `);

    bootstrapDatabase(db);

    const capsuleColumns = (db.prepare("PRAGMA table_info(trace_capsules)").all() as Array<{ name: string }>).map((column) => column.name);
    const eventColumns = (db.prepare("PRAGMA table_info(trace_events)").all() as Array<{ name: string }>).map((column) => column.name);
    const refColumns = (db.prepare("PRAGMA table_info(trace_evidence_refs)").all() as Array<{ name: string }>).map((column) => column.name);

    expect(capsuleColumns).toEqual(expect.arrayContaining([
      "episode_id",
      "task_run_id",
      "session_id",
      "host_profile_json"
    ]));
    expect(eventColumns).toEqual(expect.arrayContaining([
      "trace_capsule_id",
      "event_type",
      "timestamp",
      "source_json",
      "payload_json"
    ]));
    expect(refColumns).toEqual(expect.arrayContaining([
      "trace_capsule_id",
      "ref_type",
      "path_or_uri",
      "content_hash",
      "summary",
      "is_redacted",
      "size_bytes"
    ]));

    db.close();
  });
});

describe("withTransaction", () => {
  it("retries BEGIN IMMEDIATE when sqlite reports a temporary busy lock", () => {
    const calls: string[] = [];
    let beginAttempts = 0;
    const db = {
      exec(sql: string) {
        calls.push(sql);
        if (sql === "BEGIN IMMEDIATE") {
          beginAttempts += 1;
          if (beginAttempts < 3) {
            const error = new Error("database is locked") as Error & { code?: string; errstr?: string };
            error.code = "ERR_SQLITE_ERROR";
            error.errstr = "database is locked";
            throw error;
          }
        }
      }
    } as unknown as DatabaseSync;

    const result = withTransaction(db, () => "ok");

    expect(result).toBe("ok");
    expect(calls.filter((sql) => sql === "BEGIN IMMEDIATE")).toHaveLength(3);
    expect(calls.at(-1)).toBe("COMMIT");
  });
});
