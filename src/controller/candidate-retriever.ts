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
import { buildRetrievalQuery } from "./query-rewrite.js";

export type RetrievedCandidate = {
  node: ExperienceNode;
  semanticScore: number;
  lexicalScore: number;
  fusedScore: number;
  rerankScore?: number;
  familyScore: number;
  totalScore: number;
  scopeMatch: boolean;
  taskFamilyMatch: boolean;
  scoreMargin: number;
};

export type RerankCandidate = Omit<RetrievedCandidate, "scoreMargin" | "rerankScore">;
export type RerankResult = {
  id: string;
  score: number;
};

const DEFAULT_RERANK_WINDOW = 5;

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

const getMaturityAdjustment = (node: ExperienceNode): number => {
  const supportBonus = Math.min(0.12, node.support_count * 0.015);
  const validationBonus = node.validation_state === "validated_by_reuse" ? 0.08 : 0;
  return supportBonus + validationBonus;
};

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

const LOW_SIGNAL_QUERY_TOKENS = new Set([
  "ok",
  "okay",
  "yes",
  "yep",
  "thanks",
  "thx",
  "done",
  "continue",
  "go",
  "run",
  "retry"
]);

const shouldSkipSemanticRetrieval = (input: ExperienceInput, queryText: string): boolean => {
  if (input.context_summary?.trim()) {
    return false;
  }

  const tokens = tokenize(queryText);
  if (tokens.length === 0) {
    return true;
  }

  if (tokens.length === 1 && LOW_SIGNAL_QUERY_TOKENS.has(tokens[0] ?? "")) {
    return true;
  }

  if (tokens.length <= 2 && tokens.every((token) => LOW_SIGNAL_QUERY_TOKENS.has(token))) {
    return true;
  }

  return false;
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
  reranker?: (input: { queryText: string; taskType: TaskType; candidates: RerankCandidate[] }) => Promise<RerankResult[]>;
};

type LexicalDocument = {
  node: ExperienceNode;
  length: number;
  frequencies: Map<string, number>;
};

const buildLexicalDocument = (node: ExperienceNode): LexicalDocument => {
  const text = node.retrieval_text ?? `${node.trigger_pattern}\n${node.compact_hint}`;
  const tokens = tokenize(text);
  const frequencies = new Map<string, number>();

  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  return {
    node,
    length: tokens.length,
    frequencies
  };
};

const computeBm25Scores = (queryText: string, nodes: ExperienceNode[]): Map<string, number> => {
  const queryTokens = [...new Set(tokenize(queryText))];
  if (!queryTokens.length || !nodes.length) {
    return new Map();
  }

  const documents = nodes.map(buildLexicalDocument);
  const averageLength =
    documents.reduce((sum, document) => sum + Math.max(1, document.length), 0) / Math.max(1, documents.length);
  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) {
    let count = 0;
    for (const document of documents) {
      if (document.frequencies.has(token)) {
        count += 1;
      }
    }
    documentFrequency.set(token, count);
  }

  const k1 = 1.4;
  const b = 0.75;
  const rawScores = new Map<string, number>();
  let maxScore = 0;

  for (const document of documents) {
    let score = 0;

    for (const token of queryTokens) {
      const termFrequency = document.frequencies.get(token) ?? 0;
      if (!termFrequency) {
        continue;
      }

      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = termFrequency + k1 * (1 - b + b * (document.length / averageLength));
      score += idf * ((termFrequency * (k1 + 1)) / denominator);
    }

    rawScores.set(document.node.id, score);
    maxScore = Math.max(maxScore, score);
  }

  if (maxScore <= 0) {
    return new Map();
  }

  return new Map(
    [...rawScores.entries()].map(([id, score]) => [id, Number((score / maxScore).toFixed(6))])
  );
};

const buildRankMap = (entries: Array<{ id: string; score: number }>): Map<string, number> =>
  new Map(
    [...entries]
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry, index) => [entry.id, index + 1])
  );

