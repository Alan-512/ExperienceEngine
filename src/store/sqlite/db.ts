import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { ExperienceEngineConfig } from "../../config/config-schema.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const resolveSQLiteSchemaPath = (baseDir: string = moduleDir): string => {
  const rootDir = resolve(baseDir, "../..", "..");
  const candidates = [join(baseDir, "schema.sql"), join(rootDir, "src", "store", "sqlite", "schema.sql")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate ExperienceEngine SQLite schema. Checked: ${candidates.join(", ")}`
  );
};

export const openDatabase = (config: ExperienceEngineConfig): DatabaseSync => {
  const dbPath = resolve(config.sqlitePath);
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
};

const columnExists = (db: DatabaseSync, table: string, column: string): boolean => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
};

const ensureColumn = (db: DatabaseSync, table: string, column: string, definition: string): void => {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

export const bootstrapDatabase = (db: DatabaseSync): void => {
  const schemaPath = resolveSQLiteSchemaPath(moduleDir);
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);

  ensureColumn(db, "experience_nodes", "retrieval_text", "TEXT");
  ensureColumn(db, "experience_nodes", "embedding_json", "TEXT");
  ensureColumn(db, "experience_nodes", "embedding_provider", "TEXT");
  ensureColumn(db, "experience_nodes", "embedding_model", "TEXT");
  ensureColumn(db, "experience_nodes", "embedding_version", "TEXT");
  ensureColumn(db, "experience_nodes", "embedding_dimensions", "INTEGER");
  ensureColumn(db, "experience_nodes", "distillation_mode_used", "TEXT");
  ensureColumn(db, "experience_nodes", "distillation_source", "TEXT");
  ensureColumn(db, "experience_nodes", "redistilled_from", "TEXT");
  ensureColumn(db, "experience_nodes", "origin_record_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "experience_nodes", "helped_record_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "experience_nodes", "harmed_record_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "experience_nodes", "experience_kind", "TEXT");
  ensureColumn(db, "experience_nodes", "confidence_signal", "TEXT");
  ensureColumn(db, "experience_nodes", "validation_state", "TEXT");
  ensureColumn(db, "experience_nodes", "correction_scope", "TEXT");
  ensureColumn(db, "experience_nodes", "correction_category", "TEXT");
  ensureColumn(db, "experience_nodes", "deviation_pattern", "TEXT");
  ensureColumn(db, "experience_nodes", "corrected_constraint", "TEXT");
  ensureColumn(db, "experience_candidates", "source_context_summary", "TEXT");
  ensureColumn(db, "experience_candidates", "source_outcome_signal", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "experience_candidates", "task_run_id", "TEXT");
  ensureColumn(db, "experience_candidates", "candidate_kind", "TEXT");
  ensureColumn(db, "experience_candidates", "raw_summary", "TEXT");
  ensureColumn(db, "experience_candidates", "failure_signature", "TEXT");
  ensureColumn(db, "experience_candidates", "source_signal_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "experience_candidates", "lifecycle_state", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "experience_candidates", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "experience_candidates", "distilled_node_id", "TEXT");
  ensureColumn(db, "experience_candidates", "last_error", "TEXT");
  ensureColumn(db, "experience_candidates", "distilled_at", "TEXT");
  ensureColumn(db, "experience_candidates", "discarded_at", "TEXT");
  ensureColumn(db, "experience_candidates", "last_failed_at", "TEXT");
  ensureColumn(db, "experience_candidates", "experience_kind", "TEXT");
  ensureColumn(db, "experience_candidates", "confidence_signal", "TEXT");
  ensureColumn(db, "experience_candidates", "validation_state", "TEXT");
  ensureColumn(db, "experience_candidates", "correction_scope", "TEXT");
  ensureColumn(db, "experience_candidates", "correction_category", "TEXT");
  ensureColumn(db, "experience_candidates", "deviation_pattern", "TEXT");
  ensureColumn(db, "experience_candidates", "corrected_constraint", "TEXT");
  ensureColumn(db, "distillation_jobs", "extractor_profile", "TEXT NOT NULL DEFAULT 'balanced'");
  ensureColumn(db, "distillation_jobs", "distillation_source", "TEXT");
  ensureColumn(db, "distillation_jobs", "failure_bucket", "TEXT");
  ensureColumn(db, "distillation_jobs", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "distillation_jobs", "last_error", "TEXT");
  ensureColumn(db, "distillation_jobs", "started_at", "TEXT");
  ensureColumn(db, "distillation_jobs", "finished_at", "TEXT");
  ensureColumn(db, "distillation_jobs", "discarded_at", "TEXT");
  ensureColumn(db, "injection_events", "session_id", "TEXT");
  ensureColumn(db, "injection_events", "task_summary", "TEXT");
  ensureColumn(db, "injection_events", "delivery_mode", "TEXT NOT NULL DEFAULT 'live'");
  ensureColumn(db, "injection_events", "delivered", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "injection_events", "scorecard_json", "TEXT");
  ensureColumn(db, "injection_events", "attribution_reason", "TEXT");
};

const isBusyLockError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const sqliteError = error as Error & { code?: string; errstr?: string };
  const message = `${error.message} ${sqliteError.errstr ?? ""}`.toLowerCase();

  return sqliteError.code === "ERR_SQLITE_ERROR" && (
    message.includes("database is locked") ||
    message.includes("database table is locked") ||
    message.includes("busy")
  );
};

export const withTransaction = <T>(db: DatabaseSync, operation: () => T): T => {
  let begun = false;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      db.exec("BEGIN IMMEDIATE");
      begun = true;
      break;
    } catch (error) {
      if (!isBusyLockError(error) || attempt === 4) {
        throw error;
      }
    }
  }

  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (begun) {
      db.exec("ROLLBACK");
    }
    throw error;
  }
};
