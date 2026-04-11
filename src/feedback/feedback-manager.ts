import type { ExperienceInput, ExperienceNode } from "../types/domain.js";
import type { NodeOriginProfile } from "../experience-management/task-management-signals.js";
import { nowIso } from "../utils/clock.js";
import { applyGovernedNodeFeedback } from "../experience-management/node-lifecycle-governance.js";
import { detectHarm } from "./harm-detector.js";

const appendUniqueId = (values: string[], nextId?: string): string[] => {
  if (!nextId) {
    return values;
  }

  return values.includes(nextId) ? values : [...values, nextId];
};

export const applyFeedback = (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  attributionRecordId?: string,
  options: { originProfilesByNodeId?: Record<string, NodeOriginProfile | undefined> } = {}
): ExperienceNode[] => {
  const timestamp = nowIso();

  return nodes.map((node) => {
    if (!input.injected_node_ids.includes(node.id)) {
      return node;
    }

    const harmed = detectHarm(input, node);
    const verdict =
      input.outcome_signal === "success"
        ? "uncertain"
        : harmed
          ? "harmed"
          : "none";

    return applyGovernedNodeFeedback(
      {
        ...node,
        usage_count: node.usage_count + 1,
        helped_record_ids: node.helped_record_ids,
        harmed_record_ids: harmed ? appendUniqueId(node.harmed_record_ids, attributionRecordId) : node.harmed_record_ids,
        last_used_at: timestamp
      },
      verdict,
      options.originProfilesByNodeId?.[node.id]
    );
  });
};
