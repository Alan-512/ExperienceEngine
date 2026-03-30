import type { DatabaseSync } from "node:sqlite";
import type { HybridInvocationTrace } from "../../../types/domain.js";

type HybridInvocationTraceRow = {
  id: string;
  surface: HybridInvocationTrace["surface"];
  session_id: string | null;
  scope_id: string | null;
  worker_task: HybridInvocationTrace["worker_task"] | null;
  route: string;
  route_policy_version: string;
  capsule_schema_version: string | null;
  worker_profile_version: string | null;
  rollout_mode: string;
  rollout_reason: string;
  worker_ran: number;
  validation_status: HybridInvocationTrace["validation_status"];
  output_action: HybridInvocationTrace["output_action"];
  fallback_reason: string | null;
  created_at: string;
};

export class HybridInvocationTraceRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(row: HybridInvocationTraceRow): HybridInvocationTrace {
    return {
      id: row.id,
      surface: row.surface,
      session_id: row.session_id ?? undefined,
      scope_id: row.scope_id ?? undefined,
      worker_task: row.worker_task ?? undefined,
      route: row.route,
      route_policy_version: row.route_policy_version,
      capsule_schema_version: row.capsule_schema_version ?? undefined,
      worker_profile_version: row.worker_profile_version ?? undefined,
      rollout_mode: row.rollout_mode,
      rollout_reason: row.rollout_reason,
      worker_ran: row.worker_ran === 1,
      validation_status: row.validation_status,
      output_action: row.output_action,
      fallback_reason: row.fallback_reason ?? undefined,
      created_at: row.created_at
    };
  }

  upsert(trace: HybridInvocationTrace): HybridInvocationTrace {
    this.db
      .prepare(
        `INSERT INTO hybrid_invocation_traces
          (id, surface, session_id, scope_id, worker_task, route, route_policy_version, capsule_schema_version,
           worker_profile_version, rollout_mode, rollout_reason, worker_ran, validation_status, output_action,
           fallback_reason, created_at)
         VALUES
          (@id, @surface, @session_id, @scope_id, @worker_task, @route, @route_policy_version, @capsule_schema_version,
           @worker_profile_version, @rollout_mode, @rollout_reason, @worker_ran, @validation_status, @output_action,
           @fallback_reason, @created_at)
         ON CONFLICT(id) DO UPDATE SET
          validation_status = excluded.validation_status,
          output_action = excluded.output_action,
          fallback_reason = excluded.fallback_reason`
      )
      .run({
        id: trace.id,
        surface: trace.surface,
        session_id: trace.session_id ?? null,
        scope_id: trace.scope_id ?? null,
        worker_task: trace.worker_task ?? null,
        route: trace.route,
        route_policy_version: trace.route_policy_version,
        capsule_schema_version: trace.capsule_schema_version ?? null,
        worker_profile_version: trace.worker_profile_version ?? null,
        rollout_mode: trace.rollout_mode,
        rollout_reason: trace.rollout_reason,
        worker_ran: trace.worker_ran ? 1 : 0,
        validation_status: trace.validation_status,
        output_action: trace.output_action,
        fallback_reason: trace.fallback_reason ?? null,
        created_at: trace.created_at
      });
    return trace;
  }

  listBySessionId(sessionId: string): HybridInvocationTrace[] {
    return this.db
      .prepare("SELECT * FROM hybrid_invocation_traces WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId)
      .map((row) => this.mapRow(row as HybridInvocationTraceRow));
  }

  listAll(): HybridInvocationTrace[] {
    return this.db
      .prepare("SELECT * FROM hybrid_invocation_traces ORDER BY created_at ASC")
      .all()
      .map((row) => this.mapRow(row as HybridInvocationTraceRow));
  }

  count(): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS count FROM hybrid_invocation_traces").get() as { count: number }
    ).count;
  }
}
