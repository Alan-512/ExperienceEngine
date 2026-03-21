import type {
  ExperienceInput,
  ExperienceNode,
  InjectionMode,
  ResolvedTaskType,
  ScopeTaskStats
} from "../types/domain.js";
import { retrieveCandidates } from "./candidate-retriever.js";
import { renderInjection } from "./injection-renderer.js";
import { rankNodes } from "./node-ranker.js";
import { evaluateTrigger } from "./trigger-evaluator.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";

export type InterventionDecision = {
  mode: InjectionMode;
  selected: ExperienceNode[];
  text?: string;
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
  const candidates = await retrieveCandidates(input, nodes, { config });
  const ranked = rankNodes(input.task_summary, candidates, input.task_type);

  if (!ranked.length) {
    return { mode: "skip", selected: [] };
  }

  const mode: InjectionMode = ranked[0]?.state === "candidate" ? "inject_conservative" : "inject";
  const selected = selectInjectableNodes(
    ranked,
    mode === "inject_conservative" ? 1 : maxHints,
    input.task_type
  );
  const candidateRiskSummary = buildCandidateRiskSummary(selected[0]);
  const triggerThreshold = resolveTriggerThreshold(selected[0], threshold);

  if (!evaluateTrigger(input, stats, candidateRiskSummary, triggerThreshold)) {
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
