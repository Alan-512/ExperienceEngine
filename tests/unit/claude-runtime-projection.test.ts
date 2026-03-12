import { describe, expect, it } from "vitest";
import {
  ClaudeSessionProjectionState,
  toClaudePromptContext,
  toClaudeToolResult
} from "../../src/adapters/claude-code/runtime-projection.js";
import type { ClaudeNormalizedEvent } from "../../src/adapters/claude-code/hook-normalizer.js";

const baseEvent = (eventName: string): ClaudeNormalizedEvent => ({
  adapter: "claude-code",
  capturedAt: "2026-03-12T00:00:00.000Z",
  eventName
});

describe("Claude runtime projection", () => {
  it("projects prompt events into HostPromptContext", () => {
    const context = toClaudePromptContext({
      ...baseEvent("UserPromptSubmit"),
      sessionId: "session-a",
      cwd: "/repo",
      promptText: "Fix the failing test"
    });

    expect(context).toEqual({
      sessionId: "session-a",
      cwd: "/repo",
      userMessage: "Fix the failing test",
      taskSummary: "Fix the failing test"
    });
  });

  it("projects post-tool events into HostToolResult", () => {
    const toolResult = toClaudeToolResult({
      ...baseEvent("PostToolUse"),
      sessionId: "session-b",
      toolName: "Bash",
      toolInputSummary: "pnpm test",
      toolOutputSummary: "1 failed",
      toolStatus: "failure"
    });

    expect(toolResult).toEqual({
      sessionId: "session-b",
      toolName: "Bash",
      inputSummary: "pnpm test",
      outputSummary: "1 failed",
      status: "failure"
    });
  });

  it("projects post-tool failure events into HostToolResult", () => {
    const toolResult = toClaudeToolResult({
      ...baseEvent("PostToolUseFailure"),
      sessionId: "session-failure",
      toolName: "Bash",
      toolInputSummary: "./auth-test.sh",
      toolOutputSummary: "auth test failing",
      toolStatus: "failure"
    });

    expect(toolResult).toEqual({
      sessionId: "session-failure",
      toolName: "Bash",
      inputSummary: "./auth-test.sh",
      outputSummary: "auth test failing",
      status: "failure"
    });
  });

  it("resolves session end back to the latest prompt context", () => {
    const state = new ClaudeSessionProjectionState();
    const promptContext = toClaudePromptContext({
      ...baseEvent("UserPromptSubmit"),
      sessionId: "session-c",
      cwd: "/repo",
      promptText: "Refactor auth test setup"
    });

    state.rememberPrompt(promptContext);

    expect(
      state.resolveFinalizeContext({
        ...baseEvent("SessionEnd"),
        sessionId: "session-c"
      })
    ).toEqual(promptContext);

    state.clearSession("session-c");
    expect(
      state.resolveFinalizeContext({
        ...baseEvent("SessionEnd"),
        sessionId: "session-c"
      })
    ).toBeNull();
  });
});
