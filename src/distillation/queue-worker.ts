import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";
import type { ExperienceCandidate, ExperienceCandidateDraft, ExperienceNode } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { LlmDistiller } from "./llm-distiller.js";
import { LlmMergeDecider } from "./merge-decider.js";
import type { DistillationJob } from "../types/domain.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { buildLegacyEmbedding, embedPassageText, withEmbeddingMetadata } from "../store/vector/embeddings.js";
import { transitionState } from "../feedback/state-transition.js";
import { getDistillationFailureBucket } from "./errors.js";
import { tokenize } from "../utils/text.js";

const DISTILLATION_STALE_PROCESSING_MS = 150_000;
const NEAR_DUPLICATE_TRIGGER_SIMILARITY = 0.72;
const NEAR_DUPLICATE_HINT_SIMILARITY = 0.72;

const buildRetrievalText = (candidate: ExperienceCandidateDraft): string =>
  (candidate.experience_kind === "expectation_correction"
    ? [candidate.deviation_pattern, candidate.corrected_constraint, candidate.trigger_pattern]
    : [candidate.trigger_pattern, candidate.compact_hint, candidate.goal, candidate.evidence_summary]
  )
    .filter(Boolean)
    .join("\n");

const mergeIds = (existing: string[] | undefined, next: string[]): string[] => {
  const merged = new Set([...(existing ?? []), ...next]);
  return [...merged];
};

const triggerSimilarity = (left: string, right: string): number => {
  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right));
  if (!lhs.size || !rhs.size) {
    return 0;
  }

  const overlap = [...lhs].filter((token) => rhs.has(token)).length;
  const jaccardLike = overlap / Math.max(lhs.size, rhs.size);
  const inputCoverage = overlap / lhs.size;
  const candidateCoverage = overlap / rhs.size;
  return Math.max(jaccardLike, inputCoverage, candidateCoverage);
};

const reuseSimilarity = (left: ExperienceNode, right: ExperienceCandidateDraft): number =>
  Math.max(
    triggerSimilarity(left.trigger_pattern, right.trigger_pattern),
    triggerSimilarity(left.compact_hint, right.compact_hint)
  );

type MergeAction = "ADD" | "UPDATE" | "NONE";

type MergeDecision = {
  action: MergeAction;
  targetNodeId?: string;
  reason: string;
  source: "llm" | "rule";
};

const CONTENT_UPDATE_FIELDS: Array<keyof ExperienceCandidateDraft> = [
  "trigger_pattern",
  "compact_hint",
  "goal",
  "recommended_steps",
  "avoid_steps",
  "fallback_steps",
  "success_signal",
  "evidence_summary",
  "applicability_notes",
  "stop_condition",
  "escalation_condition"
];

