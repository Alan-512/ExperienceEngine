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
import {
  classifyDistillationFailure
} from "./errors.js";
import {
  LEARNING_FAILURE_POLICIES
} from "../runtime/learning-queue/constants.js";
import { tokenize } from "../utils/text.js";
import { areTaskFamiliesMergeCompatible, resolveExperienceFamily } from "./experience-family.js";

const DISTILLATION_STALE_PROCESSING_MS = 150_000;
const NEAR_DUPLICATE_TRIGGER_SIMILARITY = 0.72;
const NEAR_DUPLICATE_HINT_SIMILARITY = 0.72;
const EXPECTATION_CORRECTION_DIMENSION_SIMILARITY = 0.55;
const STRUCTURED_LESSON_OVERLAP_SIMILARITY = 0.66;

const buildRetrievalText = (candidate: ExperienceCandidateDraft): string =>
  (candidate.experience_kind === "expectation_correction"
    ? [candidate.deviation_pattern, candidate.corrected_constraint, candidate.trigger_pattern]
    : [candidate.trigger_pattern, candidate.compact_hint, candidate.goal, candidate.evidence_summary]
  )
    .filter(Boolean)
    .join("\n");

const hasStructuredGuidance = (candidate: ExperienceCandidateDraft): boolean =>
  Boolean(candidate.goal?.trim()) ||
  (candidate.recommended_steps?.length ?? 0) > 0 ||
  (candidate.avoid_steps?.length ?? 0) > 0 ||
  (candidate.fallback_steps?.length ?? 0) > 0;

const shouldInferHighValuePromotion = (
  candidate: ExperienceCandidate,
  distilled: ExperienceCandidateDraft
): boolean =>
  candidate.source_outcome_signal === "success" &&
  Boolean(distilled.success_signal?.trim()) &&
  hasStructuredGuidance(distilled) &&
  (
    distilled.experience_kind === "expectation_correction" ||
    (
      resolveExperienceFamily(candidate.task_type) !== "general" &&
      Boolean(distilled.goal?.trim()) &&
      (distilled.recommended_steps?.length ?? 0) > 0
    )
  );

const applyPriorityPromotionInference = (
  candidate: ExperienceCandidate,
  distilled: ExperienceCandidateDraft,
  existing?: ExperienceNode
): ExperienceCandidateDraft => {
  if (existing || distilled.promotion_signal === "high_value" || !shouldInferHighValuePromotion(candidate, distilled)) {
    return distilled;
  }

  return {
    ...distilled,
    promotion_signal: "high_value",
    promotion_reason:
      distilled.promotion_reason ??
      "Inferred high-value reusable guidance from a successful structured lesson with bounded execution steps."
  };
};

const shouldEnterPriorityCandidate = (
  candidate: ExperienceCandidate,
  distilled: ExperienceCandidateDraft
): boolean =>
  distilled.promotion_signal === "high_value" &&
  candidate.source_outcome_signal === "success" &&
  Boolean(distilled.success_signal?.trim()) &&
  hasStructuredGuidance(distilled) &&
  (distilled.experience_kind === "expectation_correction" || distilled.node_type === "warning" || Boolean(distilled.goal?.trim()));

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

const listSimilarity = (left: string[] | undefined, right: string[] | undefined): number => {
  const lhs = (left ?? []).flatMap((entry) => tokenize(entry));
  const rhs = (right ?? []).flatMap((entry) => tokenize(entry));
  if (!lhs.length || !rhs.length) {
    return 0;
  }

  const lhsSet = new Set(lhs);
  const rhsSet = new Set(rhs);
  const overlap = [...lhsSet].filter((token) => rhsSet.has(token)).length;
  return overlap / Math.max(lhsSet.size, rhsSet.size);
};

const normalizeSemanticText = (value: string | undefined): string =>
  value
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, " ") ?? "";

const semanticFieldMatches = (left: string | undefined, right: string | undefined): boolean => {
  const lhs = normalizeSemanticText(left);
  const rhs = normalizeSemanticText(right);
  if (!lhs || !rhs) {
    return false;
  }
  if (lhs === rhs) {
    return true;
  }
  return triggerSimilarity(lhs, rhs) >= EXPECTATION_CORRECTION_DIMENSION_SIMILARITY;
};

const reuseSimilarity = (left: ExperienceNode, right: ExperienceCandidateDraft): number =>
  Math.max(
    triggerSimilarity(left.trigger_pattern, right.trigger_pattern),
    triggerSimilarity(left.compact_hint, right.compact_hint)
  );

const structuredLessonOverlap = (left: ExperienceNode, right: ExperienceCandidateDraft): number =>
  triggerSimilarity(left.trigger_pattern, right.trigger_pattern) * 0.35 +
  triggerSimilarity(left.compact_hint, right.compact_hint) * 0.35 +
  listSimilarity(left.recommended_steps, right.recommended_steps) * 0.15 +
  listSimilarity(left.avoid_steps, right.avoid_steps) * 0.15;

