import type { DatabaseSync } from "node:sqlite";
import type { OutcomeRecord } from "../../../types/domain.js";

type OutcomeRecordRow = {
  id: string;
  task_run_id: string;
  outcome_signal: OutcomeRecord["outcome_signal"];
  failure_signature: string | null;
  summary: string;
  created_at: string;
};

export class OutcomeRecordRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(row: OutcomeRecordRow): OutcomeRecord {
    return {
      id: row.id,
      task_run_id: row.task_run_id,
      outcome_signal: row.outcome_signal,
      failure_signature: row.failure_signature ?? undefined,
      summary: row.summary,
      created_at: row.created_at
    };
  }

  upsert(record: OutcomeRecord): OutcomeRecord {
    this.db
      .prepare(
        `INSERT INTO outcome_records
          (id, task_run_id, outcome_signal, failure_signature, summary, created_at)
         VALUES
          (@id, @task_run_id, @outcome_signal, @failure_signature, @summary, @created_at)
         ON CONFLICT(id) DO UPDATE SET
          outcome_signal = excluded.outcome_signal,
          failure_signature = excluded.failure_signature,
          summary = excluded.summary`
      )
      .run({
        id: record.id,
        task_run_id: record.task_run_id,
        outcome_signal: record.outcome_signal,
        failure_signature: record.failure_signature ?? null,
        summary: record.summary,
        created_at: record.created_at
      });

    return record;
  }

  getById(id: string): OutcomeRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM outcome_records WHERE id = ? LIMIT 1")
      .get(id) as OutcomeRecordRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  listByTaskRunId(taskRunId: string): OutcomeRecord[] {
    return this.db
      .prepare("SELECT * FROM outcome_records WHERE task_run_id = ? ORDER BY created_at DESC")
      .all(taskRunId)
      .map((row) => this.mapRow(row as OutcomeRecordRow));
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM outcome_records").get() as { count: number }).count;
  }

  countByScope(scopeId: string): number {
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM outcome_records o
           JOIN task_runs tr ON tr.id = o.task_run_id
           WHERE tr.scope_id = ?`
        )
        .get(scopeId) as { count: number }
    ).count;
  }
}
