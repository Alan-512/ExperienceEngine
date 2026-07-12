import type { DatabaseSync } from "node:sqlite";
import type { DistillationJob } from "../../../types/domain.js";

type DistillationJobRow = {
  id: string;
  candidate_id: string;
  status: DistillationJob["status"];
  extractor_profile: string;
  distillation_source: string | null;
  failure_bucket: string | null;
  retry_count: number;
  home_id: string | null;
  state_revision: number;
  claim_id: string | null;
  claim_owner_id: string | null;
  claim_fencing_token: number | null;
  claimed_supervisor_owner_id: string | null;
  claimed_supervisor_lease_epoch: number | null;
  claimed_package_generation_id: string | null;
  claimed_activation_revision: number | null;
  claimed_production_activation_handshake_id: string | null;
  claimed_configuration_generation_id: string | null;
  claimed_effective_route_set_id: string | null;
  claimed_effective_route_revision: number | null;
  claimed_capability: string | null;
  claimed_route_fingerprint: string | null;
  claimed_schema_version: string | null;
  claimed_job_schema_version: string | null;
  claimed_candidate_schema_version: string | null;
  claimed_node_schema_version: string | null;
  claimed_at: string | null;
  claim_heartbeat_at: string | null;
  claim_expires_at: string | null;
  failure_code: string | null;
  failure_class: DistillationJob["failure_class"] | null;
  failure_scope: string | null;
  system_attempt_count: number;
  interruption_count: number;
  content_retry_count: number;
  next_attempt_at: string;
  blocked_at: string | null;
  route_fingerprint: string;
  terminal_reason_code: string | null;
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
      distillation_source: row.distillation_source as DistillationJob["distillation_source"],
      failure_bucket: row.failure_bucket ?? undefined,
      retry_count: row.retry_count,
      home_id: row.home_id ?? undefined,
      state_revision: row.state_revision,
      claim_id: row.claim_id ?? undefined,
      claim_owner_id: row.claim_owner_id ?? undefined,
      claim_fencing_token: row.claim_fencing_token ?? undefined,
      claimed_supervisor_owner_id: row.claimed_supervisor_owner_id ?? undefined,
      claimed_supervisor_lease_epoch: row.claimed_supervisor_lease_epoch ?? undefined,
      claimed_package_generation_id: row.claimed_package_generation_id ?? undefined,
      claimed_activation_revision: row.claimed_activation_revision ?? undefined,
      claimed_production_activation_handshake_id:
        row.claimed_production_activation_handshake_id ?? undefined,
      claimed_configuration_generation_id:
        row.claimed_configuration_generation_id ?? undefined,
      claimed_effective_route_set_id: row.claimed_effective_route_set_id ?? undefined,
      claimed_effective_route_revision:
        row.claimed_effective_route_revision ?? undefined,
      claimed_capability: row.claimed_capability ?? undefined,
      claimed_route_fingerprint: row.claimed_route_fingerprint ?? undefined,
      claimed_schema_version: row.claimed_schema_version ?? undefined,
      claimed_job_schema_version: row.claimed_job_schema_version ?? undefined,
      claimed_candidate_schema_version:
        row.claimed_candidate_schema_version ?? undefined,
      claimed_node_schema_version: row.claimed_node_schema_version ?? undefined,
      claimed_at: row.claimed_at ?? undefined,
      claim_heartbeat_at: row.claim_heartbeat_at ?? undefined,
      claim_expires_at: row.claim_expires_at ?? undefined,
      failure_code: row.failure_code ?? undefined,
      failure_class: row.failure_class ?? undefined,
      failure_scope: row.failure_scope ?? undefined,
      system_attempt_count: row.system_attempt_count,
      interruption_count: row.interruption_count,
      content_retry_count: row.content_retry_count,
      next_attempt_at: row.next_attempt_at,
      blocked_at: row.blocked_at ?? undefined,
      route_fingerprint: row.route_fingerprint,
      terminal_reason_code: row.terminal_reason_code ?? undefined,
      last_error: row.last_error ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at ?? undefined,
      finished_at: row.finished_at ?? undefined,
      discarded_at: row.discarded_at ?? undefined
    };
  }

  upsert(job: DistillationJob): DistillationJob {
    const has = (field: keyof DistillationJob): boolean =>
      Object.prototype.hasOwnProperty.call(job, field);
    const existing = this.db.prepare(
      `SELECT home_id, state_revision, failure_code, failure_class, failure_scope,
              system_attempt_count, interruption_count, content_retry_count,
              next_attempt_at, blocked_at, route_fingerprint, terminal_reason_code
       FROM distillation_jobs WHERE id = ? LIMIT 1`
    ).get(job.id) as {
      home_id: string | null;
      state_revision: number;
      failure_code: string | null;
      failure_class: DistillationJob["failure_class"] | null;
      failure_scope: string | null;
      system_attempt_count: number;
      interruption_count: number;
      content_retry_count: number;
      next_attempt_at: string;
      blocked_at: string | null;
      route_fingerprint: string;
      terminal_reason_code: string | null;
    } | undefined;
    if (existing?.home_id) {
      throw new Error(
        `Fenced learning job ${job.id} cannot be mutated through the legacy upsert repository.`
      );
    }
    const payload = {
      id: job.id,
      candidate_id: job.candidate_id,
      status: job.status,
      extractor_profile: job.extractor_profile,
      distillation_source: job.distillation_source ?? null,
      failure_bucket: job.failure_bucket ?? null,
      retry_count: job.retry_count,
      state_revision: job.state_revision ?? existing?.state_revision ?? 1,
      failure_code: has("failure_code")
        ? job.failure_code ?? null
        : existing?.failure_code ?? null,
      failure_class: has("failure_class")
        ? job.failure_class ?? null
        : existing?.failure_class ?? null,
      failure_scope: has("failure_scope")
        ? job.failure_scope ?? null
        : existing?.failure_scope ?? null,
      system_attempt_count:
        job.system_attempt_count ?? existing?.system_attempt_count ?? 0,
      interruption_count:
        job.interruption_count ?? existing?.interruption_count ?? 0,
      content_retry_count:
        job.content_retry_count ?? existing?.content_retry_count ?? job.retry_count,
      next_attempt_at:
        job.next_attempt_at ?? existing?.next_attempt_at ?? job.updated_at,
      blocked_at: has("blocked_at")
        ? job.blocked_at ?? null
        : existing?.blocked_at ?? null,
      route_fingerprint:
        job.route_fingerprint ?? existing?.route_fingerprint ?? "",
      terminal_reason_code: has("terminal_reason_code")
        ? job.terminal_reason_code ?? null
        : existing?.terminal_reason_code ?? null,
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
          (id, candidate_id, status, extractor_profile, distillation_source, failure_bucket, retry_count,
           state_revision, failure_code, failure_class, failure_scope, system_attempt_count,
           interruption_count, content_retry_count, next_attempt_at, blocked_at,
           route_fingerprint, terminal_reason_code, last_error, created_at, updated_at,
           started_at, finished_at, discarded_at)
         VALUES
          (@id, @candidate_id, @status, @extractor_profile, @distillation_source, @failure_bucket, @retry_count,
           @state_revision, @failure_code, @failure_class, @failure_scope, @system_attempt_count,
           @interruption_count, @content_retry_count, @next_attempt_at, @blocked_at,
           @route_fingerprint, @terminal_reason_code, @last_error, @created_at, @updated_at,
           @started_at, @finished_at, @discarded_at)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           extractor_profile = excluded.extractor_profile,
           distillation_source = excluded.distillation_source,
           failure_bucket = excluded.failure_bucket,
           retry_count = excluded.retry_count,
           state_revision = excluded.state_revision,
           failure_code = excluded.failure_code,
           failure_class = excluded.failure_class,
           failure_scope = excluded.failure_scope,
           system_attempt_count = excluded.system_attempt_count,
           interruption_count = excluded.interruption_count,
           content_retry_count = excluded.content_retry_count,
           next_attempt_at = excluded.next_attempt_at,
           blocked_at = excluded.blocked_at,
           route_fingerprint = excluded.route_fingerprint,
           terminal_reason_code = excluded.terminal_reason_code,
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
      .prepare(
        "SELECT * FROM distillation_jobs WHERE status = ? AND home_id IS NULL ORDER BY updated_at ASC"
      )
      .all(status)
      .map((row) => this.mapJob(row as DistillationJobRow));
  }

  listByCandidateId(candidateId: string): DistillationJob[] {
    return this.db
      .prepare(
        "SELECT * FROM distillation_jobs WHERE candidate_id = ? AND home_id IS NULL ORDER BY updated_at DESC"
      )
      .all(candidateId)
      .map((row) => this.mapJob(row as DistillationJobRow));
  }
}
