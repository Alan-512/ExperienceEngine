import { describe, expect, it } from "vitest";
import {
  applyInjectionToPayload,
  extractSessionKey,
  normalizePromptPayload,
  normalizeToolPayload
} from "../../src/plugin/runtime-helpers.js";

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
      toolName: "pnpm test",
      exitCode: 1,
      errorSignature: "Assertion failed",
      status: "failure"
    });
  });

  it("prepends injected context onto mutable payloads", () => {
    const payload: Record<string, unknown> = { prependContext: "Existing context" };
    applyInjectionToPayload(payload, "New hints");
    expect(payload.prependContext).toBe("New hints\n\nExisting context");
  });
});
