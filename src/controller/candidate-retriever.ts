import type { ExperienceInput, ExperienceNode, TaskType } from "../types/domain.js";
import {
  buildLegacyEmbedding,
  embedQueryText,
  isCompatibleEmbedding,
  isMatchingEmbeddingSpace
} from "../store/vector/embeddings.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { openVectorStore } from "../store/vector/lancedb.js";
import { tokenize } from "../utils/text.js";

const TASK_FAMILY_PROXIMITY: Record<TaskType, Partial<Record<TaskType, number>>> = {
  bug_fix: {
    bug_fix: 1,
    test_debug: 0.92,
    build_debug: 0.82,
    integration_fix: 0.86,
    general: 0.72
  },
  build_debug: {
    build_debug: 1,
    bug_fix: 0.82,
    config_debug: 0.72,
    integration_fix: 0.7,
    general: 0.65
  },
  config_debug: {
    config_debug: 1,
    integration_fix: 0.84,
    bug_fix: 0.8,
    build_debug: 0.72,
    general: 0.72
  },
  test_debug: {
    test_debug: 1,
    bug_fix: 0.92,
    integration_fix: 0.78,
    general: 0.7
  },
  integration_fix: {
    integration_fix: 1,
    config_debug: 0.84,
    bug_fix: 0.86,
    test_debug: 0.78,
    build_debug: 0.7,
    general: 0.68
  },
  feature_add: {
    feature_add: 1,
    refactor: 0.78,
    performance: 0.7,
    general: 0.75
  },
  refactor: {
    refactor: 1,
    feature_add: 0.78,
    performance: 0.65,
    general: 0.72
  },
  performance: {
    performance: 1,
    feature_add: 0.7,
    refactor: 0.65,
    general: 0.7
  },
  general: {
    general: 1,
    bug_fix: 0.72,
    build_debug: 0.65,
    config_debug: 0.72,
    test_debug: 0.7,
    integration_fix: 0.68,
    feature_add: 0.75,
    refactor: 0.72,
    performance: 0.7
  }
};

const isInjectableState = (node: ExperienceNode): boolean =>
  node.state === "active" || node.state === "cooling" || node.state === "candidate";

const LEGACY_GENERIC_HINT_PATTERNS = [
  /^reproduce first, then validate the fix with /i,
  /^do not keep iterating on the current debug path without narrowing the failing signature first\.?$/i
];

const isLegacyGenericNode = (node: ExperienceNode): boolean =>
  LEGACY_GENERIC_HINT_PATTERNS.some((pattern) => pattern.test(node.compact_hint.trim()));

const getSpecificityBonus = (node: ExperienceNode): number => {
  const hintTokens = new Set(tokenize(node.compact_hint));
  const triggerTokens = new Set(tokenize(node.trigger_pattern));
  const lexicalBreadth = Math.min(12, hintTokens.size + Math.min(triggerTokens.size, 6));
  const breadthScore = lexicalBreadth / 12;
  const structuredBonus =
    (node.recommended_steps?.length ?? 0) > 0 || (node.goal?.trim().length ?? 0) > 0 ? 0.08 : 0;

  return breadthScore * 0.18 + structuredBonus;
};

const getFeedbackAdjustment = (node: ExperienceNode): number =>
  Math.max(-0.12, Math.min(0.12, (node.helped_count - node.harmed_count) * 0.02));

const getGenericPenalty = (node: ExperienceNode): number => (isLegacyGenericNode(node) ? 0.22 : 0);

const getFamilyScore = (inputTaskType: TaskType, nodeTaskType: TaskType): number =>
  TASK_FAMILY_PROXIMITY[inputTaskType][nodeTaskType] ?? 0;

const textOverlapScore = (left: string | undefined, right: string): number => {
  if (!left?.trim()) {
    return 0;
  }

  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right));
  if (!lhs.size || !rhs.size) {
    return 0;
  }

  const overlap = [...lhs].filter((token) => rhs.has(token)).length;
  return overlap / Math.max(lhs.size, rhs.size);
};

const isExpectationCorrectionNode = (node: ExperienceNode): boolean => node.experience_kind === "expectation_correction";

