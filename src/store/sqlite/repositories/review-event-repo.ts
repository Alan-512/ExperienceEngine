import type { DatabaseSync } from "node:sqlite";
import type { ReviewEvent } from "../../../types/domain.js";

type ReviewEventRow = {
  id: string;
  node_id: string;
  task_run_id: string | null;
  event_type: ReviewEvent["event_type"];
  source: ReviewEvent["source"];
  created_at: string;
};

export class ReviewEventRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(row: ReviewEventRow): ReviewEvent {
    return {
      id: row.id,
      node_id: row.node_id,
      task_run_id: row.task_run_id ?? undefined,
      event_type: row.event_type,
      source: row.source,
      created_at: row.created_at
    };
  }

  upsert(event: ReviewEvent): ReviewEvent {
    this.db
      .prepare(
        `INSERT INTO review_events
          (id, node_id, task_run_id, event_type, source, created_at)
         VALUES
          (@id, @node_id, @task_run_id, @event_type, @source, @created_at)
         ON CONFLICT(id) DO UPDATE SET
          task_run_id = excluded.task_run_id,
          event_type = excluded.event_type,
          source = excluded.source`
      )
      .run({
        id: event.id,
        node_id: event.node_id,
        task_run_id: event.task_run_id ?? null,
        event_type: event.event_type,
        source: event.source,
        created_at: event.created_at
      });

    return event;
  }

  getById(id: string): ReviewEvent | undefined {
    const row = this.db.prepare("SELECT * FROM review_events WHERE id = ? LIMIT 1").get(id) as
      | ReviewEventRow
      | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  listByNodeId(nodeId: string): ReviewEvent[] {
    return this.db
      .prepare("SELECT * FROM review_events WHERE node_id = ? ORDER BY created_at DESC")
      .all(nodeId)
      .map((row) => this.mapRow(row as ReviewEventRow));
  }

  listByTaskRunId(taskRunId: string): ReviewEvent[] {
    return this.db
      .prepare("SELECT * FROM review_events WHERE task_run_id = ? ORDER BY created_at DESC")
      .all(taskRunId)
      .map((row) => this.mapRow(row as ReviewEventRow));
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as { count: number }).count;
  }

  countBySourceAndType(source: ReviewEvent["source"], eventType: ReviewEvent["event_type"]): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM review_events WHERE source = ? AND event_type = ?")
        .get(source, eventType) as { count: number }
    ).count;
  }
}
