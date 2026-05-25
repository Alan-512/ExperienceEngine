import type { DatabaseSync } from "node:sqlite";
import type { ExperienceInputRecord } from "../../../types/domain.js";

type InputRecordRow = {
  record_id: string;
  episode_id: string | null;
  scope_id: string;
  session_id: string | null;
  task_type: ExperienceInputRecord["task_type"];
  task_summary: string;
  outcome_signal: ExperienceInputRecord["outcome_signal"];
  context_summary: string | null;
  evidence_json: string;
  injected_node_ids_json: string;
  trace_capsule_id?: string | null;
  trace_completeness?: number | null;
  trace_provenance_json?: string | null;
  created_at: string;
};

export class InputRecordRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRecord(row: InputRecordRow): ExperienceInputRecord {
    return {
      record_id: row.record_id,
      episode_id: row.episode_id ?? undefined,
      scope_id: row.scope_id,
      session_id: row.session_id ?? undefined,
      task_type: row.task_type,
      task_summary: row.task_summary,
      outcome_signal: row.outcome_signal,
      context_summary: row.context_summary ?? undefined,
      evidence: JSON.parse(row.evidence_json) as string[],
      injected_node_ids: JSON.parse(row.injected_node_ids_json) as string[],
      trace_capsule_id: row.trace_capsule_id ?? undefined,
      trace_completeness: typeof row.trace_completeness === "number" ? row.trace_completeness : undefined,
      trace_provenance: row.trace_provenance_json ? JSON.parse(row.trace_provenance_json) : undefined,
      created_at: row.created_at
    };
  }

  upsert(record: ExperienceInputRecord): ExperienceInputRecord {
    const payload = {
      record_id: record.record_id,
      episode_id: record.episode_id ?? null,
      scope_id: record.scope_id,
      session_id: record.session_id ?? null,
      task_type: record.task_type,
      task_summary: record.task_summary,
      outcome_signal: record.outcome_signal,
      context_summary: record.context_summary ?? null,
      evidence_json: JSON.stringify(record.evidence),
      injected_node_ids_json: JSON.stringify(record.injected_node_ids),
      trace_capsule_id: record.trace_capsule_id ?? null,
      trace_completeness: typeof record.trace_completeness === "number" ? record.trace_completeness : null,
      trace_provenance_json: record.trace_provenance ? JSON.stringify(record.trace_provenance) : null,
      created_at: record.created_at
    };

    this.db
      .prepare(
        `INSERT INTO experience_input_records
          (record_id, episode_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary, evidence_json, injected_node_ids_json, trace_capsule_id, trace_completeness, trace_provenance_json, created_at)
         VALUES
          (@record_id, @episode_id, @scope_id, @session_id, @task_type, @task_summary, @outcome_signal, @context_summary, @evidence_json, @injected_node_ids_json, @trace_capsule_id, @trace_completeness, @trace_provenance_json, @created_at)
         ON CONFLICT(record_id) DO UPDATE SET
          episode_id = excluded.episode_id,
          outcome_signal = excluded.outcome_signal,
          context_summary = excluded.context_summary,
          evidence_json = excluded.evidence_json,
          injected_node_ids_json = excluded.injected_node_ids_json,
          trace_capsule_id = excluded.trace_capsule_id,
          trace_completeness = excluded.trace_completeness,
          trace_provenance_json = excluded.trace_provenance_json`
      )
      .run(payload);
    return record;
  }

  getLatest(): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as InputRecordRow | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  getLatestInjected(): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         WHERE injected_node_ids_json != '[]'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as InputRecordRow | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  getLatestInjectedByScope(scopeId: string): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         WHERE scope_id = ? AND injected_node_ids_json != '[]'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(scopeId) as InputRecordRow | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  getLatestBySessionId(sessionId: string): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(sessionId) as InputRecordRow | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  getLatestByScope(scopeId: string): ExperienceInputRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         WHERE scope_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(scopeId) as InputRecordRow | undefined;

    return row ? this.mapRecord(row) : undefined;
  }

  listByIds(recordIds: string[]): ExperienceInputRecord[] {
    if (!recordIds.length) {
      return [];
    }

    const placeholders = recordIds.map(() => "?").join(", ");
    return this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         WHERE record_id IN (${placeholders})`
      )
      .all(...recordIds)
      .map((row) => this.mapRecord(row as InputRecordRow));
  }

  listByEpisodeId(episodeId: string): ExperienceInputRecord[] {
    return this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         WHERE episode_id = ?
         ORDER BY created_at DESC`
      )
      .all(episodeId)
      .map((row) => this.mapRecord(row as InputRecordRow));
  }

  listRecent(options: { limit?: number; injectedOnly?: boolean } = {}): ExperienceInputRecord[] {
    const limit = options.limit ?? 10;
    const whereClause = options.injectedOnly ? "WHERE injected_node_ids_json != '[]'" : "";

    return this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit)
      .map((row) => this.mapRecord(row as InputRecordRow));
  }

  listRecentByScope(scopeId: string, limit = 10): ExperienceInputRecord[] {
    return this.db
      .prepare(
        `SELECT *
         FROM experience_input_records
         WHERE scope_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(scopeId, limit)
      .map((row) => this.mapRecord(row as InputRecordRow));
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