const hasAlignedExpectationCorrectionDimension = (
  node: ExperienceNode,
  draft: ExperienceCandidateDraft
): boolean => {
  if (draft.experience_kind !== "expectation_correction") {
    return true;
  }

  if (node.experience_kind !== "expectation_correction") {
    return false;
  }

  const nodeCategory = normalizeSemanticText(node.correction_category);
  const draftCategory = normalizeSemanticText(draft.correction_category);
  if (!nodeCategory || !draftCategory || nodeCategory !== draftCategory) {
    return false;
  }

  const nodeDeviation = normalizeSemanticText(node.deviation_pattern);
  const draftDeviation = normalizeSemanticText(draft.deviation_pattern);
  if (!semanticFieldMatches(nodeDeviation, draftDeviation)) {
    return false;
  }

  const nodeConstraint = normalizeSemanticText(node.corrected_constraint);
  const draftConstraint = normalizeSemanticText(draft.corrected_constraint);
  if (!semanticFieldMatches(nodeConstraint, draftConstraint)) {
    return false;
  }

  return true;
};

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
  mergeDecision?: MergeDecision
): ExperienceNode => {
  const mergeAction = mergeDecision?.action ?? "ADD";
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
  const effectiveDraft = applyPriorityPromotionInference(candidate, baseDraft, existing);

  const retrievalText = buildRetrievalText(effectiveDraft);
  const legacyEmbedding = buildLegacyEmbedding(retrievalText);
  const priorityPromotionApplied = !existing && shouldEnterPriorityCandidate(candidate, effectiveDraft);

  return {
    id,
    ...effectiveDraft,
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
    merge_decision: mergeDecision?.action ?? existing?.merge_decision,
    merge_reason: mergeDecision?.reason ?? existing?.merge_reason,
    priority_promotion_applied: existing?.priority_promotion_applied ?? priorityPromotionApplied,
    origin_record_ids: mergeIds(existing?.origin_record_ids, [candidate.source_record_id]),
    helped_record_ids: existing?.helped_record_ids ?? [],
    harmed_record_ids: existing?.harmed_record_ids ?? [],
    state: existing?.state ?? (priorityPromotionApplied ? "priority_candidate" : "candidate"),
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
    .filter((node) => node.node_type === candidate.node_type)
    .filter((node) => areTaskFamiliesMergeCompatible(node.task_type, candidate.task_type))
    .sort((left, right) => {
      const leftTaskTypeExact = left.task_type === candidate.task_type ? 1 : 0;
      const rightTaskTypeExact = right.task_type === candidate.task_type ? 1 : 0;
      if (leftTaskTypeExact !== rightTaskTypeExact) {
        return rightTaskTypeExact - leftTaskTypeExact;
      }

      const leftExact = left.trigger_pattern === distilled.trigger_pattern ? 1 : 0;
      const rightExact = right.trigger_pattern === distilled.trigger_pattern ? 1 : 0;
      if (leftExact !== rightExact) {
        return rightExact - leftExact;
      }

      const leftSimilarity = structuredLessonOverlap(left, distilled);
      const rightSimilarity = structuredLessonOverlap(right, distilled);
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
      if (!hasAlignedExpectationCorrectionDimension(node, distilled)) {
        return false;
      }

      const triggerScore = triggerSimilarity(node.trigger_pattern, distilled.trigger_pattern);
      const hintScore = triggerSimilarity(node.compact_hint, distilled.compact_hint);
      const lessonScore = structuredLessonOverlap(node, distilled);
      return (
        triggerScore >= NEAR_DUPLICATE_TRIGGER_SIMILARITY ||
        hintScore >= NEAR_DUPLICATE_HINT_SIMILARITY ||
        lessonScore >= STRUCTURED_LESSON_OVERLAP_SIMILARITY
      );
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

  const familyAligned = resolveExperienceFamily(best.task_type) === resolveExperienceFamily(distilled.task_type);
  const lessonScore = structuredLessonOverlap(best, distilled);
  if (familyAligned && lessonScore >= STRUCTURED_LESSON_OVERLAP_SIMILARITY) {
    return {
      action: "UPDATE",
      targetNodeId: best.id,
      reason: "existing same-family node covers the same lesson and should absorb the new evidence",
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
      .filter((job) => now - Date.parse(job.updated_at) >= DISTILLATION_STALE_PROCESSING_MS);

    for (const job of staleJobs) {
      const candidate = this.candidateRepo.getById(job.candidate_id);
      if (!candidate) {
        this.jobRepo.upsert({
          ...job,
          status: "discarded",
          state_revision: (job.state_revision ?? 1) + 1,
          failure_code: "EE_CANDIDATE_MISSING",
          failure_class: "terminal",
          failure_scope: "candidate",
          terminal_reason_code: "EE_CANDIDATE_MISSING",
          last_error: "EE_CANDIDATE_MISSING",
          discarded_at: nowIso(),
          updated_at: nowIso()
        });
        continue;
      }
      const interruptedAt = nowIso();
      this.candidateRepo.upsert({
        ...candidate,
        lifecycle_state: "pending",
        state_revision: (candidate.state_revision ?? 1) + 1,
        content_retry_count: candidate.content_retry_count ?? candidate.retry_count,
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
    const nextContentRetryCount = policy.counter_effect === "content_retry"
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
      terminal_reason_code: shouldDiscard ? classification.code : undefined,
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
      terminal_reason_code: shouldDiscard ? classification.code : undefined,
      next_attempt_at: failedAt,
      last_error: classification.code,
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
      const distilled = await this.distiller.distill(candidate);
      const reusableNodes = findReusableNodes(this.nodeRepo, candidate, distilled);
      const fallbackMergeDecision = buildFallbackMergeDecision(reusableNodes, distilled);
      const mergeDecision = await this.mergeDecider.decide(candidate, distilled, reusableNodes, fallbackMergeDecision);
      const resolvedNodeId =
        mergeDecision.targetNodeId ??
        candidate.distilled_node_id ??
        stableId("node", [candidate.scope_id, candidate.task_type, candidate.node_type, distilled.compact_hint].join(":"));
      const existingNode = this.nodeRepo.getById(resolvedNodeId);
      const node = distilledDraftToNode(candidate, distilled, existingNode, mergeDecision);
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
        state_revision: (candidate.state_revision ?? 1) + 1,
        content_retry_count: candidate.content_retry_count ?? candidate.retry_count,
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
