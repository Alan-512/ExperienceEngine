import { describe, expect, it } from "vitest";
import { detectHarm } from "../../src/feedback/harm-detector.js";
import type { ExperienceInput, ExperienceNode, ToolEvent } from "../../src/types/domain.js";

const toolEvent = (overrides: Partial<ToolEvent> = {}): ToolEvent => ({
  event_id: "tool_1",
  tool_name: "pnpm test",
  status: "failure",
  output_summary: "auth test failed",
  started_at: "2026-03-13T00:00:00.000Z",
  ...overrides
});

const input = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_1",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  tool_events: [toolEvent()],
  outcome_signal: "failure",
  injected_node_ids: ["node_1"],
  ...overrides
});

const node = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_1",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing auth test",
  compact_hint: "Run the failing auth test before editing and verify after the fix.",
  success_signal: "The auth test passes",
  evidence_summary: "Recovered the auth test before.",
  retrieval_text: "Fix the failing auth test\nRun the failing auth test before editing and verify after the fix.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-03-13T00:00:00.000Z",
  updated_at: "2026-03-13T00:00:00.000Z",
  ...overrides
});

describe("detectHarm", () => {
  it("ignores environmental failures", () => {
    expect(
      detectHarm(
        input({
          tool_events: [toolEvent({ error_signature: "ETIMEDOUT", output_summary: "network timeout" })]
        }),
        node()
      )
    ).toBe(false);
  });

  it("ignores exploratory-only failures", () => {
    expect(
      detectHarm(
        input({
          tool_events: [toolEvent({ tool_name: "grep", exit_code: 1, output_summary: "pattern not found" })]
        }),
        node()
      )
    ).toBe(false);
  });

  it("marks relevant terminal failures as harmed", () => {
    expect(
      detectHarm(
        input({
          tool_events: [toolEvent({ tool_name: "pnpm test", output_summary: "auth test failed again" })]
        }),
        node()
      )
    ).toBe(true);
  });
});
