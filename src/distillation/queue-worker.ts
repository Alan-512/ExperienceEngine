import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";
import type { ExperienceCandidate, ExperienceCandidateDraft, ExperienceNode } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { LlmDistiller } from "./llm-distiller.js";
import type { DistillationJob } from "../types/domain.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { buildLegacyEmbedding, embedPassageText, withEmbeddingMetadata } from "../store/vector/embeddings.js";
import { transitionState } from "../feedback/state-transition.js";
import { getDistillationFailureBucket } from "./errors.js";

const DISTILLATION_STALE_PROCESSING_MS = 60_000;

const buildRetrievalText = (candidate: ExperienceCandidateDraft): string =>
  [candidate.trigger_pattern, candidate.compact_hint, candidate.goal, candidate.evidence_summary]
    .filter(Boolean)
    .join("\n");

const mergeIds = (existing: string[] | undefined, next: string[]): string[] => {
  const merged = new Set([...(existing ?? []), ...next]);
  return [...merged];
};

const distilledDraftToNode = (candidate: ExperienceCandidate, distilled: ExperienceCandidateDraft, existing?: ExperienceNode): ExperienceNode => {
  const timestamp = nowIso();
  const id =
    existing?.id ??
    stableId("node", [candidate.scope_id, candidate.task_type, candidate.node_type, distilled.compact_hint].join(":"));

  const retrievalText = buildRetrievalText(distilled);
  const legacyEmbedding = buildLegacyEmbedding(retrievalText);

  return {
    id,
    ...distilled,
    retrieval_text: retrievalText,
    ...withEmbeddingMetadata(legacyEmbedding),
    distillation_mode_used: distilled.distillation_mode_used ?? existing?.distillation_mode_used,
    distillation_source: distilled.distillation_source ?? existing?.distillation_source,
    redistilled_from:
      existing?.distillation_source &&
      distilled.distillation_source &&
      existing.distillation_source !== distilled.distillation_source
        ? existing.distillation_source
        : existing?.redistilled_from,
    origin_record_ids: mergeIds(existing?.origin_record_ids, [candidate.source_record_id]),
    helped_record_ids: existing?.helped_record_ids ?? [],
    harmed_record_ids: existing?.harmed_record_ids ?? [],
    state: existing?.state ?? "candidate",
    usage_count: existing?.usage_count ?? 0,
    helped_count: existing?.helped_count ?? 0,
    harmed_count: existing?.harmed_count ?? 0,
    support_count: (existing?.support_count ?? 0) + 1,
    created_at: existing?.created_at ?? timestamp,
    last_used_at: existing?.last_used_at,
    last_helped_at: existing?.last_helped_at,
    last_harmed_at: existing?.last_harmed_at,
    updated_at: timestamp
  };
};

export class DistillationQueueWorker {
  private readonly distiller: LlmDistiller;

  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly candidateRepo: CandidateRepository,
    private readonly jobRepo: DistillationJobRepository,
    private readonly nodeRepo: NodeRepository,
    options: ConstructorParameters<typeof LlmDistiller>[1] = {}
  ) {
    this.distiller = new LlmDistiller(config, options);
  }

  async drain(limit: number = this.config.distillationBatchSize): Promise<number> {
    this.recoverStaleProcessingJobs();

    const runnableJobs = [
      ...this.jobRepo.listByStatus("pending"),
      ...this.jobRepo
        .listByStatus("failed")
        .filter((job) => job.retry_count < this.config.distillationMaxRetries)
    ]
      .sort((left, right) => left.updated_at.localeCompare(right.updated_at))
      .slice(0, limit);

    for (const job of runnableJobs) {
      await this.processJob(job);
    }

    return runnableJobs.length;
  }

  private recoverStaleProcessingJobs(): void {
    const now = Date.now();
    const staleJobs = this.jobRepo
      .listByStatus("processing")
      .filter((job) => now - Date.parse(job.updated_at) >= DISTILLATION_STALE_PROCESSING_MS);

    for (const job of staleJobs) {
      const candidate = this.candidateRepo.getById(job.candidate_id);
      if (!candidate) {
        this.jobRepo.upsert({
          ...job,
          status: "discarded",
          last_error: "Distillation processing lease expired after the candidate disappeared.",
          discarded_at: nowIso(),
          updated_at: nowIso()
        });
        continue;
      }

      this.markJobFailure(job, candidate, "Distillation processing timed out or the worker was interrupted.");
    }
  }

  private markJobFailure(
    job: DistillationJob,
    candidate: ExperienceCandidate,
    message: string,
    failureBucket = "distillation_failed"
  ): void {
    const nextRetryCount = candidate.retry_count + 1;
    const failedAt = nowIso();
    const shouldDiscard = nextRetryCount > this.config.distillationMaxRetries;

    this.candidateRepo.upsert({
      ...candidate,
      lifecycle_state: shouldDiscard ? "discarded" : "failed",
      retry_count: nextRetryCount,
      last_error: message,
      last_failed_at: failedAt,
      discarded_at: shouldDiscard ? failedAt : candidate.discarded_at,
      updated_at: failedAt
    });
    this.jobRepo.upsert({
      ...job,
      status: shouldDiscard ? "discarded" : "failed",
      failure_bucket: failureBucket,
      retry_count: nextRetryCount,
      last_error: message,
      finished_at: failedAt,
      discarded_at: shouldDiscard ? failedAt : job.discarded_at,
      updated_at: failedAt
    });
  }

  private async processJob(job: DistillationJob): Promise<void> {
    const candidate = this.candidateRepo.getById(job.candidate_id);
    if (!candidate || candidate.lifecycle_state === "discarded" || candidate.lifecycle_state === "distilled") {
      this.jobRepo.upsert({
        ...job,
        status: "discarded",
        discarded_at: nowIso(),
        updated_at: nowIso()
      });
      return;
    }

    const processingNow = nowIso();
    this.jobRepo.upsert({
      ...job,
      status: "processing",
      started_at: job.started_at ?? processingNow,
      updated_at: processingNow
    });

    try {
      const distilled = await this.distiller.distill(candidate);
      const resolvedNodeId =
        candidate.distilled_node_id ??
        stableId("node", [candidate.scope_id, candidate.task_type, candidate.node_type, distilled.compact_hint].join(":"));
      const existingNode = this.nodeRepo.getById(resolvedNodeId);
      const node = distilledDraftToNode(candidate, distilled, existingNode);
      const semanticEmbedding = await embedPassageText(node.retrieval_text ?? `${node.trigger_pattern}\n${node.compact_hint}`, {
        config: this.config
      });
      this.nodeRepo.upsert({
        ...node,
        ...withEmbeddingMetadata(semanticEmbedding),
        state: transitionState(node)
      });

      const completedAt = nowIso();
      this.candidateRepo.upsert({
        ...candidate,
        lifecycle_state: "distilled",
        distilled_node_id: node.id,
        last_error: undefined,
        distilled_at: completedAt,
        updated_at: completedAt
      });
      this.jobRepo.upsert({
        ...job,
        status: "succeeded",
        distillation_source: node.distillation_source,
        failure_bucket: undefined,
        last_error: undefined,
        finished_at: completedAt,
        updated_at: completedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.markJobFailure(job, candidate, message, getDistillationFailureBucket(error));
    }
  }
}
