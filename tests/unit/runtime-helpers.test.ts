import { describe, expect, it } from "vitest";
import {
  applyInjectionToPayload,
  extractToolResultsFromPayload,
  extractSessionKey,
  mergeHookPayload,
  normalizePromptPayload,
  normalizeToolPayload
} from "../../src/plugin/runtime-helpers.js";
import { buildExperienceInput } from "../../src/input/input-adapter.js";
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

  it("derives context summary from prior OpenClaw session messages when explicit summary is absent", () => {
    const payload = {
      context: {
        sessionId: "sess_hist",
        workspaceDir: "/repo/runtime"
      },
      payload: {
        prompt:
          "[Sat 2026-03-21 21:31 GMT+8] Correction: that is the wrong boundary. Verify the user-facing Gemini model selection flow.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "[Sat 2026-03-21 21:26 GMT+8] First inspect provider implementation files directly and summarize where Gemini model ids are resolved."
              }
            ]
          },
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "ignored" },
              {
                type: "text",
                text: "I'll start by exploring provider implementation files."
              }
            ]
          },
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Gemini model IDs are resolved in host-llm.ts and the gemini provider adapter."
              }
            ]
          }
        ]
      }
    };

    expect(normalizePromptPayload(payload)).toEqual({
      sessionId: "sess_hist",
      cwd: "/repo/runtime",
      userMessage:
        "[Sat 2026-03-21 21:31 GMT+8] Correction: that is the wrong boundary. Verify the user-facing Gemini model selection flow.",
      taskSummary:
        "[Sat 2026-03-21 21:31 GMT+8] Correction: that is the wrong boundary. Verify the user-facing Gemini model selection flow.",
      contextSummary:
        "Previous user request: [Sat 2026-03-21 21:26 GMT+8] First inspect provider implementation files directly and summarize where Gemini model ids are resolved.\nPrevious assistant summary: Gemini model IDs are resolved in host-llm.ts and the gemini provider adapter."
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

  it("strips host timestamp prefixes before building experience input", () => {
    const input = buildExperienceInput({
      sessionId: "sess_ts",
      cwd: "/repo/runtime",
      userMessage:
        "[Wed 2026-03-11 23:04 GMT+8] Fix the failing vitest auth test by checking the current workspace"
    });

    expect(input.task_summary).toBe("Fix the failing vitest auth test by checking the current workspace");
    expect(input.task_type).toBe("test_debug");
  });

  it("strips ExperienceEngine injection headings before building experience input", () => {
    const input = buildExperienceInput({
      sessionId: "sess_injected",
      cwd: "/repo/runtime",
      userMessage:
        "Execution hints from prior similar tasks:\n- Reproduce first, then validate the fix with exec before moving on.\n\n[Thu 2026-03-12 09:56 GMT+8] Fix the failing vitest auth test in the current workspace."
    });

    expect(input.task_summary).toBe("Fix the failing vitest auth test in the current workspace.");
    expect(input.task_type).toBe("test_debug");
  });

  it("strips expanded ExperienceEngine injection blocks before building experience input", () => {
    const input = buildExperienceInput({
      sessionId: "sess_expanded_injected",
      cwd: "/repo/runtime",
      userMessage:
        "Execution hints from prior similar tasks:\n- Validate the failing migration before changing unrelated schema code.\n  Goal: Narrow the failing migration before touching unrelated schema code.\n  Steps:\n    1. Run the focused migration once to reproduce the failure.\n    2. Inspect the failing SQL and compare it with the expected schema.\n  Avoid:\n    - Do not edit unrelated schema files before reproducing the failure.\n\n[Thu 2026-03-12 09:56 GMT+8] Fix the failing sqlite migration in the current workspace."
    });

    expect(input.task_summary).toBe("Fix the failing sqlite migration in the current workspace.");
    expect(input.task_type).toBe("integration_fix");
  });

  it("keeps investigation-style regression prompts in unknown outcome until real failures occur", () => {
    const input = buildExperienceInput({
      sessionId: "sess_investigate_regression",
      cwd: "/repo/runtime",
      userMessage:
        "Investigate the payments auth test regression in this workspace, starting from the auth fixture handshake. Read-only analysis only; do not modify files."
    });

    expect(input.task_summary).toBe(
      "Investigate the payments auth test regression in this workspace, starting from the auth fixture handshake. Read-only analysis only; do not modify files."
    );
    expect(input.task_type).toBe("test_debug");
    expect(input.outcome_signal).toBe("unknown");
  });
});
