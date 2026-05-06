import type {
  ExperienceInput,
  ExperienceNode,
  MatchBand,
  MatchScorecard,
  PolicyEnrichmentComponent,
  RetrievalContext,
  RetrievalPolicyDiagnostics,
  RetrievalPolicyStageDiagnostic,
  TaskType
} from "../types/domain.js";
import {
  buildLegacyEmbedding,
  embedQueryText,
  isCompatibleEmbedding,
  isMatchingEmbeddingSpace
} from "../store/vector/embeddings.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { openVectorStore } from "../store/vector/lancedb.js";
import { tokenize } from "../utils/text.js";
import { buildRetrievalQuery, type RetrievalQuery } from "./query-rewrite.js";
import { computeLexicalRetrievalScores } from "./lexical-retriever.js";
import { rerankCandidatesWithModel } from "./model-reranker.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import { enrichPolicyForCandidate, textOverlapScore } from "./policy-enricher.js";

export type RetrievedCandidate = {
  node: ExperienceNode;
  semanticScore: number;
  lexicalScore: number;
  fusedScore: number;
  retrievalScore: number;
  retrievalReasons: string[];
  policyAdjustment: number;
  policyScore: number;
  policyReasons: string[];
  policyComponents?: PolicyEnrichmentComponent[];
  rerankScore?: number;
  rerankSource?: "heuristic" | "model";
  familyScore: number;
  matchScorecard?: MatchScorecard;
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

export type RetrievedCandidateBundle = {
  candidates: RetrievedCandidate[];
  retrievalQuery: RetrievalQuery;
  queryText: string;
  semanticSkipped: boolean;
  retrievalPolicyDiagnostics: RetrievalPolicyDiagnostics;
};

const DEFAULT_RERANK_WINDOW = 5;
const LEXICAL_SHORTLIST_LIMIT = 8;
const SEMANTIC_BACKFILL_LIMIT = 8;
const MIN_LEXICAL_SHORTLIST_SCORE = 0.12;
const STRONG_LEXICAL_SHORTLIST_SCORE = 0.35;
const STRONG_GENERAL_ADJACENT_FAMILY_THRESHOLD = 0.7;
const STRONG_GENERAL_ADJACENT_SIGNAL_THRESHOLD = 0.45;
const GENERAL_DEBUG_LIKE_QUERY_PATTERN =
  /\b(fail|failed|failing|failure|regression|bug|broken|debug|diagnose|investigate|audit|inspect|fixture|handshake|routing|config|timeout|migration|schema)\b/i;

const DEFAULT_DELIVERY_STATE_BY_LIFECYCLE: Record<ExperienceNode["state"], NonNullable<ExperienceNode["delivery_state"]>> = {
  candidate: "shadow_only",
  priority_candidate: "conservative_only",
  active: "eligible",
  cooling: "conservative_only",
  retired: "quarantined"
};

const resolveDeliveryState = (
  node: Pick<ExperienceNode, "state" | "delivery_state">
): NonNullable<ExperienceNode["delivery_state"]> => node.delivery_state ?? DEFAULT_DELIVERY_STATE_BY_LIFECYCLE[node.state];

const isInjectableState = (node: ExperienceNode): boolean =>
  resolveDeliveryState(node) === "eligible" || resolveDeliveryState(node) === "conservative_only";

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

const passesCorrectionScopeGate = (input: ExperienceInput, node: ExperienceNode): boolean => {
  if (node.experience_kind !== "expectation_correction") {
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

const retrievalStage = (
  stage: RetrievalPolicyStageDiagnostic["stage"],
  input: Omit<RetrievalPolicyStageDiagnostic, "stage">
): RetrievalPolicyStageDiagnostic => ({
  stage,
  ...input
});

const hardFilterNodes = (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  options: Pick<RetrieveOptions, "includeShadowDiagnosticCandidates">
): { nodes: ExperienceNode[]; diagnostic: RetrievalPolicyStageDiagnostic } => {
  const filtered = nodes.filter((node) =>
    (
      isInjectableState(node) ||
      (
        options.includeShadowDiagnosticCandidates === true &&
        node.scope_id === input.scope_id &&
        node.state === "candidate" &&
        resolveDeliveryState(node) === "shadow_only"
      )
    ) &&
    passesCorrectionScopeGate(input, node)
  );

  return {
    nodes: filtered,
    diagnostic: retrievalStage("hard_filter", {
      acceptedCount: filtered.length,
      rejectedCount: nodes.length - filtered.length,
      reasonCodes: [
        "delivery_state_gate",
        "same_scope_shadow_diagnostic_gate",
        "correction_scope_gate"
      ]
    })
  };
};

const buildShortlistDiagnostic = (
  shortlistCount: number,
  filteredCount: number,
  backfillEligible: boolean
): RetrievalPolicyStageDiagnostic => retrievalStage("shortlist", {
  acceptedCount: shortlistCount,
  rejectedCount: filteredCount - shortlistCount,
  reasonCodes: [
    "lexical_first_shortlist",
    "minimum_lexical_signal",
    "bounded_shortlist",
    backfillEligible ? "semantic_backfill_eligible" : "semantic_rerank_only"
  ]
});

const buildSemanticDiagnostic = (
  mode: "skipped" | "rerank" | "backfill",
  semanticCandidateCount: number,
  semanticSkipped: boolean
): RetrievalPolicyStageDiagnostic => retrievalStage("semantic_rerank_backfill", {
  passedCount: semanticCandidateCount,
  reasonCodes: [
    `semantic_mode:${mode}`,
    semanticSkipped ? "semantic_skipped_low_signal_input" : "semantic_expression_variant_support",
    mode === "backfill" ? "bounded_semantic_backfill" : "semantic_not_primary_authority"
  ]
});

const buildPolicyEnrichmentDiagnostic = (
  candidateCount: number
): RetrievalPolicyStageDiagnostic => retrievalStage("policy_enrichment", {
  passedCount: candidateCount,
  reasonCodes: [
    "policy_adjustment_applied",
    "match_scorecard_built",
    "similarity_remains_non_authoritative"
  ]
});
type RetrieveOptions = {
  config?: Pick<
    ExperienceEngineConfig,
    | "embeddingProvider"
    | "embeddingModel"
    | "embeddingDtype"
    | "embeddingCacheDir"
    | "distillerProvider"
    | "distillationAuthMode"
    | "distillerModel"
    | "retrievalRerankerMode"
    | "retrievalRerankerModel"
  >;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  reranker?: (input: { queryText: string; taskType: TaskType; candidates: RerankCandidate[] }) => Promise<RerankResult[]>;
  retrievalContext?: RetrievalContext;
  fetchImpl?: typeof fetch;
  includeShadowDiagnosticCandidates?: boolean;
  resolveRerankerEndpoint?: (options?: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    configProvider?: ExperienceEngineConfig["distillerProvider"];
    configAuthMode?: string;
    configModel?: string;
  }) => DistillerEndpoint | null;
};

const resolveRetrievalSource = (
  input: ExperienceInput,
  retrievalContext?: RetrievalContext
): Pick<RetrievalContext, "taskSummary" | "contextSummary"> => ({
  taskSummary: retrievalContext?.taskSummary ?? input.task_summary,
  contextSummary: retrievalContext?.contextSummary ?? input.context_summary
});

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

const buildRetrievalReasons = (input: {
  semanticScore: number;
  lexicalScore: number;
  fusedScore: number;
  taskFamilyMatch: boolean;
  familyScore: number;
  queryRewriteApplied: boolean;
}): string[] => {
  const reasons: string[] = [];

  if (input.semanticScore > 0) {
    reasons.push(`semantic:${input.semanticScore.toFixed(4)}`);
  }
  if (input.lexicalScore > 0) {
    reasons.push(`lexical:${input.lexicalScore.toFixed(4)}`);
  }
  if (input.semanticScore > 0 && input.lexicalScore > 0) {
    reasons.push(`hybrid_fusion:${input.fusedScore.toFixed(4)}`);
  } else {
    reasons.push(`retrieval_score:${input.fusedScore.toFixed(4)}`);
  }
  reasons.push(input.taskFamilyMatch ? "family:exact" : `family:adjacent:${input.familyScore.toFixed(4)}`);
  if (input.queryRewriteApplied) {
    reasons.push("query_rewrite:applied");
  }

  return reasons;
};

const KNOWN_TECH_STACK_TERMS = [
  "wxml",
  "wechat",
  "miniprogram",
  "cocos",
  "openrouter",
  "sqlite",
  "vitest",
  "playwright",
  "typescript"
];

const normalizeSignalText = (value?: string): string => value?.toLowerCase().trim() ?? "";

const buildNodeSignalText = (node: ExperienceNode): string =>
  [
    node.trigger_pattern,
    node.compact_hint,
    node.evidence_summary,
    node.retrieval_text,
    node.goal,
    node.success_signal,
    node.recommended_steps?.join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasPhrase = (haystack: string, phrase?: string): boolean => {
  const normalizedPhrase = normalizeSignalText(phrase);
  return Boolean(normalizedPhrase) && haystack.includes(normalizedPhrase);
};

const extractArtifactFamilies = (text: string): Set<string> => {
  const families = new Set<string>();
  const extensionPattern = /\.([a-z0-9]+)\b/g;
  for (const match of text.matchAll(extensionPattern)) {
    families.add(match[1] ?? "");
  }
  for (const term of KNOWN_TECH_STACK_TERMS) {
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)) {
      families.add(term);
    }
  }
  return new Set([...families].filter(Boolean));
};

const hasIntersection = (left: Set<string>, right: Set<string>): boolean =>
  [...left].some((value) => right.has(value));

const bandFromScore = (score: number): MatchBand => {
  if (score >= 0.75) {
    return "high";
  }
  if (score >= 0.4) {
    return "medium";
  }
  return "low";
};

const buildMatchScorecard = (
  input: ExperienceInput,
  node: ExperienceNode,
  retrievalContext?: RetrievalContext
): MatchScorecard => {
  const nodeText = buildNodeSignalText(node);
  const taskText = normalizeSignalText(
    `${retrievalContext?.taskSummary ?? input.task_summary} ${retrievalContext?.contextSummary ?? input.context_summary ?? ""}`
  );
  const negativeEvidence: string[] = [];

  const scopeMatch = node.scope_id === input.scope_id ? "same" : "cross";
  const taskTypeMatch: MatchBand =
    node.task_type === input.task_type || node.task_type === retrievalContext?.taskType
      ? "high"
      : node.task_type === "general" || input.task_type === "general"
        ? "medium"
        : "low";

  const currentFailure = normalizeSignalText(retrievalContext?.failureSignature);
  const failureSignatureMatch: MatchBand = currentFailure
    ? hasPhrase(nodeText, currentFailure)
      ? "high"
      : "low"
    : "medium";
  if (currentFailure && failureSignatureMatch === "low") {
    negativeEvidence.push("failure_signature_mismatch");
  }

  const currentArtifacts = extractArtifactFamilies(
    `${retrievalContext?.modulePaths?.join(" ") ?? ""} ${taskText}`
  );
  const nodeArtifacts = extractArtifactFamilies(nodeText);
  const artifactMatch: MatchBand =
    currentArtifacts.size === 0
      ? "medium"
      : hasIntersection(currentArtifacts, nodeArtifacts)
        ? "high"
        : "low";
  if (currentArtifacts.size > 0 && nodeArtifacts.size > 0 && artifactMatch === "low") {
    negativeEvidence.push("artifact_mismatch");
  }

  const techStackMatch: MatchBand = artifactMatch === "high" ? "high" : artifactMatch === "medium" ? "medium" : "low";
  const intentMatch = bandFromScore(textOverlapScore(taskText, nodeText));

  let overallScore = 0;
  overallScore += scopeMatch === "same" ? 0.28 : 0.08;
  overallScore += taskTypeMatch === "high" ? 0.2 : taskTypeMatch === "medium" ? 0.1 : 0;
  overallScore += failureSignatureMatch === "high" ? 0.22 : failureSignatureMatch === "medium" ? 0.08 : 0;
  overallScore += artifactMatch === "high" ? 0.18 : artifactMatch === "medium" ? 0.08 : 0;
  overallScore += intentMatch === "high" ? 0.12 : intentMatch === "medium" ? 0.06 : 0;
  if (negativeEvidence.length) {
    overallScore = Math.min(overallScore, 0.68);
  }

  const overallMatchBand = bandFromScore(overallScore);

  return {
    scopeMatch,
    taskTypeMatch,
    techStackMatch,
    failureSignatureMatch,
    artifactMatch,
    intentMatch,
    negativeEvidence,
    overallMatchBand,
    directInjectEligible: scopeMatch === "same" && overallMatchBand === "high" && negativeEvidence.length === 0
  };
};

export const retrieveCandidates = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  options: RetrieveOptions = {}
): Promise<ExperienceNode[]> => {
  const bundle = await retrieveCandidateBundle(input, nodes, options);
  return bundle.candidates.map(({ node }) => node);
};

