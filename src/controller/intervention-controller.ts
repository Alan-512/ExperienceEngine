import type {
  ExperienceInput,
  ExperienceNode,
  InjectionScorecardCandidate,
  InjectionMode,
  ResolvedTaskType,
  ScopeTaskStats,
  ValidationState
} from "../types/domain.js";
import { retrieveCandidates, retrieveScoredCandidates, type RetrievedCandidate } from "./candidate-retriever.js";
import { renderInjection } from "./injection-renderer.js";
import { rankNodes } from "./node-ranker.js";
import { buildRetrievalQuery } from "./query-rewrite.js";
import { evaluateTrigger, type TriggerCandidateQuality } from "./trigger-evaluator.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";

export type InterventionDecision = {
  mode: InjectionMode;
  selected: ExperienceNode[];
  text?: string;
  diagnostics?: {
    topCandidates: InjectionScorecardCandidate[];
    topCandidateScore?: number;
    scoreMargin?: number;
    fastPathApplied: boolean;
    queryRewriteApplied?: boolean;
    gateReason: string;
    decisionReason: string;
  };
};

const isTrustedSameFamilyCluster = (
  quality: TriggerCandidateQuality,
  runnerUpQuality?: TriggerCandidateQuality
): boolean =>
  Boolean(
    runnerUpQuality &&
    quality.scopeMatch &&
    quality.taskFamilyMatch &&
    runnerUpQuality.scopeMatch &&
    runnerUpQuality.taskFamilyMatch &&
    quality.state === "active" &&
    runnerUpQuality.state === "active" &&
    quality.helpedCount >= 2 &&
    runnerUpQuality.helpedCount >= 2 &&
    quality.totalScore >= 1.1 &&
    runnerUpQuality.totalScore >= 0.95 &&
    quality.helpedCount >= runnerUpQuality.helpedCount
  );

const isStrongCandidate = (
  quality: TriggerCandidateQuality,
  runnerUpQuality?: TriggerCandidateQuality
): boolean => {
  return quality.scopeMatch &&
    quality.taskFamilyMatch &&
    quality.state === "active" &&
    quality.totalScore >= 0.75 &&
    (
      quality.scoreMargin >= 0.08 ||
      !runnerUpQuality ||
      (
        runnerUpQuality.state === "candidate" &&
        runnerUpQuality.helpedCount === 0 &&
        runnerUpQuality.validationState !== "validated_by_reuse"
      ) ||
      isTrustedSameFamilyCluster(quality, runnerUpQuality)
    ) &&
    (quality.helpedCount >= 2 || quality.validationState === "validated_by_reuse") &&
    quality.helpedCount >= quality.harmedCount;
};

const toCandidateQuality = (
  input: ExperienceInput,
  node: ExperienceNode | undefined,
  candidate: RetrievedCandidate | undefined
): TriggerCandidateQuality | undefined => {
  if (!node || !candidate) {
    return undefined;
  }

  return {
    semanticScore: candidate.semanticScore,
    totalScore: candidate.totalScore,
    familyScore: candidate.familyScore,
    scopeMatch: candidate.scopeMatch,
    taskFamilyMatch: candidate.taskFamilyMatch || node.task_type === input.task_type,
    state: node.state,
    helpedCount: node.helped_count,
    harmedCount: node.harmed_count,
    validationState: node.validation_state as ValidationState | undefined,
    scoreMargin: candidate.scoreMargin
  };
};

const toScorecardCandidate = (candidate: RetrievedCandidate): InjectionScorecardCandidate => ({
  id: candidate.node.id,
  semanticScore: Number(candidate.semanticScore.toFixed(4)),
  lexicalScore: Number(candidate.lexicalScore.toFixed(4)),
  fusedScore: Number(candidate.fusedScore.toFixed(4)),
  rerankScore: typeof candidate.rerankScore === "number" ? Number(candidate.rerankScore.toFixed(4)) : undefined,
  taskFamilyMatch: candidate.taskFamilyMatch
});

const CORRECTION_INTENT_PATTERNS = [
  /\bcorrection\b/i,
  /\bthat answer was wrong\b/i,
  /\bprevious pass\b/i,
  /\bthe real issue\b/i,
  /\bfocused too much on\b/i
];

const hasCorrectionIntent = (input: ExperienceInput): boolean => {
  const text = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  return CORRECTION_INTENT_PATTERNS.some((pattern) => pattern.test(text));
};

const buildCandidateRiskSummary = (node: ExperienceNode | undefined): string | undefined => {
  if (!node) {
    return undefined;
  }

  if (node.experience_kind === "expectation_correction") {
    return [node.deviation_pattern, node.corrected_constraint, node.trigger_pattern].filter(Boolean).join("\n");
  }

  return node.trigger_pattern ?? node.compact_hint;
};

const resolveTriggerThreshold = (selected: ExperienceNode | undefined, threshold: number): number => {
  if (!selected) {
    return threshold;
  }

  if (selected.experience_kind === "expectation_correction") {
    return Math.min(threshold, 0.4);
  }

  return threshold;
};

const isMatureReusableNode = (node: ExperienceNode): boolean =>
  node.state === "active" &&
  (node.helped_count >= 2 || node.validation_state === "validated_by_reuse") &&
  node.helped_count >= node.harmed_count;

