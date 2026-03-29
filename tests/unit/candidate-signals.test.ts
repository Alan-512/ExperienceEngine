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
      correction_strength: "high",
      correction_source: "mixed",
      objective_support: true,
      user_confirmation: false,
      improvement_evidence: "objective_support"
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
      correction_strength: "low",
      objective_support: true,
      user_confirmation: false,
      improvement_evidence: "objective_support"
    });
    expect(signals.directional_correction?.snippets).toEqual([]);
  });

  it("does not promote ordinary user feedback into directional snippets", () => {
    const signals = buildCandidateSignals(
      makeInput({
        outcome_signal: "success",
        task_summary: "Polish the button label after review.",
        context_summary: "The button label was clarified after review and the final browser verification passed.",
        tool_events: [
          {
            event_id: "evt_feedback_copy",
            tool_name: "user-feedback",
            status: "success",
            output_summary: "Use a clearer label on the button.",
            started_at: "2026-03-29T10:20:00.000Z"
          },
          {
            event_id: "evt_verify_copy",
            tool_name: "browser-verify",
            status: "success",
            output_summary: "The updated label renders correctly in the browser verification.",
            started_at: "2026-03-29T10:24:00.000Z"
          }
        ]
      })
    );

    expect(signals.directional_correction).toMatchObject({
      detected: false,
      objective_support: true,
      user_confirmation: false,
      improvement_evidence: "objective_support"
    });
    expect(signals.directional_correction?.sources).toEqual([]);
    expect(signals.directional_correction?.snippets).toEqual([]);
  });

  it("captures an evidence-driven reversal window without explicit user correction", () => {
    const signals = buildCandidateSignals(
      makeInput({
        outcome_signal: "success",
        task_summary: "Follow the strongest root-cause evidence for the failing request path.",
        context_summary:
          "The initial timeout-tuning hypothesis was ruled out after a targeted provider probe showed the request was still failing inside provider routing. The investigation pivoted into provider routing, and the final integration verification passed.",
        tool_events: [
          {
            event_id: "evt_initial_hypothesis",
            tool_name: "analysis-note",
            status: "success",
            output_summary: "Initial working hypothesis: retry timeout tuning may be enough to fix the failing request path.",
            started_at: "2026-03-29T12:00:00.000Z"
          },
          {
            event_id: "evt_invalidate_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary:
              "The targeted provider probe ruled out the timeout hypothesis and showed the request was still failing inside provider routing.",
            started_at: "2026-03-29T12:04:00.000Z"
          },
          {
            event_id: "evt_pivot_routing",
            tool_name: "apply_patch",
            status: "success",
            output_summary: "Moved the fix from timeout tuning into provider routing.",
            started_at: "2026-03-29T12:08:00.000Z"
          },
          {
            event_id: "evt_validate_routing",
            tool_name: "integration-test",
            status: "success",
            output_summary: "The provider-routing integration verification passed after the routing fix.",
            started_at: "2026-03-29T12:12:00.000Z"
          }
        ]
      })
    );

    expect(signals.directional_correction?.detected).toBe(false);
    expect(signals.evidence_driven_reversal).toMatchObject({
      detected: true,
      reversal_source: "task_evidence",
      prior_hypothesis: true,
      invalidating_evidence: true,
      validating_evidence: true
    });
    expect(signals.evidence_driven_reversal?.hypothesis_snippets).not.toEqual([]);
    expect(signals.evidence_driven_reversal?.invalidating_snippets).not.toEqual([]);
    expect(signals.evidence_driven_reversal?.pivot_snippets).not.toEqual([]);
    expect(signals.evidence_driven_reversal?.validating_snippets).not.toEqual([]);
  });

  it("captures an evidence-driven reversal when the replacement path is clear without a dedicated pivot phrase", () => {
    const signals = buildCandidateSignals(
      makeInput({
        outcome_signal: "success",
        task_summary: "Fix the failing request path by following the strongest root-cause evidence.",
        context_summary:
          "The initial timeout-tuning hypothesis was ruled out after a targeted provider probe showed the request was still failing inside provider routing. The later provider-routing integration verification passed after the routing fix.",
        tool_events: [
          {
            event_id: "evt_initial_timeout_hypothesis",
            tool_name: "analysis-note",
            status: "success",
            output_summary: "Initial working hypothesis: retry timeout tuning may be enough to fix the failing request path.",
            started_at: "2026-03-29T12:14:00.000Z"
          },
          {
            event_id: "evt_routing_probe_invalidate",
            tool_name: "targeted-probe",
            status: "success",
            output_summary:
              "The targeted provider probe ruled out the timeout hypothesis and showed the request was still failing inside provider routing.",
            started_at: "2026-03-29T12:16:00.000Z"
          },
          {
            event_id: "evt_apply_routing_fix",
            tool_name: "apply_patch",
            status: "success",
            output_summary: "Updated the provider routing configuration after the stronger probe.",
            started_at: "2026-03-29T12:18:00.000Z"
          },
          {
            event_id: "evt_validate_routing_fix",
            tool_name: "integration-test",
            status: "success",
            output_summary: "The provider-routing integration verification passed after the routing fix.",
            started_at: "2026-03-29T12:21:00.000Z"
          }
        ]
      })
    );

    expect(signals.evidence_driven_reversal).toMatchObject({
      detected: true,
      reversal_source: "task_evidence",
      prior_hypothesis: true,
      invalidating_evidence: true,
      validating_evidence: true
    });
    expect(signals.evidence_driven_reversal?.validating_snippets).not.toEqual([]);
  });
});
