import { describe, expect, it } from "vitest";
import { resolveOutcome } from "../../src/input/outcome-resolver.js";
import type { ToolEvent } from "../../src/types/domain.js";

const toolEvent = (overrides: Partial<ToolEvent>): ToolEvent => ({
  event_id: "tool_1",
  tool_name: "exec",
  status: "unknown",
  started_at: "2026-03-13T00:00:00.000Z",
  ...overrides
});

describe("resolveOutcome", () => {
  it("treats a later terminal success as the final outcome after exploratory failures", () => {
    const outcome = resolveOutcome([
      toolEvent({ tool_name: "grep", status: "failure", exit_code: 1, output_summary: "pattern not found" }),
      toolEvent({ tool_name: "pnpm test", status: "success", output_summary: "auth tests passed" })
    ]);

    expect(outcome).toBe("success");
  });

  it("returns unknown when only exploratory failures exist", () => {
    const outcome = resolveOutcome([
      toolEvent({ tool_name: "grep", status: "failure", exit_code: 1, output_summary: "pattern not found" })
    ]);

    expect(outcome).toBe("unknown");
  });

  it("returns failure when the last terminal evidence is a real failure", () => {
    const outcome = resolveOutcome([
      toolEvent({ tool_name: "pnpm test", status: "failure", exit_code: 1, output_summary: "1 failed" }),
      toolEvent({ tool_name: "grep", status: "success", output_summary: "matched line" })
    ]);

    expect(outcome).toBe("failure");
  });
});
