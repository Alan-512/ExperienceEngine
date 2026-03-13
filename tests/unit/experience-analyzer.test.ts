import { describe, expect, it } from "vitest";

import { analyzeExperience } from "../../src/analyzer/experience-analyzer.js";
import type { ExperienceInput } from "../../src/types/domain.js";

const baseInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope-1",
  task_type: "test_debug",
  task_summary: "Fix the failing auth vitest in the workspace.",
  tool_events: [
    {
      event_id: "tool-1",
      tool_name: "vitest",
      status: "success",
      output_summary: "Auth spec now passes.",
      started_at: "2026-03-13T09:00:00.000Z"
    }
  ],
  outcome_signal: "success",
  injected_node_ids: [],
  ...overrides
});

describe("analyzeExperience", () => {
  it("produces differentiated strategy candidates from distinct successful evidence", () => {
    const testResult = analyzeExperience(
      baseInput({
        task_type: "test_debug",
        task_summary: "Fix the failing auth vitest in the workspace.",
        tool_events: [
          {
            event_id: "tool-test",
            tool_name: "vitest",
            status: "success",
            output_summary: "Auth spec now passes.",
            started_at: "2026-03-13T09:00:00.000Z"
          }
        ]
      })
    );

    const buildResult = analyzeExperience(
      baseInput({
        task_type: "build_debug",
        task_summary: "Fix the broken TypeScript build for the API package.",
        tool_events: [
          {
            event_id: "tool-build",
            tool_name: "tsc",
            status: "success",
            output_summary: "TypeScript build completed without errors.",
            started_at: "2026-03-13T09:00:00.000Z"
          }
        ]
      })
    );

    expect(testResult.accepted).toHaveLength(1);
    expect(buildResult.accepted).toHaveLength(1);
    expect(testResult.accepted[0]?.compact_hint).not.toBe(buildResult.accepted[0]?.compact_hint);
    expect(testResult.accepted[0]?.compact_hint).toContain("vitest");
    expect(buildResult.accepted[0]?.compact_hint).toContain("tsc");
    expect(testResult.accepted[0]?.evidence_summary).toContain("vitest passed");
    expect(buildResult.accepted[0]?.evidence_summary).toContain("tsc passed");
  });

  it("produces differentiated warning candidates from terminal failure evidence", () => {
    const repeatedTestFailure = analyzeExperience(
      baseInput({
        task_type: "test_debug",
        outcome_signal: "failure",
        tool_events: [
          {
            event_id: "tool-test-fail",
            tool_name: "vitest",
            status: "failure",
            error_signature: "Expected isAuthenticated to be true.",
            output_summary: "1 failed spec remains.",
            started_at: "2026-03-13T09:00:00.000Z"
          }
        ]
      })
    );

    const repeatedBuildFailure = analyzeExperience(
      baseInput({
        task_type: "build_debug",
        task_summary: "Fix the broken API package build.",
        outcome_signal: "failure",
        tool_events: [
          {
            event_id: "tool-build-fail",
            tool_name: "tsc",
            status: "failure",
            error_signature: "Cannot find module './auth/types'.",
            output_summary: "Build failed with TS2307.",
            started_at: "2026-03-13T09:00:00.000Z"
          }
        ]
      })
    );

    expect(repeatedTestFailure.accepted).toHaveLength(1);
    expect(repeatedBuildFailure.accepted).toHaveLength(1);
    expect(repeatedTestFailure.accepted[0]?.compact_hint).not.toBe(repeatedBuildFailure.accepted[0]?.compact_hint);
    expect(repeatedTestFailure.accepted[0]?.compact_hint).toContain("vitest");
    expect(repeatedBuildFailure.accepted[0]?.compact_hint).toContain("tsc");
    expect(repeatedTestFailure.accepted[0]?.evidence_summary).toContain("Expected isAuthenticated");
    expect(repeatedBuildFailure.accepted[0]?.evidence_summary).toContain("Cannot find module");
  });

  it("keeps unmatched coding work in the general family with conservative extraction", () => {
    const result = analyzeExperience(
      baseInput({
        task_type: "general",
        task_summary: "Document the new release process for contributors.",
        tool_events: [
          {
            event_id: "tool-general",
            tool_name: "markdownlint",
            status: "success",
            output_summary: "Documentation lint passed.",
            started_at: "2026-03-13T09:00:00.000Z"
          }
        ]
      })
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.task_type).toBe("general");
    expect(result.accepted[0]?.compact_hint).toContain("coding task");
  });
});
