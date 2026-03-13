import { describe, expect, it } from "vitest";
import { renderInlineNotice } from "../../src/controller/inline-notice.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_1",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing auth test",
  applicability_notes: undefined,
  env_signature: undefined,
  compact_hint: "Run the failing test first.",
  goal: "Stabilize the auth test",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "The targeted test passes",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "Previously solved the same auth test failure.",
  source_kind: "system_derived",
  state: "candidate",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-03-12T00:00:00.000Z",
  updated_at: "2026-03-12T00:00:00.000Z",
  ...overrides
});

describe("renderInlineNotice", () => {
  it("renders a strategy notice for injected strategy nodes", () => {
    expect(renderInlineNotice([makeNode()])).toBe(
      "[ExperienceEngine] Injected 1 strategy hint for this task."
    );
  });

  it("renders a caution notice when all injected nodes are warnings", () => {
    expect(
      renderInlineNotice([
        makeNode({
          id: "node_warning",
          node_type: "warning"
        })
      ])
    ).toBe("[ExperienceEngine] Injected 1 caution hint for this task.");
  });

  it("pluralizes multi-node notices", () => {
    expect(
      renderInlineNotice([
        makeNode(),
        makeNode({
          id: "node_2"
        })
      ])
    ).toBe("[ExperienceEngine] Injected 2 strategy hints for this task.");
  });
});
