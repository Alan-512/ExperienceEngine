import type { ResolvedTaskType } from "../types/domain.js";
import {
  normalizeWhitespace,
  stripInlineCodeSpans,
  stripShellLikeTaskCommands
} from "../utils/text.js";

const AUTH_FIXTURE_TEST_PATTERN =
  /\b(auth|authentication)\b.*\b(fixture handshake|handshake behavior)\b|\b(fixture handshake|handshake behavior)\b.*\b(auth|authentication)\b/i;

const MATCHERS: Array<[ResolvedTaskType, RegExp]> = [
  ["test_debug", /\b(test|vitest|jest|playwright|failing spec|assert(?:ion)?)\b/i],
  ["test_debug", AUTH_FIXTURE_TEST_PATTERN],
  [
    "config_debug",
    /\b(openrouter|provider|model(?:\s+id)?|api key|apikey|endpoint|base url|routing|privacy|guardrail|zdr|rate limit|quota|credential|configuration|settings?)\b/i
  ],
  ["build_debug", /\b(build|compile|bundle|vite|webpack|tsc|transpile)\b/i],
  ["refactor", /\b(refactor|cleanup|clean up|reorganize|重构)\b/i],
  ["performance", /\b(slow|performance|optimi[sz]e|latency|memory|性能|优化)\b/i],
  ["feature_add", /\b(add|implement|create|new feature|新增|实现)\b/i],
  ["integration_fix", /\b(api|integration|webhook|oauth|auth|database|sqlite|postgres|service)\b/i],
  ["bug_fix", /\b(bug|fix|broken|error|issue|crash|regression)\b/i]
];

export const resolveTaskType = (summary: string): ResolvedTaskType => {
  const text = normalizeWhitespace(stripShellLikeTaskCommands(stripInlineCodeSpans(summary)));
  if (!text) {
    return "unknown";
  }

  for (const [taskType, pattern] of MATCHERS) {
    if (pattern.test(text)) {
      return taskType;
    }
  }

  return "general";
};
