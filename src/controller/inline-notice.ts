import { deriveInjectionRiskLevel } from "./injection-scorecard.js";
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
  const riskLevel = deriveInjectionRiskLevel(nodes);
  return `[ExperienceEngine] Injected ${count} ${label} for this task (risk: ${riskLevel}). Run ee inspect --last to review why it matched.`;
};
