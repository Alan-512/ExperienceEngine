import { describe, expect, it } from "vitest";
import {
  BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2
} from "../../src/evaluation/matched-block/constants.js";
import { computeBenchmarkRecordDigest } from "../../src/evaluation/matched-block/contract.js";
import {
  assertOpenClawMultiScenarioSet,
  assertOpenClawScenarioAdapterDefinition,
  buildOpenClawScenarioGroundTruth,
  buildOpenClawScenarioManifest,
  computeOpenClawScenarioSetDigest,
  createOpenClawMultiScenarioAdapters,
  OpenClawScenarioAdapterError,
  validateOpenClawScenarioArmEvidence,
  type OpenClawScenarioAdapterDefinition,
  type OpenClawScenarioArmEvidence
} from "../../src/evaluation/matched-block/openclaw-scenario-adapter.js";
import type {
  BenchmarkArmScoringObservationV2,
  BenchmarkDecisionOpportunityScoringObservation,
  BenchmarkGovernanceTransitionObservation
} from "../../src/evaluation/matched-block/scoring.js";
import type { MatchedBlockArm } from "../../src/evaluation/matched-block/types.js";

const createdAt = "2026-07-17T12:00:00.000Z";

const withDigest = <T extends Record<string, unknown>>(
  value: T,
  digestField: keyof T & string
): T => {
  const next: Record<string, unknown> = { ...value };
  next[digestField] = computeBenchmarkRecordDigest(next, digestField);
  return next as T;
};

const adapters = (): OpenClawScenarioAdapterDefinition[] =>
  createOpenClawMultiScenarioAdapters({ campaignVersion: "1", createdAt });

const opportunity = (
  overrides: Partial<BenchmarkDecisionOpportunityScoringObservation> &
    Pick<BenchmarkDecisionOpportunityScoringObservation, "opportunity_id" | "ordinal" | "decision">
): BenchmarkDecisionOpportunityScoringObservation => {
  const {
    opportunity_id,
    ordinal,
    decision,
    ...optionalOverrides
  } = overrides;
  return withDigest({
  opportunity_id,
  ordinal,
  decision,
  would_have_delivered: null,
  delivered_intervention_count: 0,
  helped_intervention_count: 0,
  harmed_intervention_count: 0,
  uncertain_intervention_count: 0,
  considered_candidate_ids: [],
  selected_candidate_ids: [],
  rejected_candidate_ids: [],
  governance_excluded_node_ids: [],
  skip_reason_code: null,
  task_success: 1,
  skipped_guidance_required: null,
  authoritative_harm_evidence_id: null,
  governance_transition: null,
  evidence_digest: "",
  ...optionalOverrides
} satisfies BenchmarkDecisionOpportunityScoringObservation, "evidence_digest");
};

const observation = (options: {
  blockId: string;
  arm: MatchedBlockArm;
  opportunities: BenchmarkDecisionOpportunityScoringObservation[];
}): BenchmarkArmScoringObservationV2 => {
  const last = options.opportunities.at(-1)!;
  const sum = (field: keyof Pick<
    BenchmarkDecisionOpportunityScoringObservation,
    | "delivered_intervention_count"
    | "helped_intervention_count"
    | "harmed_intervention_count"
    | "uncertain_intervention_count"
  >): number => options.opportunities.reduce((total, entry) => total + entry[field], 0);
  return withDigest({
    observation_schema_version: BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2,
    block_id: options.blockId,
    arm: options.arm,
    decision: last.decision,
    decision_opportunity_count: options.opportunities.length,
    delivered_intervention_count: sum("delivered_intervention_count"),
    helped_intervention_count: sum("helped_intervention_count"),
    harmed_intervention_count: sum("harmed_intervention_count"),
    uncertain_intervention_count: sum("uncertain_intervention_count"),
    task_success: last.task_success,
    repeated_old_mistake_avoided: last.task_success,
    provider_cost: null,
    total_token_count: null,
    wall_clock_duration_ms: 100,
    tool_call_count: 1,
    decision_opportunities: options.opportunities,
    observation_digest: ""
  } satisfies BenchmarkArmScoringObservationV2, "observation_digest");
};

const governanceTransition = (nodeId: string): BenchmarkGovernanceTransitionObservation =>
  withDigest({
    node_id: nodeId,
    before_delivery_state: "conservative_only",
    after_delivery_state: "quarantined",
    authority_source: "production_runtime",
    transition_evidence_id: `${nodeId}-transition`,
    evidence_digest: ""
  } satisfies BenchmarkGovernanceTransitionObservation, "evidence_digest");

