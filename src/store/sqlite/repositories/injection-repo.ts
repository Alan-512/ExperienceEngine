import type { DatabaseSync } from "node:sqlite";
import type { InjectionEvent } from "../../../types/domain.js";

export class InjectionRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapEvent(row: {
    injection_id: string;
    session_id: string | null;
    scope_id: string;
    task_type: InjectionEvent["task_type"];
    task_summary: string | null;
    mode: InjectionEvent["mode"];
    delivery_mode: InjectionEvent["delivery_mode"];
    delivered: number;
    injected_node_ids_json: string;
    injection_count: number;
    scorecard_json: string | null;
    was_successful: number | null;
    harm_observed: number | null;
    created_at: string;
    resolved_at: string | null;
  }): InjectionEvent {
    return {
      injection_id: row.injection_id,
      session_id: row.session_id ?? undefined,
      scope_id: row.scope_id,
      task_type: row.task_type,
      task_summary: row.task_summary ?? undefined,
      mode: row.mode,
      delivery_mode: row.delivery_mode,
      delivered: Boolean(row.delivered),
      injected_node_ids: JSON.parse(row.injected_node_ids_json) as string[],
      injection_count: row.injection_count,
      scorecard: row.scorecard_json ? (JSON.parse(row.scorecard_json) as InjectionEvent["scorecard"]) : undefined,
      was_successful: row.was_successful == null ? null : Boolean(row.was_successful),
      harm_observed: row.harm_observed == null ? null : Boolean(row.harm_observed),
      created_at: row.created_at,
      resolved_at: row.resolved_at ?? undefined
    };
  }

  upsert(event: InjectionEvent): InjectionEvent {
    const payload = {
      injection_id: event.injection_id,
      session_id: event.session_id ?? null,
      scope_id: event.scope_id,
      task_type: event.task_type,
      task_summary: event.task_summary ?? null,
      mode: event.mode,
      delivery_mode: event.delivery_mode,
      delivered: Number(event.delivered),
      injected_node_ids_json: JSON.stringify(event.injected_node_ids),
      injection_count: event.injection_count,
      scorecard_json: event.scorecard ? JSON.stringify(event.scorecard) : null,
      was_successful: event.was_successful == null ? null : Number(event.was_successful),
      harm_observed: event.harm_observed == null ? null : Number(event.harm_observed),
      created_at: event.created_at,
      resolved_at: event.resolved_at ?? null
    };

    this.db
      .prepare(
        `INSERT INTO injection_events
          (injection_id, session_id, scope_id, task_type, task_summary, mode, delivery_mode, delivered, injected_node_ids_json, injection_count, scorecard_json, was_successful, harm_observed, created_at, resolved_at)
         VALUES
          (@injection_id, @session_id, @scope_id, @task_type, @task_summary, @mode, @delivery_mode, @delivered, @injected_node_ids_json, @injection_count, @scorecard_json, @was_successful, @harm_observed, @created_at, @resolved_at)
         ON CONFLICT(injection_id) DO UPDATE SET
          session_id = excluded.session_id,
          task_summary = excluded.task_summary,
          delivery_mode = excluded.delivery_mode,
          delivered = excluded.delivered,
          scorecard_json = excluded.scorecard_json,
          was_successful = excluded.was_successful,
          harm_observed = excluded.harm_observed,
          resolved_at = excluded.resolved_at`
      )
      .run(payload);
    return event;
  }

  getLatest(): InjectionEvent | undefined {
    const row = this.db
      .prepare(
        `SELECT injection_id, session_id, scope_id, task_type, task_summary, mode, delivery_mode, delivered, injected_node_ids_json,
                injection_count, scorecard_json, was_successful, harm_observed, created_at, resolved_at
         FROM injection_events
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as Parameters<typeof this.mapEvent>[0] | undefined;

    return row ? this.mapEvent(row) : undefined;
  }

  getLatestBySessionId(sessionId: string): InjectionEvent | undefined {
    const row = this.db
      .prepare(
        `SELECT injection_id, session_id, scope_id, task_type, task_summary, mode, delivery_mode, delivered, injected_node_ids_json,
                injection_count, scorecard_json, was_successful, harm_observed, created_at, resolved_at
         FROM injection_events
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(sessionId) as Parameters<typeof this.mapEvent>[0] | undefined;

    return row ? this.mapEvent(row) : undefined;
  }
}
