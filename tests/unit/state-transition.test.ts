import { describe, expect, it } from "vitest";
import { transitionState } from "../../src/feedback/state-transition.js";
import type { NodeOriginProfile } from "../../src/experience-management/task-management-signals.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const node = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_transition",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing vitest auth test in the current workspace",
  compact_hint: "Run the focused test before and after the smallest change.",
  success_signal: "The focused test passes.",
  evidence_summary: "Captured from a successful verification loop.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "candidate",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-03-26T00:00:00.000Z",
  updated_at: "2026-03-26T00:00:00.000Z",
  ...overrides
});

const metaOriginProfile = (overrides: Partial<NodeOriginProfile> = {}): NodeOriginProfile => ({
  sampleCount: 2,
  metaCount: 2,
  validationCount: 1,
  realDevCount: 0,
  bugFixCount: 0,
  strictPromotion: true,
  reasons: ["strict_promotion:yes"],
  ...overrides
});

describe("transitionState", () => {
  it("keeps a fresh priority candidate in priority state until it validates", () => {
    expect(transitionState(node({ state: "priority_candidate", promotion_signal: "high_value" }))).toBe(
      "priority_candidate"
    );
  });

  it("promotes a priority candidate to active after reuse support arrives", () => {
    expect(
      transitionState(node({ state: "priority_candidate", promotion_signal: "high_value", support_count: 2 }))
    ).toBe("active");
  });

  it("drops a priority candidate back to candidate when early harm appears", () => {
    expect(
      transitionState(node({ state: "priority_candidate", promotion_signal: "high_value", harmed_count: 1 }))
    ).toBe("candidate");
  });

  it("keeps a meta-like candidate in candidate state after the first helped reuse", () => {
    expect(
      transitionState(
        node({ state: "candidate", helped_count: 1 }),
        { originProfile: metaOriginProfile() }
      )
    ).toBe("candidate");
  });

  it("keeps a meta-like priority candidate in priority state until stronger reuse evidence arrives", () => {
    expect(
      transitionState(
        node({ state: "priority_candidate", promotion_signal: "high_value", helped_count: 1, support_count: 2 }),
        { originProfile: metaOriginProfile() }
      )
    ).toBe("priority_candidate");
  });
});
