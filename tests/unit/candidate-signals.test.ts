import { describe, expect, it } from "vitest";
import { buildCandidateSignals } from "../../src/analyzer/candidate-signals.js";
import type { ExperienceInput } from "../../src/types/domain.js";

const makeInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_1",
  task_type: "config_debug",
  task_summary: "Repair the provider routing path.",
  context_summary: "Provider routing is unstable.",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: [],
  ...overrides
});

describe("buildCandidateSignals", () => {
  it("captures an explicit directional correction window with stronger follow-up evidence", () => {
    const signals = buildCandidateSignals(
      makeInput({
        outcome_signal: "success",
        context_summary:
          "The user corrected the direction: the fix belongs in provider routing instead of the UI layer. The final targeted provider probe succeeded after moving the change.",
        tool_events: [
          {
            event_id: "evt_feedback",
            tool_name: "user-feedback",
            status: "success",
            output_summary: "The user said the problem is in provider routing, not in the UI layer.",
            started_at: "2026-03-29T09:58:00.000Z"
          },
          {
            event_id: "evt_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary: "The targeted provider probe succeeded after moving the fix into provider routing.",
            started_at: "2026-03-29T10:02:00.000Z"
          }
        ]
      })
    );

    expect(signals.directional_correction).toMatchObject({
      detected: true,
      objective_support: true,
      user_confirmation: false
    });
    expect(signals.directional_correction?.sources).toContain("context_summary");
    expect(signals.directional_correction?.sources).toContain("tool_event:user-feedback");
  });

  it("does not mark directional correction when only verification evidence is present", () => {
    const signals = buildCandidateSignals(
      makeInput({
        task_type: "test_debug",
        outcome_signal: "success",
        task_summary: "Stabilize the flaky integration probe for the payments fixture.",
        context_summary: "The targeted probe isolated the flaky path and the final verification passed.",
        tool_events: [
          {
            event_id: "evt_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary: "The targeted payments integration probe reproduced and isolated the flaky path.",
            started_at: "2026-03-29T10:00:00.000Z"
          },
          {
            event_id: "evt_verify",
            tool_name: "integration-test",
            status: "success",
            output_summary: "The payments integration test passed after the probe-driven fix.",
            started_at: "2026-03-29T10:05:00.000Z"
          }
        ]
      })
    );

    expect(signals.directional_correction).toMatchObject({
      detected: false,
      objective_support: true,
      user_confirmation: false
    });
    expect(signals.directional_correction?.snippets).toEqual([]);
  });
});
