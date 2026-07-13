import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { transitionState } from "../feedback/state-transition.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import {
  buildLegacyEmbedding,
  embedPassageText,
  type EmbeddingResult,
  withEmbeddingMetadata
} from "../store/vector/embeddings.js";
import type {
  ExperienceCandidate,
  ExperienceCandidateDraft,
  ExperienceNode
} from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";
import { tokenize } from "../utils/text.js";
import {
  areTaskFamiliesMergeCompatible,
  resolveExperienceFamily
} from "./experience-family.js";
import { LlmDistiller } from "./llm-distiller.js";
import { LlmMergeDecider } from "./merge-decider.js";

const NEAR_DUPLICATE_TRIGGER_SIMILARITY = 0.72;
const NEAR_DUPLICATE_HINT_SIMILARITY = 0.72;
const EXPECTATION_CORRECTION_DIMENSION_SIMILARITY = 0.55;
const STRUCTURED_LESSON_OVERLAP_SIMILARITY = 0.66;

type SemanticDistiller = Pick<LlmDistiller, "distill">;
type SemanticMergeDecider = Pick<LlmMergeDecider, "decide">;

export type SemanticMergeAction = "ADD" | "UPDATE" | "NONE";

export type SemanticMergeDecision = {
  action: SemanticMergeAction;
  targetNodeId?: string;
  reason: string;
  source: "llm" | "rule";
};

export type SemanticProcessingResult = {
  node: ExperienceNode;
  mergeDecision: SemanticMergeDecision;
  reusedNodeIds: string[];
};

export type SemanticProcessorRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
  distiller?: SemanticDistiller;
  mergeDecider?: SemanticMergeDecider;
  embedPassage?: (text: string) => Promise<EmbeddingResult>;
  now?: () => string;
};

const buildRetrievalText = (candidate: ExperienceCandidateDraft): string =>
  (candidate.experience_kind === "expectation_correction"
    ? [
        candidate.deviation_pattern,
        candidate.corrected_constraint,
        candidate.trigger_pattern
      ]
    : [
        candidate.trigger_pattern,
        candidate.compact_hint,
        candidate.goal,
        candidate.evidence_summary
      ])
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
  if (
    existing ||
    distilled.promotion_signal === "high_value" ||
    !shouldInferHighValuePromotion(candidate, distilled)
  ) {
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
  (
    distilled.experience_kind === "expectation_correction" ||
    distilled.node_type === "warning" ||
    Boolean(distilled.goal?.trim())
  );

const mergeIds = (existing: string[] | undefined, next: string[]): string[] =>
  [...new Set([...(existing ?? []), ...next])];

const triggerSimilarity = (left: string, right: string): number => {
  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right));
  if (!lhs.size || !rhs.size) {
    return 0;
  }
  const overlap = [...lhs].filter((token) => rhs.has(token)).length;
  return Math.max(
    overlap / Math.max(lhs.size, rhs.size),
    overlap / lhs.size,
    overlap / rhs.size
  );
};

