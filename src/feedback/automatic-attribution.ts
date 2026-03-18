import type { ExperienceInput, ExperienceNode, FeedbackAttributionReason, ToolEvent } from "../types/domain.js";
import { detectHarm } from "./harm-detector.js";

const EXPLORATORY_TOOL_PATTERN = /\b(rg|grep|find|ls|pwd|cat|sed|head|tail|stat|glob|read)\b/i;
const ENVIRONMENTAL_FAILURE_PATTERN =
  /\b(network|timeout|timed out|econnrefused|enotfound|permission denied|eacces|eperm|enospc|oom|killed|rate limit)\b/i;

const isExploratoryTool = (event: ToolEvent): boolean => EXPLORATORY_TOOL_PATTERN.test(event.tool_name);

const isEnvironmentalFailure = (event: ToolEvent): boolean =>
  ENVIRONMENTAL_FAILURE_PATTERN.test(event.error_signature ?? "") ||
  ENVIRONMENTAL_FAILURE_PATTERN.test(event.output_summary ?? "");

const isFailedEvent = (event: ToolEvent): boolean =>
  event.status === "failure" || (event.exit_code ?? 0) > 0;

export const classifyFailureAttributionReason = (
  input: ExperienceInput,
  node?: ExperienceNode
): Extract<
  FeedbackAttributionReason,
  "relevant_failure" | "environmental_failure" | "exploratory_failure" | "no_relevant_failure"
> => {
  const failedEvents = input.tool_events.filter((event) => isFailedEvent(event));
  if (!failedEvents.length) {
    return "no_relevant_failure";
  }

  const nonExploratoryFailures = failedEvents.filter((event) => !isExploratoryTool(event));
  if (!nonExploratoryFailures.length) {
    return "exploratory_failure";
  }

  const nonEnvironmentalFailures = nonExploratoryFailures.filter((event) => !isEnvironmentalFailure(event));
  if (!nonEnvironmentalFailures.length) {
    return "environmental_failure";
  }

  return detectHarm(input, node) ? "relevant_failure" : "no_relevant_failure";
};

