import type { ExperienceInput, ExperienceNode, InjectionMode, ScopeTaskStats } from "../types/domain.js";
import { retrieveCandidates } from "./candidate-retriever.js";
import { renderInjection } from "./injection-renderer.js";
import { rankNodes } from "./node-ranker.js";
import { evaluateTrigger } from "./trigger-evaluator.js";

export type InterventionDecision = {
  mode: InjectionMode;
  selected: ExperienceNode[];
  text?: string;
};

export const selectInjectableNodes = (
  ranked: ExperienceNode[],
  maxHints = 3
): ExperienceNode[] => {
  const strategyNodes = ranked.filter((node) => node.node_type === "strategy");
  const fallback = strategyNodes.length ? strategyNodes : ranked.filter((node) => node.node_type === "warning");
  return fallback.slice(0, maxHints);
};

export const decideIntervention = (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  stats?: ScopeTaskStats,
  threshold = 0.6,
  maxHints = 3
): InterventionDecision => {
  const candidates = retrieveCandidates(input, nodes);
  const ranked = rankNodes(input.task_summary, candidates, input.task_type);

  if (!ranked.length) {
    return { mode: "skip", selected: [] };
  }

  const selected = selectInjectableNodes(ranked, maxHints);
  const candidateRiskSummary = selected[0]?.trigger_pattern ?? selected[0]?.compact_hint;

  if (!evaluateTrigger(input, stats, candidateRiskSummary, threshold)) {
    return { mode: "skip", selected: [] };
  }

  const mode: InjectionMode = ranked[0]?.state === "candidate" ? "inject_conservative" : "inject";

  if (!selected.length) {
    return { mode: "skip", selected: [] };
  }

  return {
    mode,
    selected,
    text: renderInjection(mode, selected, maxHints)
  };
};
