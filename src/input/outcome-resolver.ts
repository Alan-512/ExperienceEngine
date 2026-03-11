import type { OutcomeSignal, ToolEvent } from "../types/domain.js";

export const resolveOutcome = (events: ToolEvent[], finalMessage?: string): OutcomeSignal => {
  if (events.some((event) => event.status === "failure" || (event.exit_code ?? 0) > 0)) {
    return "failure";
  }

  if (events.some((event) => event.status === "success")) {
    return "success";
  }

  if (finalMessage && /\b(fixed|resolved|working|passed)\b/i.test(finalMessage)) {
    return "success";
  }

  return "unknown";
};

