import type { ResolvedTaskType } from "../types/domain.js";
import { normalizeWhitespace } from "../utils/text.js";

const MATCHERS: Array<[ResolvedTaskType, RegExp]> = [
  ["test_debug", /\b(test|vitest|jest|playwright|failing spec|assert(?:ion)?)\b/i],
  ["build_debug", /\b(build|compile|bundle|vite|webpack|tsc|transpile)\b/i],
  ["integration_fix", /\b(api|integration|webhook|oauth|auth|database|sqlite|postgres|service)\b/i],
  ["bug_fix", /\b(bug|fix|broken|error|issue|crash|regression)\b/i]
];

export const resolveTaskType = (summary: string): ResolvedTaskType => {
  const text = normalizeWhitespace(summary);
  if (!text) {
    return "unknown";
  }

  for (const [taskType, pattern] of MATCHERS) {
    if (pattern.test(text)) {
      return taskType;
    }
  }

  return "unknown";
};