const buildValidEvidence = (
  adapter: OpenClawScenarioAdapterDefinition,
  arm: MatchedBlockArm
): OpenClawScenarioArmEvidence => {
  const blockId = `${adapter.scenario_id}-${arm}-block`;
  const nodeId = adapter.candidate_corpus[0]!.node_id;
  let opportunities: BenchmarkDecisionOpportunityScoringObservation[];
  if (adapter.scenario_kind === "inject") {
    opportunities = [opportunity({
      opportunity_id: "inject-task",
      ordinal: 1,
      decision: arm === "no_ee" ? "skip" : "inject",
      would_have_delivered: arm === "no_ee" ? null : true,
      delivered_intervention_count: arm === "treatment" ? 1 : 0,
      helped_intervention_count: arm === "treatment" ? 1 : 0,
      considered_candidate_ids: arm === "no_ee" ? [] : [nodeId],
      selected_candidate_ids: arm === "no_ee" ? [] : [nodeId],
      skipped_guidance_required: arm === "no_ee" ? null : false
    })];
  } else if (adapter.scenario_kind === "correct_skip") {
    opportunities = [opportunity({
      opportunity_id: "correct-skip-task",
      ordinal: 1,
      decision: "skip",
      would_have_delivered: arm === "no_ee" ? null : false,
      considered_candidate_ids: arm === "no_ee" ? [] : [nodeId],
      rejected_candidate_ids: arm === "no_ee" ? [] : [nodeId],
      skip_reason_code: arm === "no_ee" ? null : "record_only_diagnostic_candidate",
      skipped_guidance_required: arm === "no_ee" ? null : false
    })];
  } else if (arm === "treatment") {
    opportunities = [
      opportunity({
        opportunity_id: "harm-exposure",
        ordinal: 1,
        decision: "conservative",
        would_have_delivered: true,
        delivered_intervention_count: 1,
        harmed_intervention_count: 1,
        considered_candidate_ids: [nodeId],
        selected_candidate_ids: [nodeId],
        task_success: 0,
        skipped_guidance_required: false,
        authoritative_harm_evidence_id: `${nodeId}-harm-attribution`,
        governance_transition: governanceTransition(nodeId)
      }),
      opportunity({
        opportunity_id: "recovery-recheck",
        ordinal: 2,
        decision: "skip",
        would_have_delivered: false,
        governance_excluded_node_ids: [nodeId],
        skip_reason_code: "recent_harm_or_quarantined",
        skipped_guidance_required: false
      })
    ];
  } else if (arm === "forced_holdout") {
    opportunities = [
      opportunity({
        opportunity_id: "harm-exposure",
        ordinal: 1,
        decision: "conservative",
        would_have_delivered: true,
        considered_candidate_ids: [nodeId],
        selected_candidate_ids: [nodeId],
        skipped_guidance_required: false
      }),
      opportunity({
        opportunity_id: "recovery-recheck",
        ordinal: 2,
        decision: "conservative",
        would_have_delivered: true,
        considered_candidate_ids: [nodeId],
        selected_candidate_ids: [nodeId],
        skipped_guidance_required: false
      })
    ];
  } else {
    opportunities = [
      opportunity({
        opportunity_id: "harm-exposure",
        ordinal: 1,
        decision: "skip"
      }),
      opportunity({
        opportunity_id: "recovery-recheck",
        ordinal: 2,
        decision: "skip"
      })
    ];
  }
  const exposureSessionId = `${blockId}-exposure-session`;
  const opportunitySessions = adapter.opportunities.map((definition) => {
    const feedbackExecuted = adapter.scenario_kind === "harm_recovery" &&
      definition.session_role === "feedback" && arm === "treatment";
    const executed = definition.session_role !== "feedback" || feedbackExecuted;
    return {
      opportunity_id: definition.opportunity_id,
      session_role: definition.session_role,
      executed,
      session_id: executed
        ? definition.session_role === "fresh_recheck"
          ? `${blockId}-recheck-session`
          : exposureSessionId
        : null
    };
  });
  return withDigest({
    evidence_schema_version: "openclaw-scenario-arm-evidence-v1",
    scenario_id: adapter.scenario_id,
    scenario_version: adapter.scenario_version,
    block_id: blockId,
    arm,
    plugin_present: arm !== "no_ee",
    ee_database_present: arm !== "no_ee",
    opportunity_sessions: opportunitySessions,
    observation: observation({ blockId, arm, opportunities }),
    evidence_digest: ""
  } satisfies OpenClawScenarioArmEvidence, "evidence_digest");
};

