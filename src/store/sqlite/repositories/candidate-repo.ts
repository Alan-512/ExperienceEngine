import type { DatabaseSync } from "node:sqlite";
import type { ExperienceNode, TaskType } from "../../../types/domain.js";

export class CandidateRepository {
  constructor(private readonly db: DatabaseSync) {}

  listByScopeAndTask(scopeId: string, taskType: TaskType): ExperienceNode[] {
    return this.db
      .prepare(
        `SELECT * FROM experience_nodes
         WHERE scope_id = ? AND task_type = ? AND state IN ('candidate', 'active', 'cooling')
         ORDER BY updated_at DESC`
      )
      .all(scopeId, taskType) as unknown as ExperienceNode[];
  }
}
