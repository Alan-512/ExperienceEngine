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

export const decideIntervention = (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  stats?: ScopeTaskStats,
  threshold = 0.6,
  maxHints = 3
): InterventionDecision => {
  if (!evaluateTrigger(input, stats, undefined, threshold)) {
    return { mode: "skip", selected: [] };
  }

  const ranked = rankNodes(input.task_summary, retrieveCandidates(input, nodes));
  if (!ranked.length) {
    return { mode: "skip", selected: [] };
  }

  const mode: InjectionMode = ranked[0]?.state === "candidate" ? "inject_conservative" : "inject";
  const selected = ranked.slice(0, maxHints);

  return {
    mode,
    selected,
    text: renderInjection(mode, selected, maxHints)
  };
};
