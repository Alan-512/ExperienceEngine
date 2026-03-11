import type { DatabaseSync } from "node:sqlite";
import type { ExperienceInputRecord } from "../../../types/domain.js";

export class InputRecordRepository {
  constructor(private readonly db: DatabaseSync) {}

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
}