const buildFusedScores = (
  semanticScores: Map<string, number>,
  lexicalScores: Map<string, number>,
  ids: string[]
): Map<string, number> => {
  const semanticRanks = buildRankMap([...semanticScores.entries()].map(([id, score]) => ({ id, score })));
  const lexicalRanks = buildRankMap([...lexicalScores.entries()].map(([id, score]) => ({ id, score })));
  const rawFused = new Map<string, number>();
  let maxFused = 0;
  const rankConstant = 20;

  for (const id of ids) {
    const semanticRank = semanticRanks.get(id);
    const lexicalRank = lexicalRanks.get(id);
    const fused =
      (semanticRank ? 1 / (rankConstant + semanticRank) : 0) +
      (lexicalRank ? 1 / (rankConstant + lexicalRank) : 0);
    rawFused.set(id, fused);
    maxFused = Math.max(maxFused, fused);
  }

  if (maxFused <= 0) {
    return new Map();
  }

  return new Map(
    [...rawFused.entries()].map(([id, score]) => {
      const rankFusionScore = score / maxFused;
      const semanticScore = semanticScores.get(id) ?? 0;
      const lexicalScore = lexicalScores.get(id) ?? 0;
      const multiChannelBonus = semanticScore > 0 && lexicalScore > 0 ? 0.05 : 0;
      const fused = Math.min(
        1,
        rankFusionScore * 0.55 + semanticScore * 0.2 + lexicalScore * 0.2 + multiChannelBonus
      );

      return [id, Number(fused.toFixed(6))];
    })
  );
};

const computeDefaultRerankScores = (
  queryText: string,
  candidates: RerankCandidate[]
): Map<string, number> => {
  if (!queryText.trim() || !candidates.length) {
    return new Map();
  }

  const rawScores = new Map<string, number>();
  let maxScore = 0;

  for (const candidate of candidates.slice(0, DEFAULT_RERANK_WINDOW)) {
    const triggerScore = textOverlapScore(candidate.node.trigger_pattern, queryText);
    const hintScore = textOverlapScore(candidate.node.compact_hint, queryText);
    const goalScore = textOverlapScore(candidate.node.goal, queryText);
    const stepScore = textOverlapScore(candidate.node.recommended_steps?.join("\n"), queryText);
    const successSignalScore = textOverlapScore(candidate.node.success_signal, queryText);
    const familyBonus = candidate.taskFamilyMatch ? 0.08 : 0;
    const structuredBonus = (candidate.node.recommended_steps?.length ?? 0) > 0 || candidate.node.goal ? 0.04 : 0;
    const maturityBonus = Math.min(
      0.24,
      candidate.node.helped_count * 0.015 +
        candidate.node.support_count * 0.01 +
        (candidate.node.validation_state === "validated_by_reuse" ? 0.06 : 0)
    );
    const harmPenalty = Math.min(0.08, candidate.node.harmed_count * 0.02);

    const score =
      triggerScore * 0.45 +
      stepScore * 0.2 +
      goalScore * 0.14 +
      hintScore * 0.11 +
      successSignalScore * 0.06 +
      familyBonus +
      structuredBonus +
      maturityBonus -
      harmPenalty;

    rawScores.set(candidate.node.id, score);
    maxScore = Math.max(maxScore, score);
  }

  if (maxScore <= 0) {
    return new Map();
  }

  return new Map(
    [...rawScores.entries()].map(([id, score]) => [id, Number((score / maxScore).toFixed(6))])
  );
};

export const retrieveCandidates = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  options: RetrieveOptions = {}
): Promise<ExperienceNode[]> => {
  const scored = await retrieveScoredCandidates(input, nodes, options);
  return scored.map(({ node }) => node);
};

