import type { OutcomeSignal, ToolEvent } from "../types/domain.js";
import { isExploratoryTool, isEditTool, isSignificantToolEvent } from "./tool-event-significance.js";

const STRONG_SUCCESS_PATTERN = /\b(fixed|resolved|working|passed|completed|done|success)\b/i;
const STRONG_FAILURE_PATTERN = /\b(failed|unable|cannot|blocked|broken|error persists)\b/i;

export const resolveOutcome = (events: ToolEvent[], finalMessage?: string): OutcomeSignal => {
  const lastTerminalEvent = [...events]
    .reverse()
    .find((event) => isSignificantToolEvent(event) && !isExploratoryTool(event) && !isEditTool(event));

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
