import { selectRenderableNodes } from "./agents-renderer.js";
import type { RenderAgentsMarkdownInput } from "./types.js";

const shortenTitle = (value: string): string => {
  const marker = value.indexOf(": ");
  const raw = marker >= 0 ? value.slice(marker + 2) : value;
  return raw.length <= 72 ? raw : `${raw.slice(0, 69).trimEnd()}...`;
};

const shortenApplicability = (value: string, taskType: string): string => {
  if (value.length <= 96) {
    return value;
  }

  return `${taskType} tasks matching the same historical signal`;
};

const renderSection = (
  title: string,
  nodes: Array<ReturnType<typeof selectRenderableNodes>[number]>
): string[] => {
  if (!nodes.length) {
    return [];
  }

  const lines: string[] = [`## ${title}`, ""];
  for (const node of nodes) {
    lines.push(`### ${shortenTitle(node.title)}`);
    lines.push(`- Applies to: ${shortenApplicability(node.applicability, node.taskType)}`);
    lines.push(`- Confidence: ${node.confidence}`);
    lines.push(`- Instruction: ${node.guidance}`);
    lines.push("");
  }
  return lines;
};

export const renderGitHubAgentMarkdown = (input: RenderAgentsMarkdownInput): string => {
  const renderedNodes = selectRenderableNodes(input.nodes);
  const strategies = renderedNodes.filter((node) => node.nodeType === "strategy");
  const warnings = renderedNodes.filter((node) => node.nodeType === "warning");

  const frontmatter = [
    "---",
    `name: ${input.pack.name}`,
    `description: Reviewed ExperienceEngine guidance compiled from pack ${input.pack.packId}.`,
    "tools:",
    "  - read",
    "  - search",
    "  - edit",
    "  - run",
    "---",
    ""
  ];

  const body = [
    "# GitHub Copilot Custom Agent Profile",
    "",
    "## Operating Rules",
    "- Apply these instructions only when the task clearly matches the listed signals.",
    "- Prefer the smallest verifiable change and rerun the validation loop before widening scope.",
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

  return [...frontmatter, ...body].join("\n");
};
