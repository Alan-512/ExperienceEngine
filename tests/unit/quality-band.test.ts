import { describe, expect, it } from "vitest";
import {
  deriveQualityBandExplanation,
  summarizeQualityBandDistribution
} from "../../src/interaction/quality-band.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_quality",
  node_type: "strategy",
  scope_id: "scope_repo",
  task_type: "test_debug",
  validation_state: "pending_reuse_validation",
  trigger_pattern: "Fix the failing auth test",
  applicability_notes: "Stay in the same repo scope",
  compact_hint: "Run the failing test before editing.",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "The test passes",
  evidence_summary: "Prior auth-test recovery evidence.",
  retrieval_text: "Fix the failing auth test",
  source_kind: "system_derived",
  origin_record_ids: ["input_origin"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  ...overrides
});

describe("quality band explanation", () => {
  it("marks active reuse-validated nodes as strong without mutating delivery state", () => {
    const explanation = deriveQualityBandExplanation(
      makeNode({
        validation_state: "validated_by_reuse",
        helped_count: 2,
        helped_record_ids: ["input_helped"]
      })
    );

    expect(explanation.band).toBe("strong");
    expect(explanation.reasonCodes).toEqual(
      expect.arrayContaining(["active_eligible", "validated_by_reuse", "helped_without_harm"])
    );
    expect(explanation.recommendedAction).toBeUndefined();
  });

  it("keeps early lifecycle candidates in building rather than treating them as injected-risky", () => {
    const explanation = deriveQualityBandExplanation(
      makeNode({
        state: "candidate",
        delivery_state: "shadow_only"
      })
    );

    expect(explanation.band).toBe("building");
    expect(explanation.reasonCodes).toEqual(expect.arrayContaining(["early_lifecycle", "shadow_only"]));
  });

  it("marks weakened or quarantined guidance as risky with evidence references", () => {
    const explanation = deriveQualityBandExplanation(
      makeNode({
        delivery_state: "quarantined",
        harmed_count: 2,
        helped_count: 1,
        harmed_record_ids: ["input_harmed"],
        quarantine_reason: "Repeated relevant failures."
      })
    );

    expect(explanation.band).toBe("risky");
    expect(explanation.reasonCodes).toEqual(
      expect.arrayContaining(["harm_outweighs_help", "quarantined", "high_hygiene_risk"])
    );
    expect(explanation.evidenceRefs).toEqual(
      expect.arrayContaining([{ kind: "harmed_record", id: "input_harmed" }])
    );
    expect(explanation.recommendedAction?.command).toBe("ee inspect node node_quality");
  });

  it("summarizes repo quality distribution", () => {
    const distribution = summarizeQualityBandDistribution([
      deriveQualityBandExplanation(makeNode({ validation_state: "validated_by_reuse", helped_count: 1 })),
      deriveQualityBandExplanation(makeNode({ id: "node_building", state: "candidate", delivery_state: "shadow_only" })),
      deriveQualityBandExplanation(makeNode({ id: "node_risky", state: "cooling", harmed_count: 1 }))
    ]);

    expect(distribution).toMatchObject({
      strong: 1,
      building: 1,
      risky: 1
    });
  });
});