export const retrieveCandidateBundle = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  options: RetrieveOptions = {}
): Promise<RetrievedCandidateBundle> => {
  const retrievalSource = resolveRetrievalSource(input, options.retrievalContext);
  const retrievalQuery = buildRetrievalQuery(retrievalSource.taskSummary, retrievalSource.contextSummary);
  const queryText = retrievalQuery.retrievalQueryText;

  if (input.task_type === "unknown") {
    return {
      candidates: [],
      retrievalQuery,
      queryText,
      semanticSkipped: true,
      retrievalPolicyDiagnostics: {
        stages: [
          retrievalStage("retrieval_context", {
            passedCount: 1,
            reasonCodes: ["experience_input_compatible", "unknown_task_type_short_circuit"]
          }),
          retrievalStage("hard_filter", {
            acceptedCount: 0,
            rejectedCount: nodes.length,
            reasonCodes: ["unknown_task_type"]
          }),
          buildShortlistDiagnostic(0, 0, true),
          buildSemanticDiagnostic("skipped", 0, true),
          buildPolicyEnrichmentDiagnostic(0)
        ]
      }
    };
  }

  const inputTaskType = input.task_type;
  const semanticSkipped = shouldSkipSemanticRetrieval(
    {
      ...input,
      context_summary: retrievalSource.contextSummary
    },
    queryText || retrievalSource.taskSummary
  );
  const shouldUseSemanticRetrieval = !semanticSkipped;
  const localQuery = shouldUseSemanticRetrieval
    ? await embedQueryText(queryText || retrievalSource.taskSummary, options)
    : null;
  const legacyQuery = buildLegacyEmbedding(queryText || retrievalSource.taskSummary);
  const vectorStore = openVectorStore();
  const hardFilterResult = hardFilterNodes(input, nodes, options);
  const scopeLocalNodes = hardFilterResult.nodes;

  const lexicalScoreDetailsById = computeLexicalRetrievalScores(queryText || input.task_summary, scopeLocalNodes);
  const lexicalScoreById = new Map(
    [...lexicalScoreDetailsById.entries()].map(([id, score]) => [id, score.score])
  );
  const lexicalShortlist = [...scopeLocalNodes]
    .filter((node) => (lexicalScoreById.get(node.id) ?? 0) >= MIN_LEXICAL_SHORTLIST_SCORE)
    .sort((left, right) => (lexicalScoreById.get(right.id) ?? 0) - (lexicalScoreById.get(left.id) ?? 0))
    .slice(0, LEXICAL_SHORTLIST_LIMIT);
  const strongestLexicalScore = Math.max(0, ...lexicalShortlist.map((node) => lexicalScoreById.get(node.id) ?? 0));
  const semanticMode: "skipped" | "rerank" | "backfill" = semanticSkipped
    ? "skipped"
    : lexicalShortlist.length === 0 || strongestLexicalScore < STRONG_LEXICAL_SHORTLIST_SCORE
      ? "backfill"
      : "rerank";
  const semanticPool = semanticMode === "backfill" ? scopeLocalNodes : lexicalShortlist;

  const localSemanticRecords = semanticPool
    .filter((node) => localQuery && isMatchingEmbeddingSpace(node, localQuery.space))
    .map((node) => ({
      id: node.id,
      embedding: node.embedding!
    }));
  const legacyRecords = semanticPool
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
  const semanticBackfillIds = new Set<string>();
  if (semanticMode === "backfill") {
    const lexicalShortlistIds = new Set(lexicalShortlist.map((node) => node.id));
    for (const [id, score] of [...scoreById.entries()]
      .filter(([, score]) => score >= 0.12)
      .sort((left, right) => right[1] - left[1])
      .slice(0, SEMANTIC_BACKFILL_LIMIT)) {
      if (!lexicalShortlistIds.has(id)) {
        semanticBackfillIds.add(id);
      }
    }
  }
  const candidatePool = scopeLocalNodes.filter((node) =>
    lexicalShortlist.some((entry) => entry.id === node.id) || semanticBackfillIds.has(node.id)
  );
  const fusedScoreById = buildFusedScores(
    scoreById,
    lexicalScoreById,
    candidatePool.map((node) => node.id)
  );

  const ranked = candidatePool
    .map((node) => {
      const semanticScore = scoreById.get(node.id) ?? 0;
      const lexicalScore = lexicalScoreById.get(node.id) ?? 0;
      const fusedScore = fusedScoreById.get(node.id) ?? Math.max(semanticScore, lexicalScore);
      const retrievalScore = fusedScore * 0.68;
      const policy = enrichPolicyForCandidate(input, node, options.retrievalContext);
      const matchScorecard = buildMatchScorecard(input, node, options.retrievalContext);
      const retrievalReasons = buildRetrievalReasons({
        semanticScore,
        lexicalScore,
        fusedScore,
        taskFamilyMatch: node.task_type === input.task_type,
        familyScore: policy.familyScore,
        queryRewriteApplied: retrievalQuery.rewriteApplied
      });
      const totalScore = retrievalScore + policy.policyAdjustment;
      return {
        node,
        semanticScore,
        lexicalScore,
        fusedScore,
        retrievalScore,
        retrievalReasons,
        policyAdjustment: policy.policyAdjustment,
        policyScore: policy.policyScore,
        policyReasons: policy.reasons,
        policyComponents: policy.components,
        familyScore: policy.familyScore,
        matchScorecard,
        totalScore,
        scopeMatch: node.scope_id === input.scope_id,
        taskFamilyMatch: node.task_type === input.task_type
      };
    })
    .filter(({ node, semanticScore, lexicalScore, fusedScore, familyScore }) => {
      const strongestSignal = Math.max(semanticScore, lexicalScore, fusedScore);
      if (strongestSignal < 0.12) {
        return false;
      }

      if (inputTaskType !== "general") {
        return familyScore >= 0.65;
      }

      if (familyScore >= 0.75) {
        return true;
      }

      const hasMaturitySignal =
        node.helped_count >= 2 ||
        node.validation_state === "validated_by_reuse" ||
        (node.recommended_steps?.length ?? 0) > 0 ||
        Boolean(node.goal?.trim());

      return GENERAL_DEBUG_LIKE_QUERY_PATTERN.test(queryText || retrievalSource.taskSummary) && (
        familyScore >= STRONG_GENERAL_ADJACENT_FAMILY_THRESHOLD &&
        strongestSignal >= STRONG_GENERAL_ADJACENT_SIGNAL_THRESHOLD &&
        hasMaturitySignal
      );
    })
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, 8);

  const rerankCandidates = [...ranked].sort((left, right) => right.totalScore - left.totalScore);
  const rerankScoreById = new Map<string, number>();
  const rerankSourceById = new Map<string, "heuristic" | "model">();
  if (rerankCandidates.length) {
    const rerankInput = {
      queryText: queryText || retrievalSource.taskSummary,
      taskType: inputTaskType,
      candidates: rerankCandidates.map(
        ({
          node,
          semanticScore,
          lexicalScore,
          fusedScore,
          retrievalScore,
          retrievalReasons,
          policyAdjustment,
          policyScore,
          policyReasons,
          policyComponents,
          familyScore,
          matchScorecard,
          totalScore,
          scopeMatch,
          taskFamilyMatch
        }) => ({
          node,
          semanticScore,
          lexicalScore,
          fusedScore,
          retrievalScore,
          retrievalReasons,
          policyAdjustment,
          policyScore,
          policyReasons,
          policyComponents,
          familyScore,
          matchScorecard,
          totalScore,
          scopeMatch,
          taskFamilyMatch
        })
      )
    };
    const defaultRerankScores = computeDefaultRerankScores(rerankInput.queryText, rerankInput.candidates);
    const modelRerankResults =
      !options.reranker && options.config
        ? await rerankCandidatesWithModel(rerankInput.queryText, rerankInput.candidates, {
            config: options.config,
            env: options.env,
            homeDir: options.homeDir,
            fetchImpl: options.fetchImpl,
            resolveEndpoint: options.resolveRerankerEndpoint
          })
        : null;
    const rerankResults = options.reranker
      ? await options.reranker(rerankInput)
      : modelRerankResults ??
        rerankInput.candidates
          .slice(0, DEFAULT_RERANK_WINDOW)
          .map((candidate) => ({
            id: candidate.node.id,
            score: defaultRerankScores.get(candidate.node.id) ?? 0
          }));
    const rerankSource: "heuristic" | "model" =
      options.reranker || !modelRerankResults?.length ? "heuristic" : "model";
    const hasExternalReranker = Boolean(options.reranker || modelRerankResults?.length);

    const maxScore = Math.max(
      0,
      ...rerankResults.map((result) => (Number.isFinite(result.score) ? result.score : 0))
    );
    for (const result of rerankResults) {
      const normalized = maxScore > 0 ? Math.max(0, result.score) / maxScore : 0;
      rerankScoreById.set(result.id, Number(normalized.toFixed(6)));
      rerankSourceById.set(result.id, rerankSource);
    }
    rerankSourceById.set("__external__", hasExternalReranker ? "model" : "heuristic");
  }

  const reranked = rerankCandidates
    .map((entry) => {
      const rerankScore = rerankScoreById.get(entry.node.id);
      const hasExternalReranker = rerankSourceById.get("__external__") === "model";
      const rerankBoost =
        typeof rerankScore === "number"
          ? hasExternalReranker
            ? rerankScore * 0.3 + (rerankScore >= 0.9 ? 0.18 : rerankScore >= 0.75 ? 0.08 : 0)
            : rerankScore * 0.12 + (rerankScore >= 0.9 ? 0.04 : 0)
          : 0;
      return {
        ...entry,
        rerankScore,
        rerankSource: rerankSourceById.get(entry.node.id),
        totalScore: entry.totalScore + rerankBoost
      };
    })
    .sort((left, right) => right.totalScore - left.totalScore);

  return {
    candidates: reranked.map((entry, index) => ({
      ...entry,
      scoreMargin: Math.max(0, entry.totalScore - (reranked[index + 1]?.totalScore ?? 0))
    })),
    retrievalQuery,
    queryText,
    semanticSkipped,
    retrievalPolicyDiagnostics: {
      stages: [
        retrievalStage("retrieval_context", {
          passedCount: 1,
          reasonCodes: [
            options.retrievalContext ? "explicit_retrieval_context" : "experience_input_compatible",
            "opportunistic_fields_soft"
          ]
        }),
        hardFilterResult.diagnostic,
        buildShortlistDiagnostic(lexicalShortlist.length, scopeLocalNodes.length, semanticMode === "backfill"),
        buildSemanticDiagnostic(semanticMode, scoreById.size, semanticSkipped),
        buildPolicyEnrichmentDiagnostic(reranked.length)
      ]
    }
  };
};

export const retrieveScoredCandidates = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  options: RetrieveOptions = {}
): Promise<RetrievedCandidate[]> => {
  const bundle = await retrieveCandidateBundle(input, nodes, options);
  return bundle.candidates;
};
