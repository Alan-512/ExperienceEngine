import { describe, expect, it } from "vitest";
import { buildRetrievalContext } from "../../src/controller/retrieval-context.js";
import type { ExperienceInput, ToolEvent } from "../../src/types/domain.js";

const toolEvent = (overrides: Partial<ToolEvent> = {}): ToolEvent => ({
  event_id: "event_1",
  tool_name: "exec",
  input_summary: "inspect src/runtime/service.ts",
  output_summary: "Auth assertion failed in src/runtime/service.ts",
  status: "failure",
  error_signature: "auth assertion failed",
  started_at: "2026-04-03T00:00:00.000Z",
  ended_at: "2026-04-03T00:00:01.000Z",
  ...overrides
});

const input = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_repo",
  task_type: "test_debug",
  task_summary: "Investigate the failing auth test in read-only mode.",
  tool_events: [],
  outcome_signal: "unknown",
  context_summary: "Read-only analysis only. Inspect src/runtime/service.ts before changing anything.",
  injected_node_ids: [],
  ...overrides
});

describe("buildRetrievalContext", () => {
  it("builds the v2.0 minimum retrieval contract from experience input and host context", () => {
    const context = buildRetrievalContext(
      input({
        tool_events: [toolEvent(), toolEvent({ event_id: "event_2", tool_name: "grep", output_summary: "grep reproduced the auth failure" })],
        outcome_signal: "failure"
      }),
      {
        host: "codex",
        cwd: "/repo",
        sessionId: "session_1",
        userMessage: "Investigate the failing auth test in read-only mode."
      }
    );

    expect(context).toMatchObject({
      scopeId: "scope_repo",
      host: "codex",
      taskType: "test_debug",
      taskSummary: "Investigate the failing auth test in read-only mode.",
      contextSummary: "Read-only analysis only. Inspect src/runtime/service.ts before changing anything.",
      toolNames: ["exec", "grep"],
      failureSignature: expect.any(String),
      outcomeSignal: "failure",
      injectedNodeIds: []
    });
  });

  it("keeps opportunistic evidence empty when prompt-time retrieval has no tool events yet", () => {
    const context = buildRetrievalContext(
      input({
        task_summary: "Fix the failing auth test in the current workspace.",
        context_summary: undefined,
        tool_events: []
      }),
      {
        host: "openclaw",
        cwd: "/repo",
        userMessage: "Fix the failing auth test in the current workspace."
      }
    );

    expect(context.toolNames).toEqual([]);
    expect(context.failureSignature).toBeUndefined();
    expect(context.modulePaths).toBeUndefined();
    expect(context.isReadOnly).toBeUndefined();
  });

  it("treats read-only, module-path, and correction-intent fields as optional soft signals", () => {
    const context = buildRetrievalContext(
      input({
        task_summary: "Correction: the previous pass fixed the wrong layer. Re-check src/runtime/service.ts in read-only mode.",
        context_summary: "The real issue is provider routing instead of the UI layer.",
        tool_events: [toolEvent({ status: "success", error_signature: undefined })]
      }),
      {
        host: "codex",
        cwd: "/repo",
        userMessage: "Correction: the previous pass fixed the wrong layer. Re-check src/runtime/service.ts in read-only mode."
      }
    );

    expect(context.isReadOnly).toBe(true);
    expect(context.modulePaths).toContain("src/runtime/service.ts");
    expect(context.expectationCorrectionIntent).toBe(true);
  });
});
