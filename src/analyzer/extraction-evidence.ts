import type { ExperienceInput, TaskType, ToolEvent } from "../types/domain.js";
import { normalizeWhitespace, tokenize, truncate } from "../utils/text.js";

const EXPLORATORY_TOOL_PATTERN = /\b(read|search|find|grep|rg|ls|glob|cat|head|tail)\b/i;
const VERIFICATION_TOOL_PATTERN =
  /\b(vitest|jest|playwright|test|tsc|eslint|build|vite|webpack|exec|process|npm|pnpm|yarn)\b/i;

export type ExtractionEvidence = {
  taskSummary: string;
  taskType: TaskType;
  terminalEvents: ToolEvent[];
  terminalToolSequence: string[];
  terminalSequenceLabel: string;
  verificationTool?: string;
  verificationSummary?: string;
  primaryFailureTool?: string;
  primaryFailureSignature?: string;
  failureSummary?: string;
};

const toEventLabel = (event: ToolEvent): string => {
  const statusSuffix = event.status === "failure" ? " failed" : event.status === "success" ? " passed" : "";
  return `${event.tool_name}${statusSuffix}`.trim();
};

const toFailureSignature = (event?: ToolEvent): string | undefined => {
  const signature = normalizeWhitespace(event?.error_signature ?? event?.output_summary ?? "");
  if (!signature) {
    return undefined;
  }

  const firstLine = signature.split(/\n+/)[0] ?? signature;
  return truncate(firstLine, 96);
};

const isExploratoryTool = (event: ToolEvent): boolean => EXPLORATORY_TOOL_PATTERN.test(event.tool_name);

const isSignificant = (event: ToolEvent): boolean =>
  !isExploratoryTool(event) || VERIFICATION_TOOL_PATTERN.test(event.tool_name);

const scoreVerificationTool = (event: ToolEvent): number => {
  if (event.status !== "success") {
    return -1;
  }

  if (VERIFICATION_TOOL_PATTERN.test(event.tool_name)) {
    return 2;
  }

  return isExploratoryTool(event) ? 0 : 1;
};

export const summarizeTaskFamily = (taskType: TaskType): string => {
  switch (taskType) {
    case "test_debug":
      return "targeted test failure";
    case "build_debug":
      return "build or compile regression";
    case "config_debug":
      return "provider or configuration path";
    case "integration_fix":
      return "service or integration path";
    case "feature_add":
      return "new implementation slice";
    case "refactor":
      return "refactor boundary";
    case "performance":
      return "performance-sensitive path";
    case "bug_fix":
      return "bug-fix path";
    case "general":
    default:
      return "coding task";
  }
};

export const buildExtractionEvidence = (input: ExperienceInput): ExtractionEvidence | null => {
  if (input.task_type === "unknown") {
    return null;
  }

  const significantEvents = input.tool_events.filter((event) => event.status !== "unknown" && isSignificant(event));
  const terminalEvents = significantEvents.slice(-3);
  const terminalToolSequence = terminalEvents.map((event) => event.tool_name);
  const terminalSequenceLabel = terminalEvents.length
    ? terminalEvents.map(toEventLabel).join(" -> ")
    : "no confirmed terminal tool sequence";

  const verificationCandidates = significantEvents
    .filter((event) => scoreVerificationTool(event) >= 0)
    .sort((left, right) => scoreVerificationTool(right) - scoreVerificationTool(left));
  const verificationEvent = verificationCandidates[0];

  const failureEvent = [...significantEvents].reverse().find((event) => event.status === "failure");
  const failureSignature = toFailureSignature(failureEvent);

  const failureSummaryParts = [
    failureEvent?.tool_name ? `${failureEvent.tool_name} failed` : undefined,
    failureSignature
  ].filter(Boolean);

  return {
    taskSummary: input.task_summary,
    taskType: input.task_type,
    terminalEvents,
    terminalToolSequence,
    terminalSequenceLabel,
    verificationTool: verificationEvent?.tool_name,
    verificationSummary: normalizeWhitespace(verificationEvent?.output_summary ?? "") || undefined,
    primaryFailureTool: failureEvent?.tool_name,
    primaryFailureSignature: failureSignature,
    failureSummary: failureSummaryParts.length ? failureSummaryParts.join(": ") : undefined
  };
};

export const summarizeOverlap = (summary: string, toolSequence: string[]): string | undefined => {
  const summaryTokens = tokenize(summary);
  if (!summaryTokens.length || !toolSequence.length) {
    return undefined;
  }

  const toolTokens = toolSequence.flatMap((tool) => tokenize(tool));
  const overlap = toolTokens.filter((token) => summaryTokens.includes(token));
  if (!overlap.length) {
    return undefined;
  }

  return [...new Set(overlap)].join(", ");
};
