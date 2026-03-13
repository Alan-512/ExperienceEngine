import type { ExperienceNode } from "../types/domain.js";

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

export const renderInlineNotice = (nodes: ExperienceNode[]): string | undefined => {
  if (!nodes.length) {
    return undefined;
  }

  const count = nodes.length;
  const warningOnly = nodes.every((node) => node.node_type === "warning");
  const label = warningOnly ? pluralize(count, "caution hint") : pluralize(count, "strategy hint");
  return `[ExperienceEngine] Injected ${count} ${label} for this task.`;
};
