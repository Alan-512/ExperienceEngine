import type { OutcomeSignal, ToolEvent } from "../types/domain.js";

const EXPLORATORY_TOOL_PATTERN = /\b(rg|grep|find|ls|pwd|cat|sed|head|tail|stat|glob|read)\b/i;
const STRONG_SUCCESS_PATTERN = /\b(fixed|resolved|working|passed|completed|done|success)\b/i;
const STRONG_FAILURE_PATTERN = /\b(failed|unable|cannot|blocked|broken|error persists)\b/i;

const isExploratoryTool = (event: ToolEvent): boolean => EXPLORATORY_TOOL_PATTERN.test(event.tool_name);

const isSignificantEvent = (event: ToolEvent): boolean =>
  event.status === "success" || event.status === "failure" || (event.exit_code ?? 0) > 0;

export const resolveOutcome = (events: ToolEvent[], finalMessage?: string): OutcomeSignal => {
  const lastTerminalEvent = [...events].reverse().find((event) => isSignificantEvent(event) && !isExploratoryTool(event));

  if (lastTerminalEvent) {
    if (lastTerminalEvent.status === "success") {
      return "success";
    }

    if (lastTerminalEvent.status === "failure" || (lastTerminalEvent.exit_code ?? 0) > 0) {
      return "failure";
    }
  }

  if (finalMessage && STRONG_SUCCESS_PATTERN.test(finalMessage)) {
    return "success";
  }

  if (finalMessage && STRONG_FAILURE_PATTERN.test(finalMessage)) {
    return "failure";
  }

  return "unknown";
};
