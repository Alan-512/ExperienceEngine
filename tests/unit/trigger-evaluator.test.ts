import { describe, expect, it } from "vitest";
import { evaluateTrigger, evaluateTriggerRoute } from "../../src/controller/trigger-evaluator.js";
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
  const lowFailureStats: ScopeTaskStats = {
    scope_id: "scope_1",
    task_type: "bug_fix",
    total_tasks: 10,
    success_tasks: 9,
    failed_tasks: 1,
    unknown_tasks: 0,
    injected_tasks: 0,
    injected_success_tasks: 0,
    updated_at: new Date().toISOString()
  };

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

  it("uses context_summary when deciding whether a known expectation-correction pattern overlaps enough", () => {
    expect(
      evaluateTrigger(
        {
          ...baseInput,
          task_type: "config_debug",
          task_summary:
            "Correction: a previous pass focused too much on UI aliases. In exactly one sentence, say the real issue is runtime config resolution and persisted settings precedence.",
          context_summary:
            "Previous assistant summary: The real issue is runtime config resolution and persisted settings precedence."
        },
        undefined,
        "Focusing on UI/presentation layer instead of backend configuration logic.\nState the issue as runtime config resolution and persisted settings precedence.\nAgent focuses on UI labels, aliases, or cosmetic symptoms during configuration troubleshooting.",
        0.4
      )
    ).toBe(true);
  });

  it("allows a strong mature candidate even when lexical overlap is below the old threshold", () => {
    expect(
      evaluateTrigger(baseInput, lowFailureStats, {
        knownRiskSummary: "Fix the failing payments auth test in ExperienceEngine",
        candidateQuality: {
          semanticScore: 0.81,
          totalScore: 0.93,
          familyScore: 1,
          scopeMatch: true,
          taskFamilyMatch: true,
          state: "active",
          helpedCount: 9,
          harmedCount: 0,
          validationState: "validated_by_reuse",
          scoreMargin: 0.28
        }
      })
    ).toBe(true);
  });

  it("routes close same-family active candidates through conservative injection instead of skipping", () => {
    expect(
      evaluateTriggerRoute(baseInput, lowFailureStats, {
        knownRiskSummary: "Fix the failing payments auth test in ExperienceEngine",
        candidateQuality: {
          semanticScore: 0.62,
          totalScore: 0.72,
          familyScore: 1,
          scopeMatch: true,
          taskFamilyMatch: true,
          state: "active",
          helpedCount: 1,
          harmedCount: 0,
          validationState: "pending_reuse_validation",
          scoreMargin: 0.03
        }
      })
    ).toEqual({
      decision: "inject_conservative",
      reason: "ambiguous_same_family_candidate"
    });
  });

  it("does not skip a promising same-family candidate only because overlap wording is weak", () => {
    expect(
      evaluateTriggerRoute(
        {
          ...baseInput,
          task_type: "bug_fix",
          task_summary: "Audit the migration path and inspect the first likely schema-order issue"
        },
        lowFailureStats,
        {
          knownRiskSummary: "Repair the broken sqlite ledger migration in ExperienceEngine",
          candidateQuality: {
            semanticScore: 0.79,
            totalScore: 0.84,
            familyScore: 1,
            scopeMatch: true,
            taskFamilyMatch: true,
            state: "active",
            helpedCount: 1,
            harmedCount: 0,
            validationState: "pending_reuse_validation",
            scoreMargin: 0.11
          }
        }
      )
    ).toEqual({
      decision: "inject_conservative",
      reason: "promising_candidate_quality"
    });
  });
});
