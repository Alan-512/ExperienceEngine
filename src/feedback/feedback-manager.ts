import type { ExperienceInput, ExperienceNode } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { detectHarm } from "./harm-detector.js";
import { transitionState } from "./state-transition.js";

export const applyFeedback = (input: ExperienceInput, nodes: ExperienceNode[]): ExperienceNode[] => {
  const harmed = detectHarm(input);

  return nodes.map((node) => {
    if (!input.injected_node_ids.includes(node.id)) {
      return node;
    }

    const next = {
      ...node,
      usage_count: node.usage_count + 1,
      helped_count: node.helped_count + Number(input.outcome_signal === "success"),
      harmed_count: node.harmed_count + Number(harmed),
      last_used_at: nowIso(),
      last_helped_at: input.outcome_signal === "success" ? nowIso() : node.last_helped_at,
      last_harmed_at: harmed ? nowIso() : node.last_harmed_at,
      updated_at: nowIso()
    };

    return {
      ...next,
      state: transitionState(next)
    };
  });
};

