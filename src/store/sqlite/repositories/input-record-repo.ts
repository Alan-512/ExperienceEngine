import type { DatabaseSync } from "node:sqlite";
import type { ExperienceInputRecord } from "../../../types/domain.js";

export class InputRecordRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRecord(row: {
    record_id: string;
    scope_id: string;
    session_id: string | null;
    task_type: ExperienceInputRecord["task_type"];
    task_summary: string;
    outcome_signal: ExperienceInputRecord["outcome_signal"];
    context_summary: string | null;
    evidence_json: string;
    injected_node_ids_json: string;
    created_at: string;
  }): ExperienceInputRecord {
    return {
      record_id: row.record_id,
      scope_id: row.scope_id,
      session_id: row.session_id ?? undefined,
      task_type: row.task_type,
      task_summary: row.task_summary,
      outcome_signal: row.outcome_signal,
      context_summary: row.context_summary ?? undefined,
      evidence: JSON.parse(row.evidence_json) as string[],
      injected_node_ids: JSON.parse(row.injected_node_ids_json) as string[],
      created_at: row.created_at
    };
  }

  upsert(record: ExperienceInputRecord): ExperienceInputRecord {
    const payload = {
      record_id: record.record_id,
      scope_id: record.scope_id,
      session_id: record.session_id ?? null,
      task_type: record.task_type,
      task_summary: record.task_summary,
      outcome_signal: record.outcome_signal,
      context_summary: record.context_summary ?? null,
      evidence_json: JSON.stringify(record.evidence),
      injected_node_ids_json: JSON.stringify(record.injected_node_ids),
      created_at: record.created_at
    };

    this.db
      .prepare(
        `INSERT INTO experience_input_records
          (record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary, evidence_json, injected_node_ids_json, created_at)
         VALUES
          (@record_id, @scope_id, @session_id, @task_type, @task_summary, @outcome_signal, @context_summary, @evidence_json, @injected_node_ids_json, @created_at)
         ON CONFLICT(record_id) DO UPDATE SET
          outcome_signal = excluded.outcome_signal,
          context_summary = excluded.context_summary,
          evidence_json = excluded.evidence_json,
          injected_node_ids_json = excluded.injected_node_ids_json`
      )
      .run(payload);
    return record;
  }

  getLatest(): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary,
                evidence_json, injected_node_ids_json, created_at
         FROM experience_input_records
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as
      | {
          record_id: string;
          scope_id: string;
          session_id: string | null;
          task_type: ExperienceInputRecord["task_type"];
          task_summary: string;
          outcome_signal: ExperienceInputRecord["outcome_signal"];
          context_summary: string | null;
          evidence_json: string;
          injected_node_ids_json: string;
          created_at: string;
        }
      | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  getLatestInjected(): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary,
                evidence_json, injected_node_ids_json, created_at
         FROM experience_input_records
         WHERE injected_node_ids_json != '[]'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as
      | {
          record_id: string;
          scope_id: string;
          session_id: string | null;
          task_type: ExperienceInputRecord["task_type"];
          task_summary: string;
          outcome_signal: ExperienceInputRecord["outcome_signal"];
          context_summary: string | null;
          evidence_json: string;
          injected_node_ids_json: string;
          created_at: string;
        }
      | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  getLatestBySessionId(sessionId: string): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary,
                evidence_json, injected_node_ids_json, created_at
         FROM experience_input_records
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(sessionId) as
      | {
          record_id: string;
          scope_id: string;
          session_id: string | null;
          task_type: ExperienceInputRecord["task_type"];
          task_summary: string;
          outcome_signal: ExperienceInputRecord["outcome_signal"];
          context_summary: string | null;
          evidence_json: string;
          injected_node_ids_json: string;
          created_at: string;
        }
      | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  getLatestByScope(scopeId: string): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary,
                evidence_json, injected_node_ids_json, created_at
         FROM experience_input_records
         WHERE scope_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(scopeId) as
      | {
          record_id: string;
          scope_id: string;
          session_id: string | null;
          task_type: ExperienceInputRecord["task_type"];
          task_summary: string;
          outcome_signal: ExperienceInputRecord["outcome_signal"];
          context_summary: string | null;
          evidence_json: string;
          injected_node_ids_json: string;
          created_at: string;
        }
      | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  listRecent(options: { limit?: number; injectedOnly?: boolean } = {}): ExperienceInputRecord[] {
    const limit = options.limit ?? 10;
    const whereClause = options.injectedOnly ? "WHERE injected_node_ids_json != '[]'" : "";

    return this.db
      .prepare(
        `SELECT record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary,
                evidence_json, injected_node_ids_json, created_at
         FROM experience_input_records
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit)
      .map((row) =>
        this.mapRecord(
          row as {
            record_id: string;
            scope_id: string;
            session_id: string | null;
            task_type: ExperienceInputRecord["task_type"];
            task_summary: string;
            outcome_signal: ExperienceInputRecord["outcome_signal"];
            context_summary: string | null;
            evidence_json: string;
            injected_node_ids_json: string;
            created_at: string;
          }
        )
      );
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number }).count;
  }

  countByScope(scopeId: string): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM experience_input_records WHERE scope_id = ?")
        .get(scopeId) as { count: number }
    ).count;
  }
}
