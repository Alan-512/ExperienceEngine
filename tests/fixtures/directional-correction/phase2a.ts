import type { ExperienceInput } from "../../../src/types/domain.js";

const makeInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_directional_phase2a",
  task_type: "general",
  task_summary: "Investigate the failing path and follow the strongest evidence.",
  context_summary: "The task required replacing an earlier hypothesis after stronger evidence disproved it.",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: [],
  ...overrides
});

export type DirectionalReversalFixture = {
  name: string;
  input: ExperienceInput;
  expectedCategory?: "goal_interpretation" | "implementation_boundary" | "verification_order" | "quality_bar";
};

export const positiveEvidenceDrivenReversalSamples: DirectionalReversalFixture[] = [
  {
    name: "provider probe disproves timeout hypothesis and reverses into routing fix",
    expectedCategory: "implementation_boundary",
    input: makeInput({
      task_type: "config_debug",
      outcome_signal: "success",
      task_summary: "Fix the failing request path by following the strongest root-cause evidence.",
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
  },
  {
    name: "focused browser verification disproves css tweak and reverses into interaction logic fix",
    expectedCategory: "quality_bar",
    input: makeInput({
      task_type: "feature_add",
      outcome_signal: "success",
      task_summary: "Repair the interaction regression instead of stopping at a surface-level tweak.",
      context_summary:
        "The initial CSS-tweak path looked plausible, but a focused browser verification disproved it because the interaction behavior was still wrong. The work pivoted into the interaction logic, and the later browser verification succeeded.",
      tool_events: [
        {
          event_id: "evt_initial_css",
          tool_name: "analysis-note",
          status: "success",
          output_summary: "Initial hypothesis: a CSS tweak could be enough to fix the interaction regression.",
          started_at: "2026-03-29T12:20:00.000Z"
        },
        {
          event_id: "evt_invalidate_browser",
          tool_name: "browser-verify",
          status: "success",
          output_summary:
            "Focused browser verification disproved the CSS-tweak path because the requested interaction behavior was still wrong.",
          started_at: "2026-03-29T12:24:00.000Z"
        },
        {
          event_id: "evt_pivot_logic",
          tool_name: "apply_patch",
          status: "success",
          output_summary: "Reworked the interaction logic instead of continuing the CSS tweak path.",
          started_at: "2026-03-29T12:28:00.000Z"
        },
        {
          event_id: "evt_validate_logic",
          tool_name: "browser-verify",
          status: "success",
          output_summary: "The later browser verification confirmed the corrected interaction logic.",
          started_at: "2026-03-29T12:31:00.000Z"
        }
      ]
    })
  }
];

export const negativeEvidenceDrivenReversalSamplesA: DirectionalReversalFixture[] = [
  {
    name: "stronger evidence narrowed the issue but did not invalidate the existing direction",
    input: makeInput({
      task_type: "config_debug",
      outcome_signal: "success",
      task_summary: "Narrow the routing failure without changing the overall fix direction.",
      context_summary:
        "A focused routing probe narrowed the issue, but it confirmed the current routing fix direction rather than overturning it. The later verification passed on the same path.",
      tool_events: [
        {
          event_id: "evt_current_direction",
          tool_name: "analysis-note",
          status: "success",
          output_summary: "Active direction: continue the provider-routing fix.",
          started_at: "2026-03-29T12:40:00.000Z"
        },
        {
          event_id: "evt_probe_confirm",
          tool_name: "targeted-probe",
          status: "success",
          output_summary: "The focused routing probe confirmed the current provider-routing direction.",
          started_at: "2026-03-29T12:43:00.000Z"
        },
        {
          event_id: "evt_validate_confirm",
          tool_name: "integration-test",
          status: "success",
          output_summary: "The integration verification passed on the same routing path.",
          started_at: "2026-03-29T12:47:00.000Z"
        }
      ]
    })
  }
];

export const negativeEvidenceDrivenReversalSamplesB: DirectionalReversalFixture[] = [
  {
    name: "ordinary verification loop with no earlier hypothesis reversal",
    input: makeInput({
      task_type: "test_debug",
      outcome_signal: "success",
      task_summary: "Stabilize the flaky provider check by iterating the verification loop.",
      context_summary:
        "The task used a normal probe-and-verify loop. No earlier direction was disproven and no replacement path emerged.",
      tool_events: [
        {
          event_id: "evt_probe_loop",
          tool_name: "targeted-probe",
          status: "success",
          output_summary: "The targeted probe reproduced the flaky provider check.",
          started_at: "2026-03-29T12:55:00.000Z"
        },
        {
          event_id: "evt_patch_loop",
          tool_name: "apply_patch",
          status: "success",
          output_summary: "Adjusted the provider check to improve the flaky path.",
          started_at: "2026-03-29T12:58:00.000Z"
        },
        {
          event_id: "evt_verify_loop",
          tool_name: "integration-test",
          status: "success",
          output_summary: "The provider verification passed after the iterative probe loop.",
          started_at: "2026-03-29T13:02:00.000Z"
        }
      ]
    })
  }
];

export const mixedPhase1PrioritySamples: DirectionalReversalFixture[] = [
  {
    name: "explicit user correction stays phase-1 primary even with later stronger evidence",
    expectedCategory: "implementation_boundary",
    input: makeInput({
      task_type: "config_debug",
      outcome_signal: "success",
      task_summary: "Fix the request path without persisting the change in the wrong layer.",
      context_summary:
        "The user explicitly corrected the direction to provider routing. A later targeted provider probe then strengthened that same correction and the final verification passed.",
      tool_events: [
        {
          event_id: "evt_feedback_boundary",
          tool_name: "user-feedback",
          status: "success",
          output_summary: "The user said the issue is still in provider routing, not the UI layer.",
          started_at: "2026-03-29T13:10:00.000Z"
        },
        {
          event_id: "evt_invalidate_probe",
          tool_name: "targeted-probe",
          status: "success",
          output_summary:
            "The targeted provider probe ruled out the timeout hypothesis and showed the request was still failing inside provider routing.",
          started_at: "2026-03-29T13:14:00.000Z"
        },
        {
          event_id: "evt_pivot_routing",
          tool_name: "apply_patch",
          status: "success",
          output_summary: "Moved the fix into provider routing.",
          started_at: "2026-03-29T13:17:00.000Z"
        },
        {
          event_id: "evt_validate_routing",
          tool_name: "integration-test",
          status: "success",
          output_summary: "The provider-routing integration verification passed after the routing fix.",
          started_at: "2026-03-29T13:20:00.000Z"
        }
      ]
    })
  }
];
