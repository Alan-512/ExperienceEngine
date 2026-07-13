import type { ExperienceEngineConfig } from "../config/config-schema.js";
import {
  LEARNING_FAILURE_POLICIES
} from "../runtime/learning-queue/constants.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type {
  DistillationJob,
  ExperienceCandidate
} from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { classifyDistillationFailure } from "./errors.js";
import {
  SemanticDistillationProcessor,
  type SemanticProcessorRuntimeOptions
} from "./semantic-processor.js";

const DISTILLATION_STALE_PROCESSING_MS = 150_000;

export class DistillationQueueWorker {
  private readonly semanticProcessor: SemanticDistillationProcessor;

  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly candidateRepo: CandidateRepository,
    private readonly jobRepo: DistillationJobRepository,
    private readonly nodeRepo: NodeRepository,
    options: SemanticProcessorRuntimeOptions = {}
  ) {
    this.semanticProcessor = new SemanticDistillationProcessor(
      config,
      nodeRepo,
      options
    );
  }

  async drain(limit: number = this.config.distillationBatchSize): Promise<number> {
    this.recoverStaleProcessingJobs();
    const runnableJobs = [
      ...this.jobRepo.listByStatus("pending"),
      ...this.jobRepo
        .listByStatus("failed")
        .filter(
          (job) =>
            (job.content_retry_count ?? job.retry_count) <
            this.config.distillationMaxRetries
        )
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
      .filter(
        (job) =>
          now - Date.parse(job.updated_at) >=
          DISTILLATION_STALE_PROCESSING_MS
      );
    for (const job of staleJobs) {
      const candidate = this.candidateRepo.getById(job.candidate_id);
      if (!candidate) {
        const discardedAt = nowIso();
        this.jobRepo.upsert({
          ...job,
          status: "discarded",
          state_revision: (job.state_revision ?? 1) + 1,
          failure_code: "EE_CANDIDATE_MISSING",
          failure_class: "terminal",
          failure_scope: "candidate",
          terminal_reason_code: "EE_CANDIDATE_MISSING",
          last_error: "EE_CANDIDATE_MISSING",
          discarded_at: discardedAt,
          updated_at: discardedAt
        });
        continue;
      }
      const interruptedAt = nowIso();
      this.candidateRepo.upsert({
        ...candidate,
        lifecycle_state: "pending",
        state_revision: (candidate.state_revision ?? 1) + 1,
        content_retry_count:
          candidate.content_retry_count ?? candidate.retry_count,
        retry_count: candidate.content_retry_count ?? candidate.retry_count,
        failure_code: "EE_WORKER_INTERRUPTED",
        failure_class: "interruption",
        failure_scope: "worker_claim",
        blocked_at: undefined,
        terminal_reason_code: undefined,
        last_error: "EE_WORKER_INTERRUPTED",
        updated_at: interruptedAt
      });
      this.jobRepo.upsert({
        ...job,
        status: "pending",
        state_revision: (job.state_revision ?? 1) + 1,
        failure_code: "EE_WORKER_INTERRUPTED",
        failure_class: "interruption",
        failure_scope: "worker_claim",
        interruption_count: (job.interruption_count ?? 0) + 1,
        content_retry_count: job.content_retry_count ?? job.retry_count,
        retry_count: job.content_retry_count ?? job.retry_count,
        next_attempt_at: interruptedAt,
        blocked_at: undefined,
        terminal_reason_code: undefined,
        last_error: "EE_WORKER_INTERRUPTED",
        finished_at: undefined,
        updated_at: interruptedAt
      });
    }
  }

  private markJobFailure(
    job: DistillationJob,
    candidate: ExperienceCandidate,
    error: unknown
  ): void {
    const classification = classifyDistillationFailure(error);
    const policy = LEARNING_FAILURE_POLICIES[classification.code];
    const failedAt = nowIso();
    const currentContentRetryCount =
      candidate.content_retry_count ?? candidate.retry_count;
    const nextContentRetryCount =
      policy.counter_effect === "content_retry"
        ? currentContentRetryCount + 1
        : currentContentRetryCount;
    const shouldDiscard =
      policy.counter_effect === "content_retry" &&
      nextContentRetryCount > this.config.distillationMaxRetries;
    const candidateState = shouldDiscard
      ? "discarded"
      : policy.failure_class === "candidate_content"
        ? "failed"
        : "blocked";
    const jobState = shouldDiscard
      ? "discarded"
      : policy.failure_class === "candidate_content"
        ? "failed"
        : "blocked";
    this.candidateRepo.upsert({
      ...candidate,
      lifecycle_state: candidateState,
      state_revision: (candidate.state_revision ?? 1) + 1,
      content_retry_count: nextContentRetryCount,
      retry_count: nextContentRetryCount,
      failure_code: classification.code,
      failure_class: policy.failure_class,
      failure_scope: policy.failure_scope,
      blocked_at: candidateState === "blocked" ? failedAt : undefined,
      terminal_reason_code:
        shouldDiscard ? classification.code : undefined,
      last_error: classification.code,
      last_failed_at: failedAt,
      discarded_at: shouldDiscard ? failedAt : candidate.discarded_at,
      updated_at: failedAt
    });
    this.jobRepo.upsert({
      ...job,
      status: jobState,
      state_revision: (job.state_revision ?? 1) + 1,
      failure_bucket: classification.compatibilityBucket,
      failure_code: classification.code,
      failure_class: policy.failure_class,
      failure_scope: policy.failure_scope,
      content_retry_count: nextContentRetryCount,
      retry_count: nextContentRetryCount,
      blocked_at: jobState === "blocked" ? failedAt : undefined,
      terminal_reason_code:
        shouldDiscard ? classification.code : undefined,
      next_attempt_at: failedAt,
      last_error: classification.code,
      finished_at: failedAt,
      discarded_at: shouldDiscard ? failedAt : job.discarded_at,
      updated_at: failedAt
    });
  }

  private async processJob(job: DistillationJob): Promise<void> {
    const candidate = this.candidateRepo.getById(job.candidate_id);
    if (
      !candidate ||
      candidate.lifecycle_state === "discarded" ||
      candidate.lifecycle_state === "distilled"
    ) {
      const discardedAt = nowIso();
      this.jobRepo.upsert({
        ...job,
        status: "discarded",
        discarded_at: discardedAt,
        updated_at: discardedAt
      });
      return;
    }
    const processingNow = nowIso();
    this.jobRepo.upsert({
      ...job,
      status: "processing",
      state_revision: (job.state_revision ?? 1) + 1,
      system_attempt_count: (job.system_attempt_count ?? 0) + 1,
      failure_code: undefined,
      failure_class: undefined,
      failure_scope: undefined,
      blocked_at: undefined,
      terminal_reason_code: undefined,
      started_at: job.started_at ?? processingNow,
      updated_at: processingNow
    });
    try {
      const { node } = await this.semanticProcessor.process(candidate);
      this.nodeRepo.upsert(node);
      const completedAt = nowIso();
      this.candidateRepo.upsert({
        ...candidate,
        lifecycle_state: "distilled",
        state_revision: (candidate.state_revision ?? 1) + 1,
        content_retry_count:
          candidate.content_retry_count ?? candidate.retry_count,
        distilled_node_id: node.id,
        failure_code: undefined,
        failure_class: undefined,
        failure_scope: undefined,
        blocked_at: undefined,
        terminal_reason_code: undefined,
        last_error: undefined,
        distilled_at: completedAt,
        updated_at: completedAt
      });
      this.jobRepo.upsert({
        ...job,
        status: "succeeded",
        state_revision: (job.state_revision ?? 1) + 2,
        system_attempt_count: (job.system_attempt_count ?? 0) + 1,
        content_retry_count: job.content_retry_count ?? job.retry_count,
        distillation_source: node.distillation_source,
        failure_bucket: undefined,
        failure_code: undefined,
        failure_class: undefined,
        failure_scope: undefined,
        blocked_at: undefined,
        terminal_reason_code: undefined,
        last_error: undefined,
        finished_at: completedAt,
        updated_at: completedAt
      });
    } catch (error) {
      this.markJobFailure(
        {
          ...job,
          state_revision: (job.state_revision ?? 1) + 1,
          system_attempt_count: (job.system_attempt_count ?? 0) + 1
        },
        candidate,
        error
      );
    }
  }
}
