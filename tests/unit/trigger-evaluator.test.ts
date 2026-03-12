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

  it("fires when a known similar candidate pattern strongly overlaps", () => {
    expect(
      evaluateTrigger(
        {
          ...baseInput,
          task_type: "test_debug",
          task_summary: "Fix the failing vitest auth test by checking the current workspace"
        },
        undefined,
        "Fix the failing vitest auth test. Start by checking the current workspace",
        0.6
      )
    ).toBe(true);
  });

  it("uses a slightly lower conservative threshold for known candidate overlap", () => {
    expect(
      evaluateTrigger(
        {
          ...baseInput,
          task_type: "test_debug",
          task_summary:
            "Fix the failing vitest auth test. Start by using the exec tool to run exactly this shell command in the current workspace: pwd. Then reply with only the absolute path returned by the tool and no other text. Do not answer from memory. Do not continue to the actual fix in this turn. If the tool is unavailable or fails, reply with TOOL_FAILED."
        },
        undefined,
        "Fix the failing vitest auth test. Start by using the exec tool to run exactly this shell command in the current workspace: pwd. Then reply with only t...",
        0.6
      )
    ).toBe(true);
  });

  it("fires when the current task summary is fully covered by a longer stored trigger pattern", () => {
    expect(
      evaluateTrigger(
        {
          ...baseInput,
          task_type: "test_debug",
          task_summary: "Fix the failing vitest auth test in the current workspace."
        },
        undefined,
        "[Wed 2026-03-11 22:09 GMT+8] Fix the failing vitest auth test. Start by using the exec tool to run exactly this shell command in the current workspace: pwd. Then reply with only t...",
        0.6
      )
    ).toBe(true);
  });
});
