import type { ExperienceNode, InjectionMode } from "../types/domain.js";

export const renderInjection = (
  mode: Exclude<InjectionMode, "skip">,
  nodes: ExperienceNode[],
  maxHints = 3
): string => {
  const selected = nodes.slice(0, maxHints);
  const body = selected.map((node) => `- ${node.compact_hint}`).join("\n");
  const title =
    mode === "inject" ? "Execution hints from prior similar tasks:" : "Conservative execution hints:";

  return [title, body].filter(Boolean).join("\n");
};