const distilledDraftToNode = (
  candidate: ExperienceCandidate,
  distilled: ExperienceCandidateDraft,
  existing?: ExperienceNode,
  mergeAction: MergeAction = "ADD"
): ExperienceNode => {
  const timestamp = nowIso();
  const id =
    existing?.id ??
    stableId("node", [candidate.scope_id, candidate.task_type, candidate.node_type, distilled.compact_hint].join(":"));

  const baseDraft =
    mergeAction === "NONE" && existing
      ? ({
          ...existing,
          scope_id: existing.scope_id,
          task_type: existing.task_type,
          node_type: existing.node_type,
          source_kind: existing.source_kind
        } satisfies ExperienceCandidateDraft)
      : mergeAction === "UPDATE" && existing
        ? ({
            ...existing,
            ...Object.fromEntries(CONTENT_UPDATE_FIELDS.map((field) => [field, distilled[field] ?? existing[field]])),
            scope_id: existing.scope_id,
            task_type: existing.task_type,
            node_type: existing.node_type,
            source_kind: existing.source_kind
          } satisfies ExperienceCandidateDraft)
        : distilled;

  const retrievalText = buildRetrievalText(baseDraft);
  const legacyEmbedding = buildLegacyEmbedding(retrievalText);

  return {
    id,
    ...baseDraft,
    retrieval_text: retrievalText,
    ...withEmbeddingMetadata(legacyEmbedding),
    distillation_mode_used:
      mergeAction === "NONE"
        ? existing?.distillation_mode_used ?? distilled.distillation_mode_used
        : distilled.distillation_mode_used ?? existing?.distillation_mode_used,
    distillation_source:
      mergeAction === "NONE"
        ? existing?.distillation_source ?? distilled.distillation_source
        : distilled.distillation_source ?? existing?.distillation_source,
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

const findReusableNodes = (
  nodeRepo: NodeRepository,
  candidate: ExperienceCandidate,
  distilled: ExperienceCandidateDraft
): ExperienceNode[] =>
  nodeRepo
    .listByScope(candidate.scope_id)
    .filter((node) => node.task_type === candidate.task_type && node.node_type === candidate.node_type)
    .sort((left, right) => {
      const leftExact = left.trigger_pattern === distilled.trigger_pattern ? 1 : 0;
      const rightExact = right.trigger_pattern === distilled.trigger_pattern ? 1 : 0;
      if (leftExact !== rightExact) {
        return rightExact - leftExact;
      }

      const leftSimilarity = reuseSimilarity(left, distilled);
      const rightSimilarity = reuseSimilarity(right, distilled);
      if (leftSimilarity !== rightSimilarity) {
        return rightSimilarity - leftSimilarity;
      }

      const leftActive = left.state === "active" ? 1 : 0;
      const rightActive = right.state === "active" ? 1 : 0;
      if (leftActive !== rightActive) {
        return rightActive - leftActive;
      }

      if (left.support_count !== right.support_count) {
        return right.support_count - left.support_count;
      }

      return right.updated_at.localeCompare(left.updated_at);
    })
    .filter((node) => {
      const triggerScore = triggerSimilarity(node.trigger_pattern, distilled.trigger_pattern);
      const hintScore = triggerSimilarity(node.compact_hint, distilled.compact_hint);
      return triggerScore >= NEAR_DUPLICATE_TRIGGER_SIMILARITY || hintScore >= NEAR_DUPLICATE_HINT_SIMILARITY;
    })
    .slice(0, 3);

const buildFallbackMergeDecision = (existingNodes: ExperienceNode[], distilled: ExperienceCandidateDraft): MergeDecision => {
  const best = existingNodes[0];
  if (!best) {
    return { action: "ADD", reason: "no reusable node matched", source: "rule" };
  }

  const exactCoverage =
    best.trigger_pattern === distilled.trigger_pattern &&
    best.compact_hint.trim().toLowerCase() === distilled.compact_hint.trim().toLowerCase();
  if (exactCoverage) {
    return {
      action: "NONE",
      targetNodeId: best.id,
      reason: "existing node already covers the distilled experience",
      source: "rule"
    };
  }

  return {
    action: "UPDATE",
    targetNodeId: best.id,
    reason: "existing node is near-duplicate and should absorb the new expression",
    source: "rule"
  };
};

export class DistillationQueueWorker {
  private readonly distiller: LlmDistiller;
  private readonly mergeDecider: LlmMergeDecider;

  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly candidateRepo: CandidateRepository,
    private readonly jobRepo: DistillationJobRepository,
    private readonly nodeRepo: NodeRepository,
    options: ConstructorParameters<typeof LlmDistiller>[1] = {}
  ) {
    this.distiller = new LlmDistiller(config, options);
    this.mergeDecider = new LlmMergeDecider(config, options);
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
      const reusableNodes = findReusableNodes(this.nodeRepo, candidate, distilled);
      const fallbackMergeDecision = buildFallbackMergeDecision(reusableNodes, distilled);
      const mergeDecision = await this.mergeDecider.decide(candidate, distilled, reusableNodes, fallbackMergeDecision);
      const resolvedNodeId =
        mergeDecision.targetNodeId ??
        candidate.distilled_node_id ??
        stableId("node", [candidate.scope_id, candidate.task_type, candidate.node_type, distilled.compact_hint].join(":"));
      const existingNode = this.nodeRepo.getById(resolvedNodeId);
      const node = distilledDraftToNode(
        candidate,
        distilled,
        existingNode,
        existingNode ? mergeDecision.action : "ADD"
      );
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
