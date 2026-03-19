import type { ExperiencePackNodeSnapshot } from "../packs/types.js";
import type { ExperienceNodeType } from "../types/domain.js";
import { normalizeWhitespace, stripInlineCodeSpans, stripShellLikeTaskCommands, truncate } from "../utils/text.js";
import type {
  ConfidenceLevel,
  RenderAgentsMarkdownInput,
  RenderedAgentsNode
} from "./types.js";

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  high: 0,
  medium: 1,
  low: 2
};

const nodeTypeOrder: Record<ExperienceNodeType, number> = {
  strategy: 0,
  warning: 1
};

const ABSOLUTE_PATH_PATTERN = /(?:[A-Za-z]:)?\/(?:[^\s"'`]+\/)*[^\s"'`]+/g;

const sanitizeInstructionText = (value: string, maxLength: number): string => {
  const normalized = normalizeWhitespace(value).replace(ABSOLUTE_PATH_PATTERN, "/redacted/path");
  const withoutCode = stripInlineCodeSpans(normalized);
  const withoutShellNoise = stripShellLikeTaskCommands(withoutCode);
  const compactedPunctuation = withoutShellNoise.replace(/([.!?])(?:\s*[.!?])+/g, "$1");
  return truncate(normalizeWhitespace(compactedPunctuation), maxLength);
};

const toConfidence = (node: ExperiencePackNodeSnapshot): ConfidenceLevel => {
  const score = node.helped_count - node.harmed_count;
  if (score >= 2 && node.harmed_count === 0) {
    return "high";
  }
  if (score < 0 || node.harmed_count > node.helped_count) {
    return "low";
  }
  return "medium";
};

const toTitle = (node: ExperiencePackNodeSnapshot): string => {
  const pattern = sanitizeInstructionText(node.trigger_pattern, 120);
  if (pattern.length > 0) {
    return `${node.task_type}: ${pattern}`;
  }
  return `${node.task_type}: ${node.id}`;
};

const toApplicability = (node: ExperiencePackNodeSnapshot): string => {
  const triggerPattern = sanitizeInstructionText(node.trigger_pattern, 160);
  if (triggerPattern.length > 0) {
    return `${node.task_type} tasks matching "${triggerPattern}"`;
  }
  return `${node.task_type} tasks`;
};

const toRenderedNode = (node: ExperiencePackNodeSnapshot): RenderedAgentsNode => ({
  id: node.id,
  nodeType: node.node_type,
  title: toTitle(node),
  applicability: toApplicability(node),
  guidanceLabel: node.node_type === "warning" ? "Avoid" : "Guidance",
  guidance: sanitizeInstructionText(node.compact_hint, 220),
  confidence: toConfidence(node),
  taskType: node.task_type
});

const compareRenderedNodes = (left: RenderedAgentsNode, right: RenderedAgentsNode): number =>
  nodeTypeOrder[left.nodeType] - nodeTypeOrder[right.nodeType] ||
  CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence] ||
  left.title.localeCompare(right.title) ||
  left.id.localeCompare(right.id);

export const selectRenderableNodes = (nodes: ExperiencePackNodeSnapshot[]): RenderedAgentsNode[] =>
  nodes
    .filter((node) => node.state !== "retired")
    .map(toRenderedNode)
    .sort(compareRenderedNodes);

const renderSection = (title: string, nodes: RenderedAgentsNode[]): string[] => {
  if (!nodes.length) {
    return [];
  }

  const lines: string[] = [`## ${title}`, ""];
  for (const node of nodes) {
    lines.push(`### ${node.title}`);
    lines.push(`- Applies to: ${node.applicability}`);
    lines.push(`- Confidence: ${node.confidence}`);
    lines.push(`- ${node.guidanceLabel}: ${node.guidance}`);
    lines.push("");
  }
  return lines;
};

export const renderAgentsMarkdown = (input: RenderAgentsMarkdownInput): string => {
  const renderedNodes = selectRenderableNodes(input.nodes);
  const strategies = renderedNodes.filter((node) => node.nodeType === "strategy");
  const warnings = renderedNodes.filter((node) => node.nodeType === "warning");

  const lines = [
    `# Experience Pack: ${input.pack.name}`,
    "",
    "## Scope",
    `- Pack ID: ${input.pack.packId}`,
    `- Task families: ${input.pack.taskFamilies.join(", ") || "none"}`,
    `- Hosts: ${input.pack.hostCompatibility.join(", ") || "none"}`,
    `- Scope hints: ${input.pack.scopeHints.join(", ") || "none"}`,
    "",
    "## How To Use",
    "- Treat this file as reviewed guidance distilled from historical ExperienceEngine nodes.",
    "- Prefer the smallest change that matches the relevant strategy or warning.",
    "- Re-run the verification loop named in the guidance before broadening the fix.",
    "",
    ...renderSection("Strategies", strategies),
    ...renderSection("Warnings", warnings),
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
