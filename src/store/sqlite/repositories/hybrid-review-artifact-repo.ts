import type { DatabaseSync } from "node:sqlite";
import type { HybridReviewArtifact } from "../../../types/domain.js";

type HybridReviewArtifactRow = {
  id: string;
  task_run_id: string;
  scope_id: string;
  worker_task: HybridReviewArtifact["worker_task"];
  approval_class: HybridReviewArtifact["approval_class"];
  schema_version: string;
  route_policy_version: string;
  worker_profile_version: string;
  recommendation: HybridReviewArtifact["recommendation"];
  summary: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

export class HybridReviewArtifactRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(row: HybridReviewArtifactRow): HybridReviewArtifact {
    return {
      id: row.id,
      task_run_id: row.task_run_id,
      scope_id: row.scope_id,
      worker_task: row.worker_task,
      approval_class: row.approval_class,
      schema_version: row.schema_version,
      route_policy_version: row.route_policy_version,
      worker_profile_version: row.worker_profile_version,
      recommendation: row.recommendation,
      summary: row.summary,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  upsert(artifact: HybridReviewArtifact): HybridReviewArtifact {
    this.db
      .prepare(
        `INSERT INTO hybrid_review_artifacts
          (id, task_run_id, scope_id, worker_task, approval_class, schema_version, route_policy_version,
           worker_profile_version, recommendation, summary, payload_json, created_at, updated_at)
         VALUES
          (@id, @task_run_id, @scope_id, @worker_task, @approval_class, @schema_version, @route_policy_version,
           @worker_profile_version, @recommendation, @summary, @payload_json, @created_at, @updated_at)
         ON CONFLICT(task_run_id) DO UPDATE SET
          approval_class = excluded.approval_class,
          schema_version = excluded.schema_version,
          route_policy_version = excluded.route_policy_version,
          worker_profile_version = excluded.worker_profile_version,
          recommendation = excluded.recommendation,
          summary = excluded.summary,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`
      )
      .run({
        id: artifact.id,
        task_run_id: artifact.task_run_id,
        scope_id: artifact.scope_id,
        worker_task: artifact.worker_task,
        approval_class: artifact.approval_class,
        schema_version: artifact.schema_version,
        route_policy_version: artifact.route_policy_version,
        worker_profile_version: artifact.worker_profile_version,
        recommendation: artifact.recommendation,
        summary: artifact.summary,
        payload_json: JSON.stringify(artifact.payload),
        created_at: artifact.created_at,
        updated_at: artifact.updated_at
      });

    return artifact;
  }

  getByTaskRunId(taskRunId: string): HybridReviewArtifact | undefined {
    const row = this.db
      .prepare("SELECT * FROM hybrid_review_artifacts WHERE task_run_id = ? LIMIT 1")
      .get(taskRunId) as HybridReviewArtifactRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  listAll(): HybridReviewArtifact[] {
    return this.db
      .prepare("SELECT * FROM hybrid_review_artifacts ORDER BY created_at ASC")
      .all()
      .map((row) => this.mapRow(row as HybridReviewArtifactRow));
  }

  count(): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS count FROM hybrid_review_artifacts").get() as { count: number }
    ).count;
  }
}