export const selectInjectableNodes = (
  ranked: ExperienceNode[],
  maxHints = 3,
  preferredTaskType?: ResolvedTaskType
): ExperienceNode[] => {
  const strategyNodes = ranked.filter((node) => node.node_type === "strategy");
  const exactFamilyStrategies =
    preferredTaskType && preferredTaskType !== "unknown"
      ? strategyNodes.filter((node) => node.task_type === preferredTaskType)
      : [];
  const matureExactFamilyStrategies = exactFamilyStrategies.filter(isMatureReusableNode);
  const familyScopedStrategies =
    exactFamilyStrategies.length >= 2 && matureExactFamilyStrategies.length >= 2
      ? matureExactFamilyStrategies
      : exactFamilyStrategies.length >= 1
        ? exactFamilyStrategies
        : strategyNodes;
  const fallback = familyScopedStrategies.length
    ? familyScopedStrategies
    : ranked.filter((node) => node.node_type === "warning");
  const selectionCap = exactFamilyStrategies.length >= 2 ? Math.min(maxHints, 2) : maxHints;
  return fallback.slice(0, selectionCap);
};

export const decideIntervention = (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  stats?: ScopeTaskStats,
  threshold = 0.6,
  maxHints = 3,
  config?: Pick<ExperienceEngineConfig, "embeddingProvider" | "embeddingModel" | "embeddingDtype" | "embeddingCacheDir">
): Promise<InterventionDecision> => decideInterventionInternal(input, nodes, stats, threshold, maxHints, config);

const decideInterventionInternal = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  stats?: ScopeTaskStats,
  threshold = 0.6,
  maxHints = 3,
  config?: Pick<ExperienceEngineConfig, "embeddingProvider" | "embeddingModel" | "embeddingDtype" | "embeddingCacheDir">
): Promise<InterventionDecision> => {
  const scoredCandidates = await retrieveScoredCandidates(input, nodes, { config });
  const retrievalQuery = buildRetrievalQuery(input.task_summary, input.context_summary);
  const rankingSummary = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  const rankTieBreakOrder = new Map(
    rankNodes(
      rankingSummary || input.task_summary,
      scoredCandidates.map(({ node }) => node),
      input.task_type
    ).map((node, index) => [node.id, index])
  );
  const ranked = [...scoredCandidates]
    .sort((left, right) => {
      const scoreDiff = right.totalScore - left.totalScore;
      if (Math.abs(scoreDiff) > 0.01) {
        return scoreDiff;
      }

      return (rankTieBreakOrder.get(left.node.id) ?? Number.MAX_SAFE_INTEGER) -
        (rankTieBreakOrder.get(right.node.id) ?? Number.MAX_SAFE_INTEGER);
    })
    .map(({ node }) => node);
  const candidateById = new Map(scoredCandidates.map((candidate) => [candidate.node.id, candidate]));
  const correctionAwareRanked = hasCorrectionIntent(input)
    ? [
        ...ranked.filter((node) => node.experience_kind === "expectation_correction"),
        ...ranked.filter((node) => node.experience_kind !== "expectation_correction")
      ]
    : ranked;

  if (!correctionAwareRanked.length) {
    return {
      mode: "skip",
      selected: [],
      diagnostics: {
        topCandidates: [],
        fastPathApplied: false,
        gateReason: "no_candidates",
        decisionReason: "no_matching_candidates"
      }
    };
  }

  const mode: InjectionMode =
    correctionAwareRanked[0]?.state === "candidate" ? "inject_conservative" : "inject";
  const selected = selectInjectableNodes(
    correctionAwareRanked,
    mode === "inject_conservative" ? 1 : maxHints,
    input.task_type
  );
  const topCandidateQuality = toCandidateQuality(input, selected[0], selected[0] ? candidateById.get(selected[0].id) : undefined);
  const runnerUpQuality = toCandidateQuality(input, selected[1], selected[1] ? candidateById.get(selected[1].id) : undefined);
  const candidateRiskSummary = buildCandidateRiskSummary(selected[0]);
  const triggerThreshold = resolveTriggerThreshold(selected[0], threshold);
  const diagnostics = {
    topCandidates: scoredCandidates.slice(0, 3).map(toScorecardCandidate),
    topCandidateScore: topCandidateQuality ? Number(topCandidateQuality.totalScore.toFixed(4)) : undefined,
    scoreMargin: topCandidateQuality ? Number(topCandidateQuality.scoreMargin.toFixed(4)) : undefined,
    fastPathApplied: false,
    queryRewriteApplied: retrievalQuery.rewriteApplied,
    gateReason: "candidate_quality_gate",
    decisionReason: "candidate_quality_positive"
  };

  if (topCandidateQuality && isStrongCandidate(topCandidateQuality, runnerUpQuality)) {
    const fastPathSelection =
      isTrustedSameFamilyCluster(topCandidateQuality, runnerUpQuality)
        ? selected
        : selected[0]
          ? [selected[0]]
          : [];
    return {
      mode,
      selected: fastPathSelection,
      text: renderInjection(mode, fastPathSelection, maxHints),
      diagnostics: {
        ...diagnostics,
        fastPathApplied: true,
        gateReason: "strong_candidate_fast_path",
        decisionReason: "mature_validated_candidate"
      }
    };
  }

  if (
    !evaluateTrigger(
      input,
      stats,
      {
        knownRiskSummary: candidateRiskSummary,
        candidateQuality: topCandidateQuality
      },
      triggerThreshold
    )
  ) {
    return {
      mode: "skip",
      selected: [],
      diagnostics: {
        ...diagnostics,
        gateReason: "candidate_quality_gate",
        decisionReason: "candidate_quality_rejected"
      }
    };
  }

  if (!selected.length) {
    return {
      mode: "skip",
      selected: [],
      diagnostics: {
        ...diagnostics,
        gateReason: "no_selected_nodes",
        decisionReason: "selection_empty"
      }
    };
  }

  return {
    mode,
    selected,
    text: renderInjection(mode, selected, maxHints),
    diagnostics
  };
};