const passesCorrectionScopeGate = (input: ExperienceInput, node: ExperienceNode): boolean => {
  if (!isExpectationCorrectionNode(node)) {
    return true;
  }

  if (node.scope_id !== input.scope_id && node.correction_scope === "repo_local") {
    return false;
  }

  if (node.scope_id !== input.scope_id && node.correction_scope === "task_local") {
    return false;
  }

  if (node.scope_id !== input.scope_id && node.correction_scope === "workflow_local") {
    return false;
  }

  if (node.scope_id !== input.scope_id && node.correction_category === "style_constraint") {
    return false;
  }

  return true;
};

const getExpectationCorrectionAdjustment = (input: ExperienceInput, node: ExperienceNode): number => {
  if (!isExpectationCorrectionNode(node)) {
    return 0;
  }

  const queryText = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  const categoryMatch = textOverlapScore(node.correction_category, queryText);
  const deviationMatch = textOverlapScore(node.deviation_pattern, queryText);
  const constraintMatch = textOverlapScore(node.corrected_constraint, queryText);
  const confidenceBonus =
    node.confidence_signal === "confirmed_by_user"
      ? 0.06
      : node.confidence_signal === "supported_by_objective_success"
        ? 0.03
        : 0;
  const validationBonus = node.validation_state === "validated_by_reuse" ? 0.05 : 0;

  return categoryMatch * 0.18 + deviationMatch * 0.1 + constraintMatch * 0.08 + confidenceBonus + validationBonus;
};

type RetrieveOptions = {
  config?: Pick<ExperienceEngineConfig, "embeddingProvider" | "embeddingModel" | "embeddingDtype" | "embeddingCacheDir">;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export const retrieveCandidates = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  options: RetrieveOptions = {}
): Promise<ExperienceNode[]> => {
  if (input.task_type === "unknown") {
    return [];
  }

  const inputTaskType = input.task_type;
  const queryText = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  const localQuery = await embedQueryText(queryText || input.task_summary, options);
  const legacyQuery = buildLegacyEmbedding(queryText || input.task_summary);
  const vectorStore = openVectorStore();
  const scopeLocalNodes = nodes.filter((node) => isInjectableState(node) && passesCorrectionScopeGate(input, node));
  const localSemanticRecords = scopeLocalNodes
    .filter((node) => isMatchingEmbeddingSpace(node, localQuery.space))
    .map((node) => ({
      id: node.id,
      embedding: node.embedding!
    }));
  const legacyRecords = scopeLocalNodes
    .filter((node) => !isMatchingEmbeddingSpace(node, localQuery.space))
    .map((node) => ({
      id: node.id,
      embedding: isCompatibleEmbedding(node.embedding)
        ? node.embedding
        : buildLegacyEmbedding(node.retrieval_text ?? `${node.trigger_pattern} ${node.compact_hint}`).embedding
    }));

  const scoreById = new Map<string, number>();
  for (const match of vectorStore.query(localSemanticRecords, localQuery.embedding, 16)) {
    scoreById.set(match.id, match.score);
  }
  for (const match of vectorStore.query(legacyRecords, legacyQuery.embedding, 16)) {
    scoreById.set(match.id, Math.max(scoreById.get(match.id) ?? 0, match.score * 0.78));
  }

  const minimumFamilyScore = inputTaskType === "general" ? 0.75 : 0.65;

  return scopeLocalNodes
    .map((node) => {
      const semanticScore = scoreById.get(node.id) ?? 0;
      const familyScore = getFamilyScore(inputTaskType, node.task_type);
      const qualityAdjustment =
        getSpecificityBonus(node) + getFeedbackAdjustment(node) - getGenericPenalty(node);
      const totalScore =
        semanticScore * 0.68 + familyScore * 0.22 + qualityAdjustment + getExpectationCorrectionAdjustment(input, node);
      return { node, semanticScore, familyScore, totalScore };
    })
    .filter(({ semanticScore, familyScore }) => semanticScore >= 0.12 && familyScore >= minimumFamilyScore)
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, 8)
    .map(({ node }) => node);
};
