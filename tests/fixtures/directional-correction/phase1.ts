import type { ExperienceInput } from "../../../src/types/domain.js";

const makeInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_directional_phase1",
  task_type: "general",
  task_summary: "Investigate the issue and decide on the correct fix direction.",
  context_summary: "The task required correcting an initially wrong direction.",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: [],
  ...overrides
});

export type DirectionalCorrectionFixture = {
  name: string;
  input: ExperienceInput;
  expectedCategory?: "goal_interpretation" | "implementation_boundary" | "verification_order" | "quality_bar";
};

export const positiveDirectionalCorrectionSamples: DirectionalCorrectionFixture[] = [
  {
    name: "implementation-boundary correction after explicit user feedback",
    expectedCategory: "implementation_boundary",
    input: makeInput({
      task_type: "config_debug",
      outcome_signal: "success",
      task_summary: "Fix the regression without persisting the patch in the UI layer.",
      context_summary:
        "The user corrected the direction: the problem is in provider routing, not in the UI layer. The final targeted provider probe succeeded after moving the fix.",
      tool_events: [
        {
          event_id: "evt_feedback_boundary",
          tool_name: "user-feedback",
          status: "success",
          output_summary: "The user said the problem is in provider routing, not in the UI layer.",
          started_at: "2026-03-29T10:00:00.000Z"
        },
        {
          event_id: "evt_probe_boundary",
          tool_name: "targeted-probe",
          status: "success",
          output_summary: "The targeted provider probe succeeded after moving the fix into provider routing.",
          started_at: "2026-03-29T10:05:00.000Z"
        }
      ]
    })
  },
  {
    name: "verification-order correction before broad edits",
    expectedCategory: "verification_order",
    input: makeInput({
      task_type: "test_debug",
      outcome_signal: "success",
      task_summary: "Diagnose the flaky payments fixture without broad edits.",
      context_summary:
        "The user corrected the order: verify the fixture handshake first, then change code. The focused integration probe succeeded after following that order.",
      tool_events: [
        {
          event_id: "evt_feedback_verify",
          tool_name: "user-feedback",
          status: "success",
          output_summary: "The user said to verify the fixture handshake first instead of broad code changes.",
          started_at: "2026-03-29T10:10:00.000Z"
        },
        {
          event_id: "evt_probe_verify",
          tool_name: "integration-probe",
          status: "success",
          output_summary: "The fixture handshake probe succeeded after the verification-first path.",
          started_at: "2026-03-29T10:13:00.000Z"
        }
      ]
    })
  },
  {
    name: "quality-bar correction from test-green to behavior-correct",
    expectedCategory: "quality_bar",
    input: makeInput({
      task_type: "feature_add",
      outcome_signal: "success",
      task_summary: "Finish the interaction fix without stopping at a merely test-green result.",
      context_summary:
        "The user corrected the quality bar: passing tests was not enough because the behavior still felt wrong. The final browser verification matched the requested interaction.",
      tool_events: [
        {
          event_id: "evt_feedback_quality",
          tool_name: "user-feedback",
          status: "success",
          output_summary: "The user said the tests passing is not enough because the interaction still feels wrong.",
          started_at: "2026-03-29T10:20:00.000Z"
        },
        {
          event_id: "evt_verify_quality",
          tool_name: "browser-verify",
          status: "success",
          output_summary: "The browser verification now matches the requested interaction behavior.",
          started_at: "2026-03-29T10:28:00.000Z"
        }
      ]
    })
  }
];

export const negativeDirectionalCorrectionSamples: DirectionalCorrectionFixture[] = [
  {
    name: "inline notice wording refinement",
    input: makeInput({
      task_summary: "Refine the inline notice wording so it sounds lighter.",
      context_summary: "Adjusted the inline notice copy so it sounds lighter in the main agent window.",
      tool_events: [
        {
          event_id: "evt_patch_notice",
          tool_name: "apply_patch",
          status: "success",
          output_summary: "Updated the inline notice wording.",
          started_at: "2026-03-29T11:00:00.000Z"
        }
      ],
      outcome_signal: "success"
    })
  },
  {
    name: "documentation phrasing cleanup",
    input: makeInput({
      task_summary: "Rewrite the documentation paragraph so it is shorter and clearer.",
      context_summary: "The docs paragraph was rewritten for tone and clarity only.",
      tool_events: [
        {
          event_id: "evt_patch_docs",
          tool_name: "apply_patch",
          status: "success",
          output_summary: "Shortened the documentation paragraph.",
          started_at: "2026-03-29T11:10:00.000Z"
        }
      ],
      outcome_signal: "success"
    })
  },
  {
    name: "label copy tweak after review",
    input: makeInput({
      task_summary: "Adjust the button label copy after review.",
      context_summary: "The reviewer asked for a clearer label, but no implementation direction changed.",
      tool_events: [
        {
          event_id: "evt_feedback_copy",
          tool_name: "user-feedback",
          status: "success",
          output_summary: "Use a clearer label on the button.",
          started_at: "2026-03-29T11:20:00.000Z"
        },
        {
          event_id: "evt_patch_copy",
          tool_name: "apply_patch",
          status: "success",
          output_summary: "Updated the button label copy.",
          started_at: "2026-03-29T11:22:00.000Z"
        }
      ],
      outcome_signal: "success"
    })
  }
];
