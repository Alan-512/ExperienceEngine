import { describe, expect, it } from "vitest";
import { decideIntervention, selectInjectableNodes } from "../../src/controller/intervention-controller.js";
import type { ExperienceInput, ExperienceNode, ScopeTaskStats } from "../../src/types/domain.js";

const node = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_default",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing vitest auth test in the current workspace",
  compact_hint: "Reproduce first, then validate the fix with exec before moving on.",
  success_signal: "Verification tool output confirms the issue is resolved.",
  evidence_summary: "Captured from a successful injected turn.",
  retrieval_text: "Fix the failing vitest auth test in the current workspace\nReproduce first, then validate the fix with exec before moving on.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

const input: ExperienceInput = {
  scope_id: "scope_1",
  task_type: "test_debug",
  task_summary: "Fix the failing vitest auth test in the current workspace",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: []
};

const stats: ScopeTaskStats = {
  scope_id: "scope_1",
  task_type: "test_debug",
  total_tasks: 1,
  success_tasks: 1,
  failed_tasks: 0,
  unknown_tasks: 0,
  injected_tasks: 0,
  injected_success_tasks: 0,
  updated_at: new Date().toISOString()
};

describe("selectInjectableNodes", () => {
  it("prefers strategy nodes over warning nodes", () => {
    const selected = selectInjectableNodes(
      [
        node({ id: "warning", node_type: "warning", compact_hint: "Do not keep iterating blindly." }),
        node({ id: "strategy", node_type: "strategy" })
      ],
      3
    );

    expect(selected.map((entry) => entry.id)).toEqual(["strategy"]);
  });

  it("falls back to warning nodes when no strategy node exists", () => {
    const selected = selectInjectableNodes(
      [node({ id: "warning", node_type: "warning", compact_hint: "Narrow the failure signature first." })],
      3
    );

    expect(selected.map((entry) => entry.id)).toEqual(["warning"]);
  });
});

describe("decideIntervention", () => {
  it("injects only strategy nodes when both types are available", () => {
    const decision = decideIntervention(
      input,
      [
        node({ id: "strategy", node_type: "strategy", helped_count: 2 }),
        node({ id: "warning", node_type: "warning", compact_hint: "Do not keep iterating blindly." })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["strategy"]);
    expect(decision.text).toContain("Execution hints");
    expect(decision.text).not.toContain("Do not keep iterating blindly.");
  });

  it("uses the selected strategy trigger instead of a higher-ranked warning trigger", () => {
    const decision = decideIntervention(
      input,
      [
        node({
          id: "warning",
          node_type: "warning",
          trigger_pattern: "Execution hints from prior similar tasks: search around config drift first.",
          compact_hint: "Do not keep iterating blindly.",
          helped_count: 8,
          support_count: 8
        }),
        node({
          id: "strategy",
          node_type: "strategy",
          trigger_pattern: "Fix the failing vitest auth test in the current workspace",
          helped_count: 2,
          support_count: 2
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["strategy"]);
    expect(decision.text).toContain("Reproduce first, then validate the fix with exec before moving on.");
  });

  it("injects warning nodes when they are the only available guidance", () => {
    const decision = decideIntervention(
      input,
      [node({ id: "warning", node_type: "warning", compact_hint: "Narrow the failure signature first." })],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["warning"]);
    expect(decision.text).toContain("Narrow the failure signature first.");
  });
});
