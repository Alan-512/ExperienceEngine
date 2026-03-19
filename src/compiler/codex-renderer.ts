import { selectRenderableNodes } from "./agents-renderer.js";
import type { RenderAgentsMarkdownInput } from "./types.js";

const renderSection = (
  title: string,
  nodes: Array<ReturnType<typeof selectRenderableNodes>[number]>
): string[] => {
  if (!nodes.length) {
    return [];
  }

  const lines: string[] = [`## ${title}`, ""];
  for (const node of nodes) {
    lines.push(`### ${node.title}`);
    lines.push(`- Signal: ${node.applicability}`);
    lines.push(`- Confidence: ${node.confidence}`);
    lines.push(`- Action: ${node.guidance}`);
    lines.push("");
  }
  return lines;
};

export const renderCodexMarkdown = (input: RenderAgentsMarkdownInput): string => {
  const renderedNodes = selectRenderableNodes(input.nodes);
  const strategies = renderedNodes.filter((node) => node.nodeType === "strategy");
  const warnings = renderedNodes.filter((node) => node.nodeType === "warning");

  const lines = [
    `# Codex Instructions: ${input.pack.name}`,
    "",
    "## Intent",
    "- Apply these instructions only when the task clearly matches the listed signals.",
    "- Prefer the smallest verifiable change and rerun the verification command before expanding scope.",
    "- If a warning conflicts with a strategy, resolve the warning first.",
    "",
    ...renderSection("Preferred Strategies", strategies),
    ...renderSection("Risk Warnings", warnings),
    "## Provenance",
    `- Pack ID: ${input.pack.packId}`,
    `- Version: ${input.manifest.version}`,
    `- Risk level: ${input.manifest.riskLevel}`,
    `- Generated at: ${input.generatedAt}`,
    `- Evidence: ${input.manifest.evidenceSummary || "none"}`,
    ""
  ];

  return lines.join("\n");
};
