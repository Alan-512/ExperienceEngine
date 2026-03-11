import type { DatabaseSync } from "node:sqlite";
import type { ScopeTaskStats } from "../../../types/domain.js";

export class StatsRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsert(stats: ScopeTaskStats): ScopeTaskStats {
    this.db
      .prepare(
        `INSERT INTO scope_task_stats
          (scope_id, task_type, total_tasks, success_tasks, failed_tasks, unknown_tasks, injected_tasks, injected_success_tasks, updated_at)
         VALUES
          (@scope_id, @task_type, @total_tasks, @success_tasks, @failed_tasks, @unknown_tasks, @injected_tasks, @injected_success_tasks, @updated_at)
         ON CONFLICT(scope_id, task_type) DO UPDATE SET
          total_tasks = excluded.total_tasks,
          success_tasks = excluded.success_tasks,
          failed_tasks = excluded.failed_tasks,
          unknown_tasks = excluded.unknown_tasks,
          injected_tasks = excluded.injected_tasks,
          injected_success_tasks = excluded.injected_success_tasks,
          updated_at = excluded.updated_at`
      )
      .run(stats);
    return stats;
  }

  listAll(): ScopeTaskStats[] {
    return this.db.prepare("SELECT * FROM scope_task_stats ORDER BY updated_at DESC").all() as unknown as ScopeTaskStats[];
  }
}
