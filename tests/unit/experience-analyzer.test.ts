import { describe, expect, it } from "vitest";

import { analyzeExperience } from "../../src/analyzer/experience-analyzer.js";
import type { ExperienceInput } from "../../src/types/domain.js";

const baseInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope-1",
  task_type: "test_debug",
  task_summary: "Fix the failing auth vitest in the workspace.",
  tool_events: [
    {
      event_id: "tool-0",
      tool_name: "vitest",
      status: "failure",
      error_signature: "Auth spec assertion failed.",
      output_summary: "Auth spec failed.",
      started_at: "2026-03-13T08:59:00.000Z"
    },
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
            event_id: "tool-test-fail",
            tool_name: "vitest",
            status: "failure",
            error_signature: "Auth spec assertion failed.",
            output_summary: "Auth spec failed.",
            started_at: "2026-03-13T08:59:00.000Z"
          },
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
            event_id: "tool-build-fail",
            tool_name: "tsc",
            status: "failure",
            error_signature: "Cannot find module './auth/types'.",
            output_summary: "Build failed with TS2307.",
            started_at: "2026-03-13T08:59:00.000Z"
          },
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
            event_id: "tool-correction",
            tool_name: "apply_patch",
            status: "success",
            output_summary: "Applied patch to adjust auth flow.",
            started_at: "2026-03-13T08:58:00.000Z"
          },
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
            event_id: "tool-correction",
            tool_name: "apply_patch",
            status: "success",
            output_summary: "Applied patch to adjust imports.",
            started_at: "2026-03-13T08:58:00.000Z"
          },
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
            event_id: "tool-general-fail",
            tool_name: "markdownlint",
            status: "failure",
            output_summary: "Documentation lint failed.",
            started_at: "2026-03-13T08:59:00.000Z"
          },
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

  it("produces config_debug strategy candidates for successful provider troubleshooting", () => {
    const result = analyzeExperience(
      baseInput({
        task_type: "config_debug",
        task_summary: "Find a working OpenRouter free model configuration for EE distillation.",
        tool_events: [
          {
            event_id: "tool-doctor",
            tool_name: "doctor",
            status: "failure",
            error_signature: "OpenRouter model routing failed.",
            output_summary: "doctor reported a provider/model routing mismatch.",
            started_at: "2026-03-20T09:00:00.000Z"
          },
          {
            event_id: "tool-distill",
            tool_name: "openrouter",
            status: "success",
            output_summary: "The OpenRouter free model completed distillation successfully.",
            started_at: "2026-03-20T09:02:00.000Z"
          }
        ]
      })
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.task_type).toBe("config_debug");
    expect(result.accepted[0]?.compact_hint).toContain("provider/config path");
    expect(result.accepted[0]?.compact_hint).toContain("routing or credential mismatch");
  });

  it("produces config_debug warning candidates for repeated provider failures", () => {
    const result = analyzeExperience(
      baseInput({
        task_type: "config_debug",
        task_summary: "Investigate why the Gemini provider API key and endpoint configuration fails.",
        outcome_signal: "failure",
        tool_events: [
          {
            event_id: "tool-config",
            tool_name: "doctor",
            status: "failure",
            error_signature: "401 invalid api key",
            output_summary: "doctor still reports an invalid API key.",
            started_at: "2026-03-20T10:00:00.000Z"
          }
        ]
      })
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.task_type).toBe("config_debug");
    expect(result.accepted[0]?.compact_hint).toContain("provider/config path");
    expect(result.accepted[0]?.compact_hint).toContain("routing, credential, or endpoint mismatch");
  });
});
