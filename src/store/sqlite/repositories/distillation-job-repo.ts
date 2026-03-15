import type { DatabaseSync } from "node:sqlite";
import type { DistillationJob } from "../../../types/domain.js";

type DistillationJobRow = {
  id: string;
  candidate_id: string;
  status: DistillationJob["status"];
  extractor_profile: string;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  discarded_at: string | null;
};

export class DistillationJobRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapJob(row: DistillationJobRow): DistillationJob {
    return {
      id: row.id,
      candidate_id: row.candidate_id,
      status: row.status,
      extractor_profile: row.extractor_profile,
      retry_count: row.retry_count,
      last_error: row.last_error ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at ?? undefined,
      finished_at: row.finished_at ?? undefined,
      discarded_at: row.discarded_at ?? undefined
    };
  }

  upsert(job: DistillationJob): DistillationJob {
    const payload = {
      id: job.id,
      candidate_id: job.candidate_id,
      status: job.status,
      extractor_profile: job.extractor_profile,
      retry_count: job.retry_count,
      last_error: job.last_error ?? null,
      created_at: job.created_at,
      updated_at: job.updated_at,
      started_at: job.started_at ?? null,
      finished_at: job.finished_at ?? null,
      discarded_at: job.discarded_at ?? null
    };

    this.db
      .prepare(
        `INSERT INTO distillation_jobs
          (id, candidate_id, status, extractor_profile, retry_count, last_error, created_at, updated_at, started_at, finished_at, discarded_at)
         VALUES
          (@id, @candidate_id, @status, @extractor_profile, @retry_count, @last_error, @created_at, @updated_at, @started_at, @finished_at, @discarded_at)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           extractor_profile = excluded.extractor_profile,
           retry_count = excluded.retry_count,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at,
           started_at = excluded.started_at,
           finished_at = excluded.finished_at,
           discarded_at = excluded.discarded_at`
      )
      .run(payload);

    return job;
  }

  getById(id: string): DistillationJob | undefined {
    const row = this.db.prepare("SELECT * FROM distillation_jobs WHERE id = ? LIMIT 1").get(id) as
      | DistillationJobRow
      | undefined;
    return row ? this.mapJob(row) : undefined;
  }

  listByStatus(status: DistillationJob["status"]): DistillationJob[] {
    return this.db
      .prepare("SELECT * FROM distillation_jobs WHERE status = ? ORDER BY updated_at ASC")
      .all(status)
      .map((row) => this.mapJob(row as DistillationJobRow));
  }

  listByCandidateId(candidateId: string): DistillationJob[] {
    return this.db
      .prepare("SELECT * FROM distillation_jobs WHERE candidate_id = ? ORDER BY updated_at DESC")
      .all(candidateId)
      .map((row) => this.mapJob(row as DistillationJobRow));
  }
}
