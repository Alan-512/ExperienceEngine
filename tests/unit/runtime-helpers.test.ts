import { describe, expect, it } from "vitest";
import {
  applyInjectionToPayload,
  extractToolResultsFromPayload,
  extractSessionKey,
  mergeHookPayload,
  normalizePromptPayload,
  normalizeToolPayload
} from "../../src/plugin/runtime-helpers.js";
import { replayScenarios } from "../fixtures/openclaw/index.js";

describe("runtime helpers", () => {
  it("normalizes prompt payloads from nested OpenClaw-like context", () => {
    const payload = {
      session: { key: "sess_1" },
      workspace: { cwd: "/repo/app" },
      message: { content: "Fix the failing test" },
      context: { summary: "Recent failures in auth integration." }
    };

    expect(normalizePromptPayload(payload)).toEqual({
      sessionId: "sess_1",
      cwd: "/repo/app",
      userMessage: "Fix the failing test",
      taskSummary: "Fix the failing test",
      contextSummary: "Recent failures in auth integration."
    });
  });

  it("normalizes tool persistence payloads", () => {
    const payload = {
      sessionKey: "sess_2",
      tool: { name: "pnpm test", args: ["--filter", "auth"] },
      result: { exitCode: 1, error: "Assertion failed" },
      success: false
    };

    expect(extractSessionKey(payload)).toBe("sess_2");
    expect(normalizeToolPayload(payload)).toMatchObject({
      sessionId: "sess_2",
      toolName: "pnpm test",
      exitCode: 1,
      errorSignature: "Assertion failed",
      status: "failure"
    });
  });

  it("normalizes real tool_result payloads and recovers tool messages from finalize payloads", () => {
    const toolPersistPayload = {
      toolName: "exec",
      toolCallId: "call_123",
      message: {
        role: "toolResult",
        toolCallId: "call_123",
        toolName: "exec",
        content: [{ type: "text", text: "/repo/runtime" }],
        details: {
          status: "completed",
          exitCode: 0,
          aggregated: "/repo/runtime"
        },
        isError: false
      }
    };

    expect(normalizeToolPayload(toolPersistPayload)).toMatchObject({
      sessionId: "global",
      toolCallId: "call_123",
      toolName: "exec",
      outputSummary: "/repo/runtime",
      exitCode: 0,
      status: "success"
    });

    expect(
      extractToolResultsFromPayload({
        messages: [toolPersistPayload.message]
      })
    ).toMatchObject([
      {
        toolCallId: "call_123",
        toolName: "exec",
        outputSummary: "/repo/runtime",
        exitCode: 0,
        status: "success"
      }
    ]);
  });

  it("merges hook payload with hook context and reads content block arrays", () => {
    const merged = mergeHookPayload(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Fix the runtime payload parser" }]
          }
        ]
      },
      {
        sessionKey: "sess_ctx",
        workspaceDir: "/repo/runtime"
      }
    );

    expect(extractSessionKey(merged)).toBe("sess_ctx");
    expect(normalizePromptPayload(merged)).toEqual({
      sessionId: "sess_ctx",
      cwd: "/repo/runtime",
      userMessage: "Fix the runtime payload parser",
      taskSummary: "Fix the runtime payload parser",
      contextSummary: undefined
    });
  });

  it("prepends injected context onto mutable payloads", () => {
    const payload: Record<string, unknown> = { prependContext: "Existing context" };
    applyInjectionToPayload(payload, "New hints");
    expect(payload.prependContext).toBe("New hints\n\nExisting context");
  });

  it("normalizes every fixture corpus payload into a usable prompt context", () => {
    for (const scenario of replayScenarios) {
      const prompt = normalizePromptPayload(scenario.seedPrompt);
      const tool = normalizeToolPayload(scenario.toolResult);

      expect(prompt.userMessage, scenario.name).not.toBe("");
      expect(prompt.sessionId, scenario.name).toBeTruthy();
      expect(tool, scenario.name).not.toBeNull();
      expect(tool?.toolName, scenario.name).toBeTruthy();
    }
  });
});
