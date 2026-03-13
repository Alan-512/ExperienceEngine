import type { ExperienceInput, ExperienceNode, ToolEvent } from "../types/domain.js";
import { tokenize } from "../utils/text.js";

const ENVIRONMENTAL_FAILURE_PATTERN =
  /\b(network|timeout|timed out|econnrefused|enotfound|permission denied|eacces|eperm|enospc|oom|killed|rate limit)\b/i;
const EXPLORATORY_TOOL_PATTERN = /\b(rg|grep|find|ls|pwd|cat|sed|head|tail|stat|glob|read)\b/i;

const isExploratoryTool = (event: ToolEvent): boolean => EXPLORATORY_TOOL_PATTERN.test(event.tool_name);

const isEnvironmentalFailure = (event: ToolEvent): boolean =>
  ENVIRONMENTAL_FAILURE_PATTERN.test(event.error_signature ?? "") ||
  ENVIRONMENTAL_FAILURE_PATTERN.test(event.output_summary ?? "");

const similarity = (left: string, right: string): number => {
  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right));
  if (!lhs.size || !rhs.size) {
    return 0;
  }

  const common = [...lhs].filter((token) => rhs.has(token)).length;
  return common / Math.max(lhs.size, rhs.size);
};

export const detectHarm = (input: ExperienceInput, node?: ExperienceNode): boolean => {
  if (input.outcome_signal !== "failure" || input.injected_node_ids.length === 0) {
    return false;
  }

  const relevantFailures = input.tool_events.filter((event) => {
    if (event.status !== "failure" && (event.exit_code ?? 0) <= 0) {
      return false;
    }

    if (isExploratoryTool(event)) {
      return false;
    }

    if (isEnvironmentalFailure(event)) {
      return false;
    }

    return true;
  });

  if (!relevantFailures.length) {
    return false;
  }

  if (!node) {
    return true;
  }

  const failureContext = [input.task_summary, ...relevantFailures.map((event) => event.error_signature ?? event.output_summary ?? "")]
    .filter(Boolean)
    .join(" ");
  const nodeContext = [node.trigger_pattern, node.compact_hint, node.success_signal].filter(Boolean).join(" ");

  return similarity(failureContext, nodeContext) >= 0.1;
};
