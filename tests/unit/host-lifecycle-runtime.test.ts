import { describe, expect, it, vi } from "vitest";
import { HostLifecycleRuntime } from "../../src/runtime/host-lifecycle-runtime.js";
import { RuntimeSessionStore } from "../../src/runtime/session-runtime.js";
import type { HygieneGovernanceRuntime } from "../../src/runtime/hygiene-governance-runtime.js";
import type { PromptDecisionPipeline } from "../../src/runtime/prompt-decision-pipeline.js";
import type { TraceCaptureService } from "../../src/runtime/trace-capture-service.js";

describe("HostLifecycleRuntime", () => {
  it("captures prompt events and queues governance for host lifecycle signals", async () => {
    const sessions = new RuntimeSessionStore();
    const traceCapture = {
      capturePromptEvent: vi.fn()
    } as unknown as TraceCaptureService;
    const hygieneGovernance = {
      queue: vi.fn(() => ({ status: "queued", scopeId: "scope-a" }))
    } as unknown as HygieneGovernanceRuntime;
    const runtime = new HostLifecycleRuntime({
      sessions,
      traceCapture,
      hygieneGovernance,
      promptDecisionPipeline: {
        beforePromptBuild: vi.fn()
      } as unknown as PromptDecisionPipeline
    });

    const result = await runtime.signalHostEvent(
      {
        host: "codex",
        sessionId: "session-a",
        cwd: "/repo",
        userMessage: "Fix the failing test"
      },
      "host_startup"
    );

    const session = sessions.get("session-a");
    expect(result).toEqual({ status: "queued", scopeId: "scope-a" });
    expect(traceCapture.capturePromptEvent).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ sessionId: "session-a" }),
      "Fix the failing test"
    );
    expect(hygieneGovernance.queue).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-a" }),
      "host_startup"
    );
  });

  it("merges session context before delegating prompt decisions", async () => {
    const sessions = new RuntimeSessionStore();
    const traceCapture = {
      capturePromptEvent: vi.fn()
    } as unknown as TraceCaptureService;
    const hygieneGovernance = {
      queue: vi.fn(() => ({ status: "queued" }))
    } as unknown as HygieneGovernanceRuntime;
    const promptDecisionPipeline = {
      beforePromptBuild: vi.fn(async (_context, sessionId, session) => ({
        mode: "skip" as const,
        sessionId,
        mergedUserMessage: session.context?.userMessage
      }))
    } as unknown as PromptDecisionPipeline;
    const runtime = new HostLifecycleRuntime({
      sessions,
      traceCapture,
      hygieneGovernance,
      promptDecisionPipeline
    });

    sessions.mergeContext("session-a", {
      host: "codex",
      sessionId: "session-a",
      cwd: "/repo",
      userMessage: "Keep the existing user message"
    });

    const result = await runtime.beforePromptBuild({
      host: "codex",
      sessionId: "session-a",
      cwd: "/repo",
      userMessage: "",
      contextSummary: "Updated context"
    });

    expect(result).toEqual({
      mode: "skip",
      sessionId: "session-a",
      mergedUserMessage: "Keep the existing user message"
    });
    expect(traceCapture.capturePromptEvent).toHaveBeenCalledWith(
      sessions.get("session-a"),
      expect.objectContaining({ sessionId: "session-a" }),
      ""
    );
    expect(hygieneGovernance.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-a",
        userMessage: "Keep the existing user message",
        contextSummary: "Updated context"
      }),
      "prompt_lookup"
    );
    expect(promptDecisionPipeline.beforePromptBuild).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-a" }),
      "session-a",
      sessions.get("session-a")
    );
  });
});