const expectAdapterCode = (
  action: () => unknown,
  code: OpenClawScenarioAdapterError["code"]
): void => {
  try {
    action();
    throw new Error("Expected adapter validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(OpenClawScenarioAdapterError);
    expect((error as OpenClawScenarioAdapterError).code).toBe(code);
  }
};

describe("OpenClaw multi-scenario adapter", () => {
  it("seals exactly the inject, correct-skip, and harm-recovery scenario set", () => {
    const definitions = adapters();
    expect(assertOpenClawMultiScenarioSet(definitions).map((entry) => entry.scenario_kind)).toEqual([
      "inject",
      "correct_skip",
      "harm_recovery"
    ]);
    expect(computeOpenClawScenarioSetDigest(definitions)).toMatch(/^[a-f0-9]{64}$/);
    for (const definition of definitions) {
      expect(assertOpenClawScenarioAdapterDefinition(definition)).toEqual(definition);
      const groundTruth = buildOpenClawScenarioGroundTruth(definition);
      const manifest = buildOpenClawScenarioManifest(definition, groundTruth);
      expect(manifest.ground_truth_digest).toBe(groundTruth.ground_truth_digest);
      expect(manifest.scenario_id).toBe(definition.scenario_id);
      if (definition.scenario_kind === "harm_recovery") {
        expect(groundTruth.decision_opportunities.map((entry) => [
          entry.opportunity_id,
          entry.ordinal
        ])).toEqual([
          ["harm-exposure", 1],
          ["recovery-recheck", 2]
        ]);
      }
    }
  });

  it("accepts all three arms for every sealed scenario", () => {
    for (const adapter of adapters()) {
      for (const arm of ["treatment", "forced_holdout", "no_ee"] as const) {
        const evidence = buildValidEvidence(adapter, arm);
        expect(validateOpenClawScenarioArmEvidence(adapter, evidence)).toMatchObject({
          scenario_id: adapter.scenario_id,
          scenario_kind: adapter.scenario_kind,
          block_id: evidence.block_id,
          arm,
          valid: true
        });
      }
    }
  });

  it("rejects a changed adapter digest and a changed sealed opportunity sequence", () => {
    const inject = adapters()[0]!;
    expectAdapterCode(
      () => assertOpenClawScenarioAdapterDefinition({ ...inject, title: "tampered" }),
      "OPENCLAW_SCENARIO_DEFINITION_INVALID"
    );
    const changed = withDigest({
      ...inject,
      opportunities: [{
        ...inject.opportunities[0]!,
        opportunity_id: "different-inject-task"
      }],
      adapter_digest: ""
    }, "adapter_digest");
    expectAdapterCode(
      () => assertOpenClawScenarioAdapterDefinition(changed),
      "OPENCLAW_SCENARIO_DEFINITION_INVALID"
    );
  });

  it("rejects correct-skip evidence produced from empty retrieval", () => {
    const adapter = adapters().find((entry) => entry.scenario_kind === "correct_skip")!;
    const valid = buildValidEvidence(adapter, "treatment");
    const invalidOpportunity = opportunity({
      ...valid.observation.decision_opportunities[0]!,
      considered_candidate_ids: [],
      rejected_candidate_ids: [],
      selected_candidate_ids: []
    });
    const invalidObservation = observation({
      blockId: valid.block_id,
      arm: valid.arm,
      opportunities: [invalidOpportunity]
    });
    const invalid = withDigest({
      ...valid,
      observation: invalidObservation,
      evidence_digest: ""
    }, "evidence_digest");
    expectAdapterCode(
      () => validateOpenClawScenarioArmEvidence(adapter, invalid),
      "OPENCLAW_SCENARIO_ARM_INVARIANT_VIOLATED"
    );
  });

  it("rejects no-EE candidate evidence even when the outer digest is recomputed", () => {
    const adapter = adapters()[0]!;
    const valid = buildValidEvidence(adapter, "no_ee");
    const invalidOpportunity = opportunity({
      ...valid.observation.decision_opportunities[0]!,
      considered_candidate_ids: [adapter.candidate_corpus[0]!.node_id]
    });
    const invalid = withDigest({
      ...valid,
      observation: observation({
        blockId: valid.block_id,
        arm: valid.arm,
        opportunities: [invalidOpportunity]
      }),
      evidence_digest: ""
    }, "evidence_digest");
    expectAdapterCode(
      () => validateOpenClawScenarioArmEvidence(adapter, invalid),
      "OPENCLAW_SCENARIO_ARM_INVARIANT_VIOLATED"
    );
  });

  it("rejects harm recovery without bound feedback execution or a fresh recheck session", () => {
    const adapter = adapters().find((entry) => entry.scenario_kind === "harm_recovery")!;
    const valid = buildValidEvidence(adapter, "treatment");
    const missingFeedback = withDigest({
      ...valid,
      opportunity_sessions: valid.opportunity_sessions.map((entry) =>
        entry.session_role === "feedback"
          ? { ...entry, executed: false, session_id: null }
          : entry
      ),
      evidence_digest: ""
    }, "evidence_digest");
    expectAdapterCode(
      () => validateOpenClawScenarioArmEvidence(adapter, missingFeedback),
      "OPENCLAW_SCENARIO_ARM_INVARIANT_VIOLATED"
    );

    const exposureSession = valid.opportunity_sessions.find((entry) =>
      entry.opportunity_id === "harm-exposure"
    )!.session_id;
    const reusedSession = withDigest({
      ...valid,
      opportunity_sessions: valid.opportunity_sessions.map((entry) =>
        entry.opportunity_id === "recovery-recheck"
          ? { ...entry, session_id: exposureSession }
          : entry
      ),
      evidence_digest: ""
    }, "evidence_digest");
    expectAdapterCode(
      () => validateOpenClawScenarioArmEvidence(adapter, reusedSession),
      "OPENCLAW_SCENARIO_ARM_INVARIANT_VIOLATED"
    );
  });

  it("rejects holdout evidence that invents harm or post-harm suppression", () => {
    const adapter = adapters().find((entry) => entry.scenario_kind === "harm_recovery")!;
    const valid = buildValidEvidence(adapter, "forced_holdout");
    const nodeId = adapter.candidate_corpus[0]!.node_id;
    const invalidExposure = opportunity({
      ...valid.observation.decision_opportunities[0]!,
      authoritative_harm_evidence_id: `${nodeId}-invented-harm`,
      governance_transition: governanceTransition(nodeId)
    });
    const invalid = withDigest({
      ...valid,
      observation: observation({
        blockId: valid.block_id,
        arm: valid.arm,
        opportunities: [
          invalidExposure,
          valid.observation.decision_opportunities[1]!
        ]
      }),
      evidence_digest: ""
    }, "evidence_digest");
    expectAdapterCode(
      () => validateOpenClawScenarioArmEvidence(adapter, invalid),
      "OPENCLAW_SCENARIO_ARM_INVARIANT_VIOLATED"
    );
  });

  it("rejects a nested opportunity digest mismatch even with a valid outer evidence digest", () => {
    const adapter = adapters()[0]!;
    const valid = buildValidEvidence(adapter, "treatment");
    const tamperedOpportunity = {
      ...valid.observation.decision_opportunities[0]!,
      task_success: 0 as const
    };
    const tamperedObservation = withDigest({
      ...valid.observation,
      task_success: 0 as const,
      repeated_old_mistake_avoided: 0 as const,
      decision_opportunities: [tamperedOpportunity],
      observation_digest: ""
    }, "observation_digest");
    const invalid = withDigest({
      ...valid,
      observation: tamperedObservation,
      evidence_digest: ""
    }, "evidence_digest");
    expectAdapterCode(
      () => validateOpenClawScenarioArmEvidence(adapter, invalid),
      "OPENCLAW_SCENARIO_EVIDENCE_INVALID"
    );
  });

  it("rejects unknown nested observation fields even when every digest is recomputed", () => {
    const adapter = adapters()[0]!;
    const valid = buildValidEvidence(adapter, "treatment");
    const extendedOpportunity = withDigest({
      ...valid.observation.decision_opportunities[0]!,
      unsealed_note: "not part of the evidence contract",
      evidence_digest: ""
    }, "evidence_digest");
    const extendedObservation = withDigest({
      ...valid.observation,
      decision_opportunities: [extendedOpportunity],
      observation_digest: ""
    }, "observation_digest");
    const invalid = withDigest({
      ...valid,
      observation: extendedObservation,
      evidence_digest: ""
    }, "evidence_digest");
    expectAdapterCode(
      () => validateOpenClawScenarioArmEvidence(adapter, invalid),
      "OPENCLAW_SCENARIO_EVIDENCE_INVALID"
    );
  });
});
