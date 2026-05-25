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
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
};

const columnExists = (db: DatabaseSync, table: string, column: string): boolean => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
};

const tableExists = (db: DatabaseSync, table: string): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
};

const ensureColumn = (db: DatabaseSync, table: string, column: string, definition: string): boolean => {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }

  return false;
};

const ensureIndex = (db: DatabaseSync, indexName: string, table: string, column: string): void => {
  db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column})`);
};

const ensureTraceSchemaColumns = (db: DatabaseSync): void => {
  if (tableExists(db, "trace_capsules")) {
    ensureColumn(db, "trace_capsules", "episode_id", "TEXT");
    ensureColumn(db, "trace_capsules", "task_run_id", "TEXT");
    ensureColumn(db, "trace_capsules", "scope_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "trace_capsules", "session_id", "TEXT");
    ensureColumn(db, "trace_capsules", "task_json", "TEXT NOT NULL DEFAULT '{}'");
    ensureColumn(db, "trace_capsules", "outcome_json", "TEXT NOT NULL DEFAULT '{\"outcome_signal\":\"unknown\",\"confidence\":\"low\"}'");
    ensureColumn(db, "trace_capsules", "capture_metadata_json", "TEXT NOT NULL DEFAULT '{\"is_complete\":false,\"completeness_score\":0,\"metadata_only\":true,\"dropped_events_count\":0,\"redaction_applied\":false,\"size_bytes\":0}'");
    ensureColumn(db, "trace_capsules", "host_profile_json", "TEXT NOT NULL DEFAULT '{\"host\":\"openclaw\",\"profile_version\":\"legacy\",\"adapter_version\":\"legacy\",\"capabilities\":{},\"transcript_stability\":\"none\",\"tool_coverage\":[],\"observed_at\":\"1970-01-01T00:00:00.000Z\"}'");
    ensureColumn(db, "trace_capsules", "created_at", "TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
    ensureColumn(db, "trace_capsules", "updated_at", "TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
  }

  if (tableExists(db, "trace_events")) {
    ensureColumn(db, "trace_events", "trace_capsule_id", "TEXT");
    ensureColumn(db, "trace_events", "event_type", "TEXT NOT NULL DEFAULT 'unknown'");
    ensureColumn(db, "trace_events", "timestamp", "TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
    ensureColumn(db, "trace_events", "source_json", "TEXT NOT NULL DEFAULT '{}'");
    ensureColumn(db, "trace_events", "payload_json", "TEXT NOT NULL DEFAULT '{}'");
  }

  if (tableExists(db, "trace_evidence_refs")) {
    ensureColumn(db, "trace_evidence_refs", "trace_capsule_id", "TEXT");
    ensureColumn(db, "trace_evidence_refs", "ref_type", "TEXT NOT NULL DEFAULT 'metadata'");
    ensureColumn(db, "trace_evidence_refs", "path_or_uri", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "trace_evidence_refs", "content_hash", "TEXT");
    ensureColumn(db, "trace_evidence_refs", "summary", "TEXT");
    ensureColumn(db, "trace_evidence_refs", "is_redacted", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "trace_evidence_refs", "size_bytes", "INTEGER");
  }
};

const backfillExperienceNodeDeliveryState = (db: DatabaseSync, forceAllRows = false): void => {
  db.exec(
    `UPDATE experience_nodes
     SET delivery_state = CASE state
       WHEN 'candidate' THEN 'shadow_only'
       WHEN 'priority_candidate' THEN 'conservative_only'
       WHEN 'active' THEN 'eligible'
       WHEN 'cooling' THEN 'conservative_only'
       WHEN 'retired' THEN 'quarantined'
       ELSE 'shadow_only'
     END
     WHERE ${forceAllRows
       ? "1 = 1"
       : "delivery_state IS NULL OR delivery_state = '' OR delivery_state NOT IN ('shadow_only', 'conservative_only', 'eligible', 'quarantined', 'shadow_probe', 'retired')"}`
  );
};

export const bootstrapDatabase = (db: DatabaseSync): void => {
  const schemaPath = resolveSQLiteSchemaPath(moduleDir);
  const schema = readFileSync(schemaPath, "utf8");
  ensureTraceSchemaColumns(db);
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
  ensureColumn(db, "experience_nodes", "promotion_signal", "TEXT");
  ensureColumn(db, "experience_nodes", "promotion_reason", "TEXT");
  ensureColumn(db, "experience_nodes", "merge_decision", "TEXT");
  ensureColumn(db, "experience_nodes", "merge_reason", "TEXT");
  ensureColumn(db, "experience_nodes", "priority_promotion_applied", "INTEGER NOT NULL DEFAULT 0");
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
  const deliveryStateAdded = ensureColumn(db, "experience_nodes", "delivery_state", "TEXT NOT NULL DEFAULT 'shadow_only'");
  ensureColumn(db, "experience_nodes", "consecutive_harmed_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "experience_nodes", "last_feedback_verdict", "TEXT");
  ensureColumn(db, "experience_nodes", "quarantined_at", "TEXT");
  ensureColumn(db, "experience_nodes", "quarantine_reason", "TEXT");
  ensureColumn(db, "experience_nodes", "embedding_manifest_id", "TEXT");
  ensureColumn(db, "experience_nodes", "migration_status", "TEXT");
  ensureColumn(db, "experience_nodes", "migration_last_error", "TEXT");
  ensureColumn(db, "experience_nodes", "migration_updated_at", "TEXT");
  ensureColumn(db, "experience_nodes", "source_fingerprint_hash", "TEXT");
  ensureColumn(db, "experience_nodes", "portable_validation_evidence_json", "TEXT");
  ensureColumn(db, "experience_nodes", "quarantine_lease_expires_at", "TEXT");
  ensureColumn(db, "experience_nodes", "quarantine_original_delivery_state", "TEXT");
  ensureColumn(db, "experience_nodes", "quarantine_release_attempt_count", "INTEGER");
  ensureColumn(db, "experience_nodes", "quarantine_last_release_attempt_at", "TEXT");
  ensureColumn(db, "experience_nodes", "quarantine_release_reason", "TEXT");
  ensureColumn(db, "experience_nodes", "quarantine_no_harm_pass_count", "INTEGER");
  backfillExperienceNodeDeliveryState(db, deliveryStateAdded);
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
  ensureColumn(db, "experience_candidates", "promotion_signal", "TEXT");
  ensureColumn(db, "experience_candidates", "promotion_reason", "TEXT");
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
  ensureColumn(db, "experience_input_records", "episode_id", "TEXT");
  ensureColumn(db, "task_runs", "episode_id", "TEXT");
  ensureColumn(db, "outcome_records", "episode_id", "TEXT");
  ensureColumn(db, "injection_events", "episode_id", "TEXT");
  ensureColumn(db, "attribution_records", "episode_id", "TEXT");
  ensureColumn(db, "attribution_records", "trajectory_verdict", "TEXT");
  ensureColumn(db, "attribution_records", "trajectory_confidence", "TEXT");
  ensureColumn(db, "attribution_records", "trajectory_matched_expectations_json", "TEXT");
  ensureColumn(db, "attribution_records", "trajectory_violated_expectations_json", "TEXT");
  ensureColumn(db, "attribution_records", "trajectory_evidence_refs_json", "TEXT");
  ensureColumn(db, "review_events", "episode_id", "TEXT");
  ensureIndex(db, "idx_experience_input_records_episode_id", "experience_input_records", "episode_id");
  ensureIndex(db, "idx_task_runs_episode_id", "task_runs", "episode_id");
  ensureIndex(db, "idx_outcome_records_episode_id", "outcome_records", "episode_id");
  ensureIndex(db, "idx_injection_events_episode_id", "injection_events", "episode_id");
  ensureIndex(db, "idx_attribution_records_episode_id", "attribution_records", "episode_id");
  ensureIndex(db, "idx_review_events_episode_id", "review_events", "episode_id");
  ensureColumn(db, "task_runs", "learning_status", "TEXT");
  ensureColumn(db, "task_runs", "learning_reason", "TEXT");
  ensureColumn(db, "hybrid_review_artifacts", "schema_version", "TEXT NOT NULL DEFAULT 'hybrid-capsule-v1'");
  ensureColumn(db, "hybrid_review_artifacts", "route_policy_version", "TEXT NOT NULL DEFAULT 'hybrid-phase1-v1'");
  ensureColumn(db, "hybrid_review_artifacts", "worker_profile_version", "TEXT NOT NULL DEFAULT 'hybrid-postmortem-v1'");
  ensureColumn(db, "hybrid_invocation_traces", "capsule_schema_version", "TEXT");
  ensureColumn(db, "hybrid_invocation_traces", "worker_profile_version", "TEXT");
  ensureColumn(db, "hybrid_invocation_traces", "fallback_reason", "TEXT");
  ensureColumn(db, "hygiene_governance_schedules", "last_failure_class", "TEXT");
  ensureColumn(db, "experience_input_records", "trace_capsule_id", "TEXT");
  ensureColumn(db, "experience_input_records", "trace_completeness", "REAL");
  ensureColumn(db, "experience_input_records", "trace_provenance_json", "TEXT");
  ensureColumn(db, "task_runs", "trace_capsule_id", "TEXT");
  ensureColumn(db, "task_runs", "trace_completeness", "REAL");
  ensureColumn(db, "task_runs", "trace_provenance_json", "TEXT");
  ensureTraceSchemaColumns(db);
  ensureIndex(db, "idx_hygiene_governance_runs_scope", "hygiene_governance_runs", "scope_id");
  ensureIndex(db, "idx_hygiene_governance_plans_scope", "hygiene_governance_plans", "scope_id");
  ensureIndex(db, "idx_hygiene_governance_actions_scope", "hygiene_governance_actions", "scope_id");
  ensureIndex(db, "idx_hygiene_governance_approvals_scope", "hygiene_governance_approvals", "scope_id");
  ensureIndex(db, "idx_hygiene_governance_snapshots_action", "hygiene_governance_snapshots", "action_id");
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
      if (error instanceof Error && error.message.includes("cannot start a transaction within a transaction")) {
        return operation();
      }
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
