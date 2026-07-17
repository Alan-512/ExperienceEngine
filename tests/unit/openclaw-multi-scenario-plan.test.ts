import { describe, expect, it } from "vitest";
import { computeBenchmarkRecordDigest } from "../../src/evaluation/matched-block/contract.js";
import {
  assertOpenClawMultiScenarioCampaignPlan,
  createOpenClawMultiScenarioCampaignPlan,
  OpenClawMultiScenarioPlanError
} from "../../src/evaluation/matched-block/openclaw-multi-scenario-plan.js";

const buildPlan = () => createOpenClawMultiScenarioCampaignPlan({
  campaignVersion: "1",
  repetitionsPerScenario: 1,
  createdAt: "2026-07-17T12:00:00.000Z",
  artifact: {
    file_name: "alan512-experienceengine-clawhub-0.5.1.tgz",
    size_bytes: 3152331,
    sha256: "01f6f17005d2edb4db5a0358e284799818fd4cab977fb16604cc5ddaa5eed692",
    published_channel: "clawhub",
    package_name: "@alan512/experienceengine",
    package_version: "0.5.1"
  },
  host: {
    executable_name: "openclaw",
    openclaw_version: "2026.7.1",
    node_version: "22.21.0",
    platform: "linux-x64",
    model_provider: "openrouter",
    model_identity: "tencent/hy3:free",
    host_mode: "local_embedded"
  }
});

const expectPlanCode = (
  action: () => unknown,
  code: OpenClawMultiScenarioPlanError["code"]
): void => {
  try {
    action();
    throw new Error("Expected plan validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(OpenClawMultiScenarioPlanError);
    expect((error as OpenClawMultiScenarioPlanError).code).toBe(code);
  }
};

describe("OpenClaw multi-scenario campaign plan", () => {
  it("seals one deterministic three-arm block for each scenario", () => {
    const plan = assertOpenClawMultiScenarioCampaignPlan(buildPlan());
    expect(plan.scenarios.map((scenario) => scenario.adapter.scenario_kind)).toEqual([
      "inject",
      "correct_skip",
      "harm_recovery"
    ]);
    expect(plan.scenarios.flatMap((scenario) => scenario.blocks)).toHaveLength(3);
    for (const scenario of plan.scenarios) {
      expect(scenario.blocks[0]!.planned_arm_order).toHaveLength(3);
      expect(new Set(scenario.blocks[0]!.planned_arm_order)).toEqual(new Set([
        "treatment",
        "forced_holdout",
        "no_ee"
      ]));
    }
    expect(plan.claim_boundary).toEqual({
      evidence_label: "infrastructure_directional_pilot",
      general_efficacy_claim_allowed: false,
      support_claim_allowed: false,
      production_learning_ready: false
    });
  });

  it("rejects changed arm order even when the outer plan digest is recomputed", () => {
    const plan = buildPlan();
    const changedBlock = {
      ...plan.scenarios[0]!.blocks[0]!,
      planned_arm_order: [...plan.scenarios[0]!.blocks[0]!.planned_arm_order].reverse()
    };
    changedBlock.block_plan_digest = computeBenchmarkRecordDigest(
      changedBlock as unknown as Record<string, unknown>,
      "block_plan_digest"
    );
    const changed = {
      ...plan,
      scenarios: [{
        ...plan.scenarios[0]!,
        blocks: [changedBlock]
      }, ...plan.scenarios.slice(1)],
      plan_digest: ""
    };
    changed.plan_digest = computeBenchmarkRecordDigest(
      changed as unknown as Record<string, unknown>,
      "plan_digest"
    );
    expectPlanCode(
      () => assertOpenClawMultiScenarioCampaignPlan(changed),
      "OPENCLAW_MULTI_SCENARIO_PLAN_DIGEST_MISMATCH"
    );
  });

  it("rejects absolute artifact paths and enabled support claims", () => {
    const plan = buildPlan();
    expectPlanCode(
      () => assertOpenClawMultiScenarioCampaignPlan({
        ...plan,
        artifact: { ...plan.artifact, file_name: "C:\\private\\artifact.tgz" }
      }),
      "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID"
    );
    expectPlanCode(
      () => assertOpenClawMultiScenarioCampaignPlan({
        ...plan,
        claim_boundary: { ...plan.claim_boundary, support_claim_allowed: true }
      }),
      "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID"
    );
  });

  it("rejects unknown plan and nested block fields even when digests are recomputed", () => {
    const plan = buildPlan();
    const extendedPlan = {
      ...plan,
      unsealed_note: "not part of the protocol",
      plan_digest: ""
    };
    extendedPlan.plan_digest = computeBenchmarkRecordDigest(
      extendedPlan as unknown as Record<string, unknown>,
      "plan_digest"
    );
    expectPlanCode(
      () => assertOpenClawMultiScenarioCampaignPlan(extendedPlan),
      "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID"
    );

    const extendedBlock = {
      ...plan.scenarios[0]!.blocks[0]!,
      unsealed_note: "not part of the block contract",
      block_plan_digest: ""
    };
    extendedBlock.block_plan_digest = computeBenchmarkRecordDigest(
      extendedBlock as unknown as Record<string, unknown>,
      "block_plan_digest"
    );
    const extendedNestedPlan = {
      ...plan,
      scenarios: [{
        ...plan.scenarios[0]!,
        blocks: [extendedBlock]
      }, ...plan.scenarios.slice(1)],
      plan_digest: ""
    };
    extendedNestedPlan.plan_digest = computeBenchmarkRecordDigest(
      extendedNestedPlan as unknown as Record<string, unknown>,
      "plan_digest"
    );
    expectPlanCode(
      () => assertOpenClawMultiScenarioCampaignPlan(extendedNestedPlan),
      "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID"
    );
  });
});
