import { describe, expect, it } from "vitest";
import { normalizeClaudeHookPayload } from "../../src/adapters/claude-code/hook-normalizer.js";

describe("Claude hook normalizer", () => {
  it("extracts a normalized prompt event", () => {
    const normalized = normalizeClaudeHookPayload({
      hook_event_name: "UserPromptSubmit",
      session_id: "session-a",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    expect(normalized.adapter).toBe("claude-code");
    expect(normalized.eventName).toBe("UserPromptSubmit");
    expect(normalized.sessionId).toBe("session-a");
    expect(normalized.cwd).toBe("/repo");
    expect(normalized.promptText).toBe("Fix the failing auth test");
    expect(normalized.toolName).toBeUndefined();
  });

  it("extracts a normalized tool event with defensive fallbacks", () => {
    const normalized = normalizeClaudeHookPayload({
      hook_event_name: "PostToolUse",
      session_id: "session-b",
      payload: {
        tool_input: {
          command: "pnpm test"
        },
        tool_result: {
          output: "1 failed, 10 passed"
        }
      },
      tool_name: "Bash",
      status: "failed"
    });

    expect(normalized.eventName).toBe("PostToolUse");
    expect(normalized.toolName).toBe("Bash");
    expect(normalized.toolInputSummary).toBe("pnpm test");
    expect(normalized.toolOutputSummary).toBe("1 failed, 10 passed");
    expect(normalized.toolStatus).toBe("failure");
  });
});
