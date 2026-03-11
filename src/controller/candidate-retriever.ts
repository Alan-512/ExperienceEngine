import type { ExperienceInput, ExperienceNode } from "../types/domain.js";

export const retrieveCandidates = (input: ExperienceInput, nodes: ExperienceNode[]): ExperienceNode[] =>
  nodes.filter(
    (node) =>
      node.scope_id === input.scope_id &&
      node.task_type === input.task_type &&
      (node.state === "active" || node.state === "cooling" || node.state === "candidate")
  );

