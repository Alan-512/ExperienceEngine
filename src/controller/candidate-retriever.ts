import type { ExperienceInput, ExperienceNode, TaskType } from "../types/domain.js";
import { embedText } from "../store/vector/embeddings.js";
import { openVectorStore } from "../store/vector/lancedb.js";

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
    integration_fix: 0.7,
    general: 0.65
  },
  test_debug: {
    test_debug: 1,
    bug_fix: 0.92,
    integration_fix: 0.78,
    general: 0.7
  },
  integration_fix: {
    integration_fix: 1,
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
    test_debug: 0.7,
    integration_fix: 0.68,
    feature_add: 0.75,
    refactor: 0.72,
    performance: 0.7
  }
};

const isInjectableState = (node: ExperienceNode): boolean =>
  node.state === "active" || node.state === "cooling" || node.state === "candidate";

const getFamilyScore = (inputTaskType: TaskType, nodeTaskType: TaskType): number =>
  TASK_FAMILY_PROXIMITY[inputTaskType][nodeTaskType] ?? 0;

export const retrieveCandidates = (input: ExperienceInput, nodes: ExperienceNode[]): ExperienceNode[] => {
  if (input.task_type === "unknown") {
    return [];
  }

  const inputTaskType = input.task_type;
  const queryText = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  const queryEmbedding = embedText(queryText || input.task_summary);
  const vectorStore = openVectorStore();
  const scopeLocalNodes = nodes.filter(isInjectableState);
  const semanticMatches = vectorStore.query(
    scopeLocalNodes.map((node) => ({
      id: node.id,
      embedding: node.embedding ?? embedText(node.retrieval_text ?? `${node.trigger_pattern} ${node.compact_hint}`)
    })),
    queryEmbedding,
    16
  );

  const scoreById = new Map(semanticMatches.map((match) => [match.id, match.score]));

  return scopeLocalNodes
    .map((node) => {
      const semanticScore = scoreById.get(node.id) ?? 0;
      const familyScore = getFamilyScore(inputTaskType, node.task_type);
      const qualityScore = node.helped_count - node.harmed_count + node.support_count * 0.25;
      const totalScore = semanticScore * 0.7 + familyScore * 0.25 + qualityScore * 0.01;
      return { node, semanticScore, familyScore, totalScore };
    })
    .filter(
      ({ semanticScore, familyScore }) => semanticScore >= 0.12 && familyScore >= 0.65
    )
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, 8)
    .map(({ node }) => node);
};
