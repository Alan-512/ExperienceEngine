import type { DatabaseSync } from "node:sqlite";
import type { InjectionEvent } from "../../../types/domain.js";

export class InjectionRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsert(event: InjectionEvent): InjectionEvent {
    const payload = {
      injection_id: event.injection_id,
      scope_id: event.scope_id,
      task_type: event.task_type,
      mode: event.mode,
      injected_node_ids_json: JSON.stringify(event.injected_node_ids),
      injection_count: event.injection_count,
      was_successful: event.was_successful == null ? null : Number(event.was_successful),
      harm_observed: event.harm_observed == null ? null : Number(event.harm_observed),
      created_at: event.created_at,
      resolved_at: event.resolved_at ?? null
    };

    this.db
      .prepare(
        `INSERT INTO injection_events
          (injection_id, scope_id, task_type, mode, injected_node_ids_json, injection_count, was_successful, harm_observed, created_at, resolved_at)
         VALUES
          (@injection_id, @scope_id, @task_type, @mode, @injected_node_ids_json, @injection_count, @was_successful, @harm_observed, @created_at, @resolved_at)
         ON CONFLICT(injection_id) DO UPDATE SET
          was_successful = excluded.was_successful,
          harm_observed = excluded.harm_observed,
          resolved_at = excluded.resolved_at`
      )
      .run(payload);
    return event;
  }
}
