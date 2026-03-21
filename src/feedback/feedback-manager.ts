import type { ExperienceInput, ExperienceNode } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { detectHarm } from "./harm-detector.js";
import { transitionState, transitionValidationState } from "./state-transition.js";

const appendUniqueId = (values: string[], nextId?: string): string[] => {
  if (!nextId) {
    return values;
  }

  return values.includes(nextId) ? values : [...values, nextId];
};

export const applyFeedback = (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  attributionRecordId?: string
): ExperienceNode[] => {
  const timestamp = nowIso();

  return nodes.map((node) => {
    if (!input.injected_node_ids.includes(node.id)) {
      return node;
    }

    const harmed = detectHarm(input, node);

    const next = {
      ...node,
      usage_count: node.usage_count + 1,
      helped_count: node.helped_count + Number(input.outcome_signal === "success"),
      harmed_count: node.harmed_count + Number(harmed),
      validation_state:
        input.outcome_signal === "success"
          ? transitionValidationState(node, "helped")
          : harmed
            ? transitionValidationState(node, "harmed")
            : node.validation_state,
      helped_record_ids:
        input.outcome_signal === "success"
          ? appendUniqueId(node.helped_record_ids, attributionRecordId)
          : node.helped_record_ids,
      harmed_record_ids: harmed ? appendUniqueId(node.harmed_record_ids, attributionRecordId) : node.harmed_record_ids,
      last_used_at: timestamp,
      last_helped_at: input.outcome_signal === "success" ? timestamp : node.last_helped_at,
      last_harmed_at: harmed ? timestamp : node.last_harmed_at,
      updated_at: timestamp
    };

    return {
      ...next,
      state: transitionState(next)
    };
  });
};