const listSimilarity = (
  left: string[] | undefined,
  right: string[] | undefined
): number => {
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
  value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";

const semanticFieldMatches = (
  left: string | undefined,
  right: string | undefined
): boolean => {
  const lhs = normalizeSemanticText(left);
  const rhs = normalizeSemanticText(right);
  return Boolean(
    lhs &&
    rhs &&
    (
      lhs === rhs ||
      triggerSimilarity(lhs, rhs) >=
        EXPECTATION_CORRECTION_DIMENSION_SIMILARITY
    )
  );
};

const structuredLessonOverlap = (
  left: ExperienceNode,
  right: ExperienceCandidateDraft
): number =>
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
  return Boolean(
    node.experience_kind === "expectation_correction" &&
    normalizeSemanticText(node.correction_category) &&
    normalizeSemanticText(node.correction_category) ===
      normalizeSemanticText(draft.correction_category) &&
    semanticFieldMatches(node.deviation_pattern, draft.deviation_pattern) &&
    semanticFieldMatches(node.corrected_constraint, draft.corrected_constraint)
  );
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

const distilledDraftToNode = (options: {
  candidate: ExperienceCandidate;
  distilled: ExperienceCandidateDraft;
  existing?: ExperienceNode;
  mergeDecision: SemanticMergeDecision;
  now: string;
}): ExperienceNode => {
  const { candidate, distilled, existing, mergeDecision } = options;
  const id =
    existing?.id ??
    stableId(
      "node",
      [
        candidate.scope_id,
        candidate.task_type,
        candidate.node_type,
        distilled.compact_hint
      ].join(":")
    );
  const baseDraft =
    mergeDecision.action === "NONE" && existing
      ? ({
          ...existing,
          scope_id: existing.scope_id,
          task_type: existing.task_type,
          node_type: existing.node_type,
          source_kind: existing.source_kind
        } satisfies ExperienceCandidateDraft)
      : mergeDecision.action === "UPDATE" && existing
        ? ({
            ...existing,
            ...Object.fromEntries(
              CONTENT_UPDATE_FIELDS.map((field) => [
                field,
                distilled[field] ?? existing[field]
              ])
            ),
            scope_id: existing.scope_id,
            task_type: existing.task_type,
            node_type: existing.node_type,
            source_kind: existing.source_kind
          } satisfies ExperienceCandidateDraft)
        : distilled;
  const effectiveDraft = applyPriorityPromotionInference(
    candidate,
    baseDraft,
    existing
  );
  const retrievalText = buildRetrievalText(effectiveDraft);
  const priorityPromotionApplied =
    !existing && shouldEnterPriorityCandidate(candidate, effectiveDraft);
  return {
    id,
    ...effectiveDraft,
    retrieval_text: retrievalText,
    ...withEmbeddingMetadata(buildLegacyEmbedding(retrievalText)),
    distillation_mode_used:
      mergeDecision.action === "NONE"
        ? existing?.distillation_mode_used ?? distilled.distillation_mode_used
        : distilled.distillation_mode_used ?? existing?.distillation_mode_used,
    distillation_source:
      mergeDecision.action === "NONE"
        ? existing?.distillation_source ?? distilled.distillation_source
        : distilled.distillation_source ?? existing?.distillation_source,
    redistilled_from:
      existing?.distillation_source &&
      distilled.distillation_source &&
      existing.distillation_source !== distilled.distillation_source
        ? existing.distillation_source
        : existing?.redistilled_from,
    merge_decision: mergeDecision.action,
    merge_reason: mergeDecision.reason,
    priority_promotion_applied:
      existing?.priority_promotion_applied ?? priorityPromotionApplied,
    origin_record_ids: mergeIds(existing?.origin_record_ids, [
      candidate.source_record_id
    ]),
    helped_record_ids: existing?.helped_record_ids ?? [],
    harmed_record_ids: existing?.harmed_record_ids ?? [],
    state:
      existing?.state ??
      (priorityPromotionApplied ? "priority_candidate" : "candidate"),
    usage_count: existing?.usage_count ?? 0,
    helped_count: existing?.helped_count ?? 0,
    harmed_count: existing?.harmed_count ?? 0,
    support_count: (existing?.support_count ?? 0) + 1,
    created_at: existing?.created_at ?? options.now,
    last_used_at: existing?.last_used_at,
    last_helped_at: existing?.last_helped_at,
    last_harmed_at: existing?.last_harmed_at,
    updated_at: options.now
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
    .filter((node) =>
      areTaskFamiliesMergeCompatible(node.task_type, candidate.task_type)
    )
    .sort((left, right) => {
      const exactTaskDifference =
        Number(right.task_type === candidate.task_type) -
        Number(left.task_type === candidate.task_type);
      if (exactTaskDifference) {
        return exactTaskDifference;
      }
      const exactTriggerDifference =
        Number(right.trigger_pattern === distilled.trigger_pattern) -
        Number(left.trigger_pattern === distilled.trigger_pattern);
      if (exactTriggerDifference) {
        return exactTriggerDifference;
      }
      const similarityDifference =
        structuredLessonOverlap(right, distilled) -
        structuredLessonOverlap(left, distilled);
      if (similarityDifference) {
        return similarityDifference;
      }
      const activeDifference =
        Number(right.state === "active") - Number(left.state === "active");
      if (activeDifference) {
        return activeDifference;
      }
      return right.support_count !== left.support_count
        ? right.support_count - left.support_count
        : right.updated_at.localeCompare(left.updated_at);
    })
    .filter((node) => {
      if (!hasAlignedExpectationCorrectionDimension(node, distilled)) {
        return false;
      }
      return Boolean(
        triggerSimilarity(node.trigger_pattern, distilled.trigger_pattern) >=
          NEAR_DUPLICATE_TRIGGER_SIMILARITY ||
        triggerSimilarity(node.compact_hint, distilled.compact_hint) >=
          NEAR_DUPLICATE_HINT_SIMILARITY ||
        structuredLessonOverlap(node, distilled) >=
          STRUCTURED_LESSON_OVERLAP_SIMILARITY
      );
    })
    .slice(0, 3);

const buildFallbackMergeDecision = (
  existingNodes: ExperienceNode[],
  distilled: ExperienceCandidateDraft
): SemanticMergeDecision => {
  const best = existingNodes[0];
  if (!best) {
    return {
      action: "ADD",
      reason: "no reusable node matched",
      source: "rule"
    };
  }
  if (
    best.trigger_pattern === distilled.trigger_pattern &&
    best.compact_hint.trim().toLowerCase() ===
      distilled.compact_hint.trim().toLowerCase()
  ) {
    return {
      action: "NONE",
      targetNodeId: best.id,
      reason: "existing node already covers the distilled experience",
      source: "rule"
    };
  }
  const sameFamily =
    resolveExperienceFamily(best.task_type) ===
    resolveExperienceFamily(distilled.task_type);
  return {
    action: "UPDATE",
    targetNodeId: best.id,
    reason:
      sameFamily &&
      structuredLessonOverlap(best, distilled) >=
        STRUCTURED_LESSON_OVERLAP_SIMILARITY
        ? "existing same-family node covers the same lesson and should absorb the new evidence"
        : "existing node is near-duplicate and should absorb the new expression",
    source: "rule"
  };
};

export class SemanticDistillationProcessor {
  private readonly distiller: SemanticDistiller;
  private readonly mergeDecider: SemanticMergeDecider;
  private readonly embedPassage: (text: string) => Promise<EmbeddingResult>;

  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly nodeRepo: NodeRepository,
    private readonly options: SemanticProcessorRuntimeOptions = {}
  ) {
    this.distiller =
      options.distiller ?? new LlmDistiller(config, options);
    this.mergeDecider =
      options.mergeDecider ?? new LlmMergeDecider(config, options);
    this.embedPassage =
      options.embedPassage ??
      ((text) =>
        embedPassageText(text, {
          config,
          env: options.env,
          homeDir: options.homeDir
        }));
  }

  async process(candidate: ExperienceCandidate): Promise<SemanticProcessingResult> {
    const distilled = await this.distiller.distill(candidate);
    const reusableNodes = findReusableNodes(
      this.nodeRepo,
      candidate,
      distilled
    );
    const fallback = buildFallbackMergeDecision(reusableNodes, distilled);
    const mergeDecision = await this.mergeDecider.decide(
      candidate,
      distilled,
      reusableNodes,
      fallback
    );
    const resolvedNodeId =
      mergeDecision.targetNodeId ??
      candidate.distilled_node_id ??
      stableId(
        "node",
        [
          candidate.scope_id,
          candidate.task_type,
          candidate.node_type,
          distilled.compact_hint
        ].join(":")
      );
    const existingNode = this.nodeRepo.getById(resolvedNodeId);
    const node = distilledDraftToNode({
      candidate,
      distilled,
      existing: existingNode,
      mergeDecision,
      now: this.options.now?.() ?? nowIso()
    });
    const semanticEmbedding = await this.embedPassage(
      node.retrieval_text ?? `${node.trigger_pattern}\n${node.compact_hint}`
    );
    const completedNode = {
      ...node,
      ...withEmbeddingMetadata(semanticEmbedding)
    };
    return {
      node: {
        ...completedNode,
        state: transitionState(completedNode)
      },
      mergeDecision,
      reusedNodeIds: reusableNodes.map((entry) => entry.id)
    };
  }
}
