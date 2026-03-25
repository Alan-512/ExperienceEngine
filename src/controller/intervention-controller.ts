import type {
  ExperienceInput,
  ExperienceNode,
  InjectionMode,
  ResolvedTaskType,
  ScopeTaskStats,
  ValidationState
} from "../types/domain.js";
import { retrieveCandidates, retrieveScoredCandidates, type RetrievedCandidate } from "./candidate-retriever.js";
import { renderInjection } from "./injection-renderer.js";
import { rankNodes } from "./node-ranker.js";
import { evaluateTrigger, type TriggerCandidateQuality } from "./trigger-evaluator.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";

export type InterventionDecision = {
  mode: InjectionMode;
  selected: ExperienceNode[];
  text?: string;
};

const isStrongCandidate = (quality: TriggerCandidateQuality): boolean =>
  quality.scopeMatch &&
  quality.taskFamilyMatch &&
  quality.state === "active" &&
  quality.totalScore >= 0.75 &&
  quality.scoreMargin >= 0.08 &&
  (quality.helpedCount >= 2 || quality.validationState === "validated_by_reuse") &&
  quality.helpedCount >= quality.harmedCount;

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
  const familyScopedStrategies = exactFamilyStrategies.length >= 1 ? exactFamilyStrategies : strategyNodes;
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
  const candidates = scoredCandidates.map(({ node }) => node);
  const rankingSummary = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  const ranked = rankNodes(rankingSummary || input.task_summary, candidates, input.task_type);
  const candidateById = new Map(scoredCandidates.map((candidate) => [candidate.node.id, candidate]));
  const correctionAwareRanked = hasCorrectionIntent(input)
    ? [
        ...ranked.filter((node) => node.experience_kind === "expectation_correction"),
        ...ranked.filter((node) => node.experience_kind !== "expectation_correction")
      ]
    : ranked;

  if (!correctionAwareRanked.length) {
    return { mode: "skip", selected: [] };
  }

  const mode: InjectionMode =
    correctionAwareRanked[0]?.state === "candidate" ? "inject_conservative" : "inject";
  const selected = selectInjectableNodes(
    correctionAwareRanked,
    mode === "inject_conservative" ? 1 : maxHints,
    input.task_type
  );
  const topCandidateQuality = toCandidateQuality(input, selected[0], selected[0] ? candidateById.get(selected[0].id) : undefined);
  const candidateRiskSummary = buildCandidateRiskSummary(selected[0]);
  const triggerThreshold = resolveTriggerThreshold(selected[0], threshold);

  if (topCandidateQuality && isStrongCandidate(topCandidateQuality)) {
    return {
      mode,
      selected,
      text: renderInjection(mode, selected, maxHints)
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
    return { mode: "skip", selected: [] };
  }

  if (!selected.length) {
    return { mode: "skip", selected: [] };
  }

  return {
    mode,
    selected,
    text: renderInjection(mode, selected, maxHints)
  };
};
