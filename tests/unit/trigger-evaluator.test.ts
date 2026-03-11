import { describe, expect, it } from "vitest";
import { evaluateTrigger } from "../../src/controller/trigger-evaluator.js";
import type { ExperienceInput, ScopeTaskStats } from "../../src/types/domain.js";

const baseInput: ExperienceInput = {
  scope_id: "scope_1",
  task_type: "bug_fix",
  task_summary: "Fix repeated sqlite migration failure",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: []
};

describe("evaluateTrigger", () => {
  it("fires when failure rate is high", () => {
    const stats: ScopeTaskStats = {
      scope_id: "scope_1",
      task_type: "bug_fix",
      total_tasks: 10,
      success_tasks: 2,
      failed_tasks: 8,
      unknown_tasks: 0,
      injected_tasks: 0,
      injected_success_tasks: 0,
      updated_at: new Date().toISOString()
    };

    expect(evaluateTrigger(baseInput, stats)).toBe(true);
  });

  it("skips unknown tasks", () => {
    expect(evaluateTrigger({ ...baseInput, task_type: "unknown" })).toBe(false);
  });
});

