import { describe, expect, it, vi } from "vitest";
import type { RuntimeSessionState } from "../../src/runtime/session-runtime.js";
import { ToolResultRuntime } from "../../src/runtime/tool-result-runtime.js";
import type { ToolEventRecoveryRuntime } from "../../src/runtime/tool-event-recovery-runtime.js";
import type { TraceCaptureService } from "../../src/runtime/trace-capture-service.js";

describe("ToolResultRuntime", () => {
  it("normalizes, captures trace evidence, records recovery state, and logs telemetry", () => {
    const session: RuntimeSessionState = {
      context: {
        host: "codex",
        sessionId: "session-a",
        cwd: "/repo",
        userMessage: "Fix the failing test"
      },
      toolEvents: [],
      toolEventKeys: new Set<string>(),
      injectedNodeIds: [],
      traceEvents: []
    };
    const traceCapture = {
      captureToolResultEvents: vi.fn()
    } as unknown as TraceCaptureService;
    const toolEventRecovery = {
      recordPersistedToolResult: vi.fn()
    } as unknown as ToolEventRecoveryRuntime<RuntimeSessionState>;
    const logger = {
      debug: vi.fn()
    };
    const runtime = new ToolResultRuntime({
      getSession: vi.fn(() => session),
      traceCapture,
      toolEventRecovery,
      logger
    });

    const normalized = runtime.persist({
      sessionId: "session-a",
      toolName: "vitest",
      inputSummary: "pnpm vitest run tests/unit/foo.test.ts",
      outputSummary: "1 failed",
      errorSignature: "expected true to be false",
      status: "failure",
      exitCode: 1,
      toolCallId: "call-1"
    });

    expect(normalized).toMatchObject({
      tool_name: "vitest",
      status: "failure",
      exit_code: 1,
      error_signature: "expected true to be false"
    });
    expect(traceCapture.captureToolResultEvents).toHaveBeenCalledWith({
      sessionId: "session-a",
      session,
      context: session.context,
      result: expect.objectContaining({ toolName: "vitest", toolCallId: "call-1" })
    });
    expect(toolEventRecovery.recordPersistedToolResult).toHaveBeenCalledWith({
      sessionId: "session-a",
      result: expect.objectContaining({ toolName: "vitest", toolCallId: "call-1" }),
      normalizedToolEvent: normalized
    });
    expect(logger.debug).toHaveBeenCalledWith("experienceengine.tool_result_persist", {
      sessionId: "session-a",
      toolName: "vitest",
      status: "failure",
      toolCallId: "call-1"
    });
  });

  it("uses a safe trace context when a global tool result has no prompt session context", () => {
    const session: RuntimeSessionState = {
      toolEvents: [],
      toolEventKeys: new Set<string>(),
      injectedNodeIds: [],
      traceEvents: []
    };
    const traceCapture = {
      captureToolResultEvents: vi.fn()
    } as unknown as TraceCaptureService;
    const runtime = new ToolResultRuntime({
      getSession: vi.fn(() => session),
      traceCapture,
      toolEventRecovery: {
        recordPersistedToolResult: vi.fn()
      } as unknown as ToolEventRecoveryRuntime<RuntimeSessionState>,
      logger: {}
    });

    runtime.persist({
      toolName: "shell",
      outputSummary: "ok",
      status: "success"
    });

    expect(traceCapture.captureToolResultEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "global",
        context: {
          host: undefined,
          sessionId: "global",
          userMessage: ""
        }
      })
    );
  });
});
