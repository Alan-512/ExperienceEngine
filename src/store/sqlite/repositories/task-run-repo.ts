import type { DatabaseSync } from "node:sqlite";
import type { TaskRun } from "../../../types/domain.js";

type TaskRunRow = {
  id: string;
  host: TaskRun["host"];
  scope_id: string;
  session_id: string | null;
  task_type: TaskRun["task_type"];
  task_summary: string;
  prompt_excerpt: string | null;
  context_summary: string | null;
  started_at: string;
  ended_at: string | null;
  final_status: TaskRun["final_status"];
  failure_signature: string | null;
  created_at: string;
  updated_at: string;
};

export class TaskRunRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(row: TaskRunRow): TaskRun {
    return {
      id: row.id,
      host: row.host,
      scope_id: row.scope_id,
      session_id: row.session_id ?? undefined,
      task_type: row.task_type,
      task_summary: row.task_summary,
      prompt_excerpt: row.prompt_excerpt ?? undefined,
      context_summary: row.context_summary ?? undefined,
      started_at: row.started_at,
      ended_at: row.ended_at ?? undefined,
      final_status: row.final_status,
      failure_signature: row.failure_signature ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  upsert(taskRun: TaskRun): TaskRun {
    this.db
      .prepare(
        `INSERT INTO task_runs
          (id, host, scope_id, session_id, task_type, task_summary, prompt_excerpt, context_summary,
           started_at, ended_at, final_status, failure_signature, created_at, updated_at)
         VALUES
          (@id, @host, @scope_id, @session_id, @task_type, @task_summary, @prompt_excerpt, @context_summary,
           @started_at, @ended_at, @final_status, @failure_signature, @created_at, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
          ended_at = excluded.ended_at,
          final_status = excluded.final_status,
          failure_signature = excluded.failure_signature,
          prompt_excerpt = excluded.prompt_excerpt,
          context_summary = excluded.context_summary,
          updated_at = excluded.updated_at`
      )
      .run({
        id: taskRun.id,
        host: taskRun.host,
        scope_id: taskRun.scope_id,
        session_id: taskRun.session_id ?? null,
        task_type: taskRun.task_type,
        task_summary: taskRun.task_summary,
        prompt_excerpt: taskRun.prompt_excerpt ?? null,
        context_summary: taskRun.context_summary ?? null,
        started_at: taskRun.started_at,
        ended_at: taskRun.ended_at ?? null,
        final_status: taskRun.final_status,
        failure_signature: taskRun.failure_signature ?? null,
        created_at: taskRun.created_at,
        updated_at: taskRun.updated_at
      });

    return taskRun;
  }

  getById(id: string): TaskRun | undefined {
    const row = this.db.prepare("SELECT * FROM task_runs WHERE id = ? LIMIT 1").get(id) as TaskRunRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getLatestBySessionId(sessionId: string): TaskRun | undefined {
    const row = this.db
      .prepare("SELECT * FROM task_runs WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1")
      .get(sessionId) as TaskRunRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number }).count;
  }

  countByScope(scopeId: string): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM task_runs WHERE scope_id = ?")
        .get(scopeId) as { count: number }
    ).count;
  }
}
