import { describe, expect, it, vi } from "vitest";
import { handleCodexHookPayload } from "../../src/cli/commands/codex-hook.js";

const behaviorLoop = () => ({
  lookupHints: vi.fn(async () => ({
    mode: "inject",
    text: "Reuse the established installer helper.",
    notice: "[ExperienceEngine] Injected guidance.",
    injectedNodeIds: ["node_1"]
  })),
  recordToolResult: vi.fn(async () => ({
    status: "recorded",
    toolName: "Bash",
    eventStatus: "success"
  })),
  finalizeTask: vi.fn(async () => ({
    status: "finalized",
    taskType: "integration_fix",
    outcomeSignal: "success",
    injectedNodeIds: ["node_1"],
    recordedToolEvents: 1
  }))
});

describe("Codex hook command", () => {
  it("returns Codex-valid additional context for UserPromptSubmit", async () => {
    const loop = behaviorLoop();
    const output = await handleCodexHookPayload(
      {
        hook_event_name: "UserPromptSubmit",
        turn_id: "turn_1",
        cwd: "/repo",
        prompt: "Fix the installer"
      },
      loop as never
    );

    expect(loop.lookupHints).toHaveBeenCalledWith({
      cwd: "/repo",
      prompt: "Fix the installer",
      sessionId: "turn_1"
    });
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "[ExperienceEngine] Injected guidance.\nExperienceEngine guidance:\nReuse the established installer helper."
      }
    });
  });

  it("records PostToolUse results without emitting unsupported plain text", async () => {
    const loop = behaviorLoop();
    const output = await handleCodexHookPayload(
      {
        hook_event_name: "PostToolUse",
        turn_id: "turn_1",
        tool_name: "Bash",
        tool_input: { command: "pnpm test" },
        tool_response: { exit_code: 0, stdout: "ok" }
      },
      loop as never
    );

    expect(output).toEqual({});
    expect(loop.recordToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "turn_1",
        toolName: "Bash",
        exitCode: 0,
        status: "success"
      })
    );
  });

  it("returns an empty JSON object for Stop after finalization", async () => {
    const loop = behaviorLoop();
    const output = await handleCodexHookPayload(
      {
        hook_event_name: "Stop",
        turn_id: "turn_1",
        cwd: "/repo",
        last_assistant_message: "Done"
      },
      loop as never
    );

    expect(output).toEqual({});
    expect(loop.finalizeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "turn_1",
        cwd: "/repo",
        contextSummary: "Done"
      })
    );
  });
});