export const retrieveScoredCandidates = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  options: RetrieveOptions = {}
): Promise<RetrievedCandidate[]> => {
  if (input.task_type === "unknown") {
    return [];
  }

  const inputTaskType = input.task_type;
  const retrievalQuery = buildRetrievalQuery(input.task_summary, input.context_summary);
  const queryText = retrievalQuery.retrievalQueryText;
  const shouldUseSemanticRetrieval = !shouldSkipSemanticRetrieval(input, queryText || input.task_summary);
  const localQuery = shouldUseSemanticRetrieval
    ? await embedQueryText(queryText || input.task_summary, options)
    : null;
  const legacyQuery = buildLegacyEmbedding(queryText || input.task_summary);
  const vectorStore = openVectorStore();
  const scopeLocalNodes = nodes.filter((node) => isInjectableState(node) && passesCorrectionScopeGate(input, node));
  const localSemanticRecords = scopeLocalNodes
    .filter((node) => localQuery && isMatchingEmbeddingSpace(node, localQuery.space))
    .map((node) => ({
      id: node.id,
      embedding: node.embedding!
    }));
  const legacyRecords = scopeLocalNodes
    .filter((node) => !localQuery || !isMatchingEmbeddingSpace(node, localQuery.space))
    .map((node) => ({
      id: node.id,
      embedding: isCompatibleEmbedding(node.embedding)
        ? node.embedding
        : buildLegacyEmbedding(node.retrieval_text ?? `${node.trigger_pattern} ${node.compact_hint}`).embedding
    }));

  const scoreById = new Map<string, number>();
  if (localQuery) {
    for (const match of vectorStore.query(localSemanticRecords, localQuery.embedding, 16)) {
      scoreById.set(match.id, match.score);
    }
  }
  for (const match of vectorStore.query(legacyRecords, legacyQuery.embedding, 16)) {
    scoreById.set(match.id, Math.max(scoreById.get(match.id) ?? 0, localQuery ? match.score * 0.78 : match.score));
  }
  const lexicalScoreById = computeBm25Scores(queryText || input.task_summary, scopeLocalNodes);
  const fusedScoreById = buildFusedScores(
    scoreById,
    lexicalScoreById,
    scopeLocalNodes.map((node) => node.id)
  );

  const minimumFamilyScore = inputTaskType === "general" ? 0.75 : 0.65;

  const ranked = scopeLocalNodes
    .map((node) => {
      const semanticScore = scoreById.get(node.id) ?? 0;
      const lexicalScore = lexicalScoreById.get(node.id) ?? 0;
      const fusedScore = fusedScoreById.get(node.id) ?? Math.max(semanticScore, lexicalScore);
      const familyScore = getFamilyScore(inputTaskType, node.task_type);
      const qualityAdjustment =
        getSpecificityBonus(node) + getFeedbackAdjustment(node) + getMaturityAdjustment(node) - getGenericPenalty(node);
      const totalScore =
        fusedScore * 0.68 + familyScore * 0.22 + qualityAdjustment + getExpectationCorrectionAdjustment(input, node);
      return {
        node,
        semanticScore,
        lexicalScore,
        fusedScore,
        familyScore,
        totalScore,
        scopeMatch: node.scope_id === input.scope_id,
        taskFamilyMatch: node.task_type === input.task_type
      };
    })
    .filter(
      ({ semanticScore, lexicalScore, fusedScore, familyScore }) =>
        Math.max(semanticScore, lexicalScore, fusedScore) >= 0.12 && familyScore >= minimumFamilyScore
    )
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, 8);

  const rerankCandidates = [...ranked].sort((left, right) => right.totalScore - left.totalScore);
  const rerankScoreById = new Map<string, number>();
  if (rerankCandidates.length) {
    const rerankInput = {
      queryText: queryText || input.task_summary,
      taskType: inputTaskType,
      candidates: rerankCandidates.map(
        ({ node, semanticScore, lexicalScore, fusedScore, familyScore, totalScore, scopeMatch, taskFamilyMatch }) => ({
          node,
          semanticScore,
          lexicalScore,
          fusedScore,
          familyScore,
          totalScore,
          scopeMatch,
          taskFamilyMatch
        })
      )
    };
    const defaultRerankScores = computeDefaultRerankScores(rerankInput.queryText, rerankInput.candidates);
    const rerankResults = options.reranker
      ? await options.reranker(rerankInput)
      : rerankInput.candidates
          .slice(0, DEFAULT_RERANK_WINDOW)
          .map((candidate) => ({
            id: candidate.node.id,
            score: defaultRerankScores.get(candidate.node.id) ?? 0
          }));

    const maxScore = Math.max(
      0,
      ...rerankResults.map((result) => (Number.isFinite(result.score) ? result.score : 0))
    );
    for (const result of rerankResults) {
      const normalized = maxScore > 0 ? Math.max(0, result.score) / maxScore : 0;
      rerankScoreById.set(result.id, Number(normalized.toFixed(6)));
    }
  }

  const reranked = rerankCandidates
    .map((entry) => {
      const rerankScore = rerankScoreById.get(entry.node.id);
      const rerankBoost = typeof rerankScore === "number" ? rerankScore * 0.12 : 0;
      return {
        ...entry,
        rerankScore,
        totalScore: entry.totalScore + rerankBoost
      };
    })
    .sort((left, right) => right.totalScore - left.totalScore);

  return reranked.map((entry, index) => ({
    ...entry,
    scoreMargin: Math.max(0, entry.totalScore - (reranked[index + 1]?.totalScore ?? 0))
  }));
};
