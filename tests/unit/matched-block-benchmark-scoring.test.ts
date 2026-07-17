import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2,
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "../../src/evaluation/matched-block/constants.js";
import { computeBenchmarkRecordDigest } from "../../src/evaluation/matched-block/contract.js";
import { renderMatchedBlockCampaignMarkdown } from "../../src/evaluation/matched-block/campaign-report.js";
import {
  appendMatchedBlockDisposition,
  createWholeBlockReplacement
} from "../../src/evaluation/matched-block/failure-protocol.js";
import {
  scoreMatchedBlockCampaign,
  type BenchmarkArmScoringObservation,
  type BenchmarkArmScoringObservationV1,
  type BenchmarkArmScoringObservationV2,
  type BenchmarkDecisionOpportunityScoringObservation,
  type BenchmarkGovernanceTransitionObservation
} from "../../src/evaluation/matched-block/scoring.js";
import type {
  BenchmarkAttemptExecutionStatus,
  BenchmarkFormalAttempt,
  BenchmarkInfrastructureFailureCode,
  BenchmarkGroundTruthV2,
  MatchedBlockArm,
  MatchedBlockArmPlan,
  MatchedBlockManifest
} from "../../src/evaluation/matched-block/types.js";
import {
  createMatchedBlockHarnessStoreFixture,
  MATCHED_BLOCK_TEST_CREATED_AT,
  withBenchmarkDigest
} from "./matched-block-benchmark-fixture.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const createRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "experienceengine-matched-scoring-"));
  tempDirs.push(root);
  return root;
};

const insertAttempt = (input: {
  store: ReturnType<typeof createMatchedBlockHarnessStoreFixture>["store"];
  block: MatchedBlockManifest;
  plans: MatchedBlockArmPlan[];
  arm: MatchedBlockArm;
  status?: Exclude<BenchmarkAttemptExecutionStatus, "running">;
  infrastructureCode?: BenchmarkInfrastructureFailureCode | null;
}): void => {
  const plan = input.plans.find((candidate) => candidate.arm === input.arm)!;
  const running: BenchmarkFormalAttempt = {
    attempt_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.formalAttempt,
    benchmark_campaign_id: input.block.benchmark_campaign_id,
    block_id: input.block.block_id,
    manifest_digest: input.block.manifest_digest,
    arm: input.arm,
    attempt_id: `${input.block.block_id}-${input.arm}-attempt-1`,
    attempt_number: 1,
    attempt_state_revision: 1,
    planned_ordinal: plan.planned_ordinal,
    execution_status: "running",
    task_outcome: "unavailable",
    task_timeout: false,
    infrastructure_failure_code: null,
    product_runtime_failure_codes: [],
    started_at: MATCHED_BLOCK_TEST_CREATED_AT,
    finished_at: null,
    workspace_artifact_digest: null,
    host_transcript_digest: null,
    arm_neutral_metrics_digest: null,
    deterministic_check_digest: null,
    scoring_record_digest: null
  };
  input.store.startFormalAttempt(running);
  const status = input.status ?? "completed";
  input.store.terminalizeFormalAttempt(1, {
    ...running,
    attempt_state_revision: 2,
    execution_status: status,
    task_outcome: status === "completed" ? "success" : "unavailable",
    infrastructure_failure_code: input.infrastructureCode ??
      (status === "completed" ? null : "BENCH_HARNESS_DEFECT"),
    finished_at: "2026-07-16T08:01:00.000Z",
    workspace_artifact_digest: status === "completed" ? `${input.arm}-workspace` : null,
    host_transcript_digest: status === "completed" ? `${input.arm}-transcript` : null,
    arm_neutral_metrics_digest: status === "completed" ? `${input.arm}-metrics` : null,
    deterministic_check_digest: status === "completed" ? `${input.arm}-checks` : null,
    scoring_record_digest: status === "completed" ? `${input.arm}-score` : null
  });
};

const insertCompleteBlock = (input: {
  fixture: ReturnType<typeof createMatchedBlockHarnessStoreFixture>;
  block?: MatchedBlockManifest;
  plans?: MatchedBlockArmPlan[];
}): void => {
  const block = input.block ?? input.fixture.block;
  const plans = input.plans ?? input.fixture.armPlans;
  for (const arm of block.planned_arm_order) {
    insertAttempt({ store: input.fixture.store, block, plans, arm });
  }
  appendMatchedBlockDisposition(
    input.fixture.store,
    block.block_id,
    "2026-07-16T08:02:00.000Z",
    "scorer-test"
  );
};

const observationsForBlock = (
  blockId: string,
  overrides: Partial<Record<MatchedBlockArm, Partial<BenchmarkArmScoringObservationV1>>> = {}
): BenchmarkArmScoringObservation[] => ([
  {
    block_id: blockId,
    arm: "treatment",
    decision: "inject",
    decision_opportunity_count: 1,
    delivered_intervention_count: 1,
    helped_intervention_count: 1,
    harmed_intervention_count: 0,
    uncertain_intervention_count: 0,
    task_success: 1,
    repeated_old_mistake_avoided: 1,
    provider_cost: 0.03,
    total_token_count: 1200,
    wall_clock_duration_ms: 1000,
    tool_call_count: 5,
    observation_digest: `${blockId}-treatment-observation`
  },
  {
    block_id: blockId,
    arm: "forced_holdout",
    decision: "inject",
    decision_opportunity_count: 1,
    delivered_intervention_count: 0,
    helped_intervention_count: 0,
    harmed_intervention_count: 0,
    uncertain_intervention_count: 0,
    task_success: 0,
    repeated_old_mistake_avoided: 0,
    provider_cost: 0.02,
    total_token_count: 1000,
    wall_clock_duration_ms: 1100,
    tool_call_count: 6,
    observation_digest: `${blockId}-holdout-observation`
  },
  {
    block_id: blockId,
    arm: "no_ee",
    decision: "skip",
    decision_opportunity_count: 1,
    delivered_intervention_count: 0,
    helped_intervention_count: 0,
    harmed_intervention_count: 0,
    uncertain_intervention_count: 0,
    task_success: 0,
    repeated_old_mistake_avoided: 0,
    provider_cost: 0.01,
    total_token_count: 900,
    wall_clock_duration_ms: 1300,
    tool_call_count: 8,
    observation_digest: `${blockId}-noee-observation`
  }
] as BenchmarkArmScoringObservation[]).map((observation) => ({
  ...observation,
  ...(overrides[observation.arm] ?? {})
}));

const withOpportunityDigest = (
  value: Omit<BenchmarkDecisionOpportunityScoringObservation, "evidence_digest">
): BenchmarkDecisionOpportunityScoringObservation => ({
  ...value,
  evidence_digest: computeBenchmarkRecordDigest({
    ...value,
    evidence_digest: ""
  }, "evidence_digest")
});

const withGovernanceTransitionDigest = (
  value: Omit<BenchmarkGovernanceTransitionObservation, "evidence_digest">
): BenchmarkGovernanceTransitionObservation => {
  const digest = computeBenchmarkRecordDigest({
    ...value,
    evidence_digest: ""
  }, "evidence_digest");
  return { ...value, evidence_digest: digest };
};

const withV2ObservationDigest = (
  value: Omit<BenchmarkArmScoringObservationV2, "observation_digest">
): BenchmarkArmScoringObservationV2 => ({
  ...value,
  observation_digest: computeBenchmarkRecordDigest({
    ...value,
    observation_digest: ""
  }, "observation_digest")
});

const buildSkipGroundTruthV2 = (options: {
  includeInjectOpportunity?: boolean;
} = {}): BenchmarkGroundTruthV2 => {
  const decisionOpportunities = options.includeInjectOpportunity ? [
    {
      opportunity_id: "initial-inject",
      ordinal: 1,
      expected_action: "inject" as const,
      plausible_node_ids: ["node-distractor"],
      plausible_candidate_ids: [],
      candidate_consideration_required: true,
      valid_skip_reason_codes: [],
      requires_prior_harm: false,
      known_old_mistake_path: "miss_required_guidance"
    },
    {
      opportunity_id: "skip-check",
      ordinal: 2,
      expected_action: "skip" as const,
      plausible_node_ids: ["node-distractor"],
      plausible_candidate_ids: [],
      candidate_consideration_required: true,
      valid_skip_reason_codes: ["applicability_mismatch"],
      requires_prior_harm: false,
      known_old_mistake_path: null
    }
  ] : [{
    opportunity_id: "skip-check",
    ordinal: 1,
    expected_action: "skip" as const,
    plausible_node_ids: ["node-distractor"],
    plausible_candidate_ids: [],
    candidate_consideration_required: true,
    valid_skip_reason_codes: ["applicability_mismatch"],
    requires_prior_harm: false,
    known_old_mistake_path: null
  }];
  return withBenchmarkDigest({
    ground_truth_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.groundTruthV2,
    ground_truth_id: options.includeInjectOpportunity
      ? "ground-truth-multi-opportunity"
      : "ground-truth-correct-skip",
    scenario_id: options.includeInjectOpportunity
      ? "scenario-multi-opportunity"
      : "scenario-correct-skip",
    scenario_version: "2",
    expected_action: "skip",
    applicable_node_ids: [],
    applicable_candidate_ids: [],
    distractor_node_ids: ["node-distractor"],
    distractor_candidate_ids: [],
    scope_validity: { valid: true, reason_code: "scope_matches" },
    safety_constraints: ["read_only"],
    deterministic_success_checks: ["task_success"],
    known_old_mistake_path: null,
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    decision_opportunities: decisionOpportunities,
    ground_truth_digest: ""
  } satisfies BenchmarkGroundTruthV2, "ground_truth_digest");
};

const buildHarmRecoveryGroundTruthV2 = (): BenchmarkGroundTruthV2 =>
  withBenchmarkDigest({
    ground_truth_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.groundTruthV2,
    ground_truth_id: "ground-truth-harm-recovery",
    scenario_id: "scenario-harm-recovery",
    scenario_version: "2",
    expected_action: "skip",
    applicable_node_ids: ["node-harm"],
    applicable_candidate_ids: [],
    distractor_node_ids: [],
    distractor_candidate_ids: [],
    scope_validity: { valid: true, reason_code: "scope_matches" },
    safety_constraints: ["production_feedback_only"],
    deterministic_success_checks: ["harm_observed", "fresh_recheck_succeeds"],
    known_old_mistake_path: "repeat_harmful_guidance",
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    decision_opportunities: [
      {
        opportunity_id: "harm-exposure",
        ordinal: 1,
        expected_action: "inject",
        plausible_node_ids: ["node-harm"],
        plausible_candidate_ids: [],
        candidate_consideration_required: true,
        valid_skip_reason_codes: [],
        requires_prior_harm: false,
        known_old_mistake_path: "repeat_harmful_guidance"
      },
      {
        opportunity_id: "recovery-recheck",
        ordinal: 2,
        expected_action: "skip",
        plausible_node_ids: ["node-harm"],
        plausible_candidate_ids: [],
        candidate_consideration_required: false,
        valid_skip_reason_codes: ["no_candidate", "recent_harm_or_quarantined"],
        requires_prior_harm: true,
        known_old_mistake_path: "repeat_harmful_guidance"
      }
    ],
    ground_truth_digest: ""
  } satisfies BenchmarkGroundTruthV2, "ground_truth_digest");

const v2Observation = (input: {
  blockId: string;
  arm: MatchedBlockArm;
  opportunities: BenchmarkDecisionOpportunityScoringObservation[];
  taskSuccess?: 0 | 1;
}): BenchmarkArmScoringObservationV2 => {
  const delivered = input.opportunities.reduce(
    (sum, opportunity) => sum + opportunity.delivered_intervention_count,
    0
  );
  const helped = input.opportunities.reduce(
    (sum, opportunity) => sum + opportunity.helped_intervention_count,
    0
  );
  const harmed = input.opportunities.reduce(
    (sum, opportunity) => sum + opportunity.harmed_intervention_count,
    0
  );
  const uncertain = input.opportunities.reduce(
    (sum, opportunity) => sum + opportunity.uncertain_intervention_count,
    0
  );
  return withV2ObservationDigest({
    observation_schema_version: BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2,
    block_id: input.blockId,
    arm: input.arm,
    decision: input.opportunities.at(-1)!.decision,
    decision_opportunity_count: input.opportunities.length,
    delivered_intervention_count: delivered,
    helped_intervention_count: helped,
    harmed_intervention_count: harmed,
    uncertain_intervention_count: uncertain,
    task_success: input.taskSuccess ?? 1,
    repeated_old_mistake_avoided: 1,
    provider_cost: null,
    total_token_count: null,
    wall_clock_duration_ms: 1000,
    tool_call_count: 1,
    decision_opportunities: input.opportunities
  });
};

const skipOpportunity = (input: {
  decision?: "skip" | "inject";
  delivered?: 0 | 1;
  considered?: string[];
  rejected?: string[];
  skipReason?: string | null;
  wouldHaveDelivered?: boolean | null;
} = {}): BenchmarkDecisionOpportunityScoringObservation => {
  const delivered = input.delivered ?? 0;
  return withOpportunityDigest({
    opportunity_id: "skip-check",
    ordinal: 1,
    decision: input.decision ?? "skip",
    would_have_delivered: input.wouldHaveDelivered ?? false,
    delivered_intervention_count: delivered,
    helped_intervention_count: 0,
    harmed_intervention_count: 0,
    uncertain_intervention_count: delivered,
    considered_candidate_ids: input.considered ?? ["node-distractor"],
    selected_candidate_ids: [],
    rejected_candidate_ids: input.rejected ?? ["node-distractor"],
    governance_excluded_node_ids: [],
    skip_reason_code: input.skipReason === undefined ? "applicability_mismatch" : input.skipReason,
    task_success: 1,
    skipped_guidance_required: false,
    authoritative_harm_evidence_id: null,
    governance_transition: null
  });
};

describe("matched-block campaign scoring and publication gate", () => {
  it("scores only complete blocks with treatment-vs-control paired deltas", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertCompleteBlock({ fixture });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: observationsForBlock(fixture.block.block_id),
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-16T08:03:00.000Z"
    });

    expect(result.campaign_scorecard.scorecard).toMatchObject({
      delivery_rate: 1,
      net_helpful_intervention_rate: 1,
      helpful_rate: 1,
      harmful_rate: 0,
      uncertain_rate: 0,
      task_success_delta: 1,
      repeated_old_mistake_avoidance_delta: 1,
      provider_cost: 0.03,
      experienceengine_token_overhead: 300,
      wall_clock_latency_delta: -300,
      tool_call_delta: -3,
      infrastructure_failure_rate: 0
    });
    expect(result.campaign_scorecard.pairwise_deltas.task_success).toEqual({
      treatment_minus_forced_holdout: 1,
      treatment_minus_no_ee: 1,
      forced_holdout_minus_no_ee: 0
    });
    expect(result.campaign_scorecard.confusion_matrix["inject:inject"]).toBe(1);
    expect(result.campaign_scorecard.confidence_intervals
      .task_success_treatment_minus_no_ee).toMatchObject({
        point_estimate: 1,
        lower_95: null,
        upper_95: null,
        cluster_count: 1
    });
    expect(result.campaign_scorecard).not.toHaveProperty("decision_opportunity_metrics");
    expect(result.publication_decision.decision).toBe("publishable");
    expect(fixture.store.getPublicationDecision(fixture.campaign.benchmark_campaign_id)).toEqual(
      result.publication_decision
    );
    fixture.store.close();
  });

  it("marks incomparable provider cost and token overhead unavailable instead of estimating", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertCompleteBlock({ fixture });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: observationsForBlock(fixture.block.block_id, {
        treatment: { provider_cost: null, total_token_count: null },
        no_ee: { provider_cost: null, total_token_count: null }
      }),
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-16T08:03:00.000Z",
      persistDecision: false
    });
    expect(result.campaign_scorecard.scorecard.provider_cost).toBeNull();
    expect(result.campaign_scorecard.scorecard.experienceengine_token_overhead).toBeNull();
    fixture.store.close();
  });

  it("counts a v2 skip only when a declared distractor was considered and validly rejected", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite"),
      benchmarkProtocolVersion: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      groundTruth: buildSkipGroundTruthV2()
    });
    insertCompleteBlock({ fixture });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: [
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "treatment",
          opportunities: [skipOpportunity()]
        }),
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "forced_holdout",
          opportunities: [skipOpportunity({
            decision: "inject",
            delivered: 0,
            rejected: [],
            skipReason: null,
            wouldHaveDelivered: true
          })]
        }),
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "no_ee",
          opportunities: [skipOpportunity({
            considered: [],
            rejected: [],
            skipReason: null,
            wouldHaveDelivered: null
          })]
        })
      ],
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-17T08:03:00.000Z",
      persistDecision: false
    });

    expect(result.campaign_scorecard.scorecard).toMatchObject({
      delivery_rate: 0,
      correct_skip_rate: 1,
      false_positive_injection_rate: 0
    });
    expect(result.campaign_scorecard.confusion_matrix["skip:skip"]).toBe(1);
    expect(result.campaign_scorecard.decision_opportunity_metrics).toEqual({
      correct_skip_evidence_coverage: 1
    });
    fixture.store.close();
  });

  it("does not count an empty retrieval as a correct skip", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite"),
      benchmarkProtocolVersion: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      groundTruth: buildSkipGroundTruthV2()
    });
    insertCompleteBlock({ fixture });
    const emptySkip = skipOpportunity({
      considered: [],
      rejected: [],
      skipReason: null
    });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: (["treatment", "forced_holdout", "no_ee"] as const).map((arm) =>
        v2Observation({
          blockId: fixture.block.block_id,
          arm,
          opportunities: [emptySkip]
        })
      ),
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-17T08:03:00.000Z",
      persistDecision: false
    });

    expect(result.campaign_scorecard.scorecard.correct_skip_rate).toBe(0);
    expect(result.campaign_scorecard.scorecard.false_positive_injection_rate).toBe(0);
    expect(result.campaign_scorecard.decision_opportunity_metrics).toEqual({
      correct_skip_evidence_coverage: 0
    });
    fixture.store.close();
  });

  it("counts actual treatment delivery on a skip label as a false positive", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite"),
      benchmarkProtocolVersion: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      groundTruth: buildSkipGroundTruthV2()
    });
    insertCompleteBlock({ fixture });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: [
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "treatment",
          opportunities: [skipOpportunity({
            decision: "inject",
            delivered: 1,
            rejected: [],
            skipReason: null,
            wouldHaveDelivered: true
          })]
        }),
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "forced_holdout",
          opportunities: [skipOpportunity({
            decision: "inject",
            delivered: 0,
            rejected: [],
            skipReason: null,
            wouldHaveDelivered: true
          })]
        }),
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "no_ee",
          opportunities: [skipOpportunity({
            considered: [],
            rejected: [],
            skipReason: null,
            wouldHaveDelivered: null
          })]
        })
      ],
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-17T08:03:00.000Z",
      persistDecision: false
    });

    expect(result.campaign_scorecard.scorecard).toMatchObject({
      delivery_rate: 1,
      correct_skip_rate: 0,
      false_positive_injection_rate: 1
    });
    expect(result.campaign_scorecard.confusion_matrix["skip:inject"]).toBe(1);
    fixture.store.close();
  });

  it("uses opportunity denominators while keeping one task-trial delta per block", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite"),
      benchmarkProtocolVersion: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      groundTruth: buildSkipGroundTruthV2({ includeInjectOpportunity: true })
    });
    insertCompleteBlock({ fixture });
    const injectOpportunity = withOpportunityDigest({
      opportunity_id: "initial-inject",
      ordinal: 1,
      decision: "inject",
      would_have_delivered: true,
      delivered_intervention_count: 1,
      helped_intervention_count: 1,
      harmed_intervention_count: 0,
      uncertain_intervention_count: 0,
      considered_candidate_ids: ["node-distractor"],
      selected_candidate_ids: ["node-distractor"],
      rejected_candidate_ids: [],
      governance_excluded_node_ids: [],
      skip_reason_code: null,
      task_success: 1,
      skipped_guidance_required: null,
      authoritative_harm_evidence_id: null,
      governance_transition: null
    });
    const { evidence_digest: _skipDigest, ...skipBase } = skipOpportunity();
    const finalSkip = withOpportunityDigest({
      ...skipBase,
      opportunity_id: "skip-check",
      ordinal: 2
    });
    const { evidence_digest: _injectDigest, ...injectBase } = injectOpportunity;
    const noEeInject = withOpportunityDigest({
      ...injectBase,
      decision: "skip",
      would_have_delivered: null,
      delivered_intervention_count: 0,
      helped_intervention_count: 0,
      selected_candidate_ids: [],
      considered_candidate_ids: [],
      task_success: 0
    });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: [
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "treatment",
          opportunities: [injectOpportunity, finalSkip]
        }),
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "forced_holdout",
          opportunities: [noEeInject, finalSkip]
        }),
        v2Observation({
          blockId: fixture.block.block_id,
          arm: "no_ee",
          opportunities: [noEeInject, finalSkip],
          taskSuccess: 0
        })
      ],
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-17T08:03:00.000Z",
      persistDecision: false
    });

    expect(result.campaign_scorecard.scorecard.delivery_rate).toBe(0.5);
    expect(result.campaign_scorecard.confusion_matrix).toMatchObject({
      "inject:inject": 1,
      "skip:skip": 1
    });
    expect(result.campaign_scorecard.pairwise_deltas.task_success.treatment_minus_no_ee).toBe(1);
    fixture.store.close();
  });

  it("scores harm recovery only after authoritative production harm and non-live exclusion", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite"),
      benchmarkProtocolVersion: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      groundTruth: buildHarmRecoveryGroundTruthV2()
    });
    insertCompleteBlock({ fixture });
    const transition = withGovernanceTransitionDigest({
      node_id: "node-harm",
      before_delivery_state: "conservative_only",
      after_delivery_state: "quarantined",
      authority_source: "production_runtime",
      transition_evidence_id: "review-harm"
    });
    const treatment = v2Observation({
      blockId: fixture.block.block_id,
      arm: "treatment",
      opportunities: [
        withOpportunityDigest({
          opportunity_id: "harm-exposure",
          ordinal: 1,
          decision: "conservative",
          would_have_delivered: true,
          delivered_intervention_count: 1,
          helped_intervention_count: 0,
          harmed_intervention_count: 1,
          uncertain_intervention_count: 0,
          considered_candidate_ids: ["node-harm"],
          selected_candidate_ids: ["node-harm"],
          rejected_candidate_ids: [],
          governance_excluded_node_ids: [],
          skip_reason_code: null,
          task_success: 0,
          skipped_guidance_required: null,
          authoritative_harm_evidence_id: "attribution-harm",
          governance_transition: transition
        }),
        withOpportunityDigest({
          opportunity_id: "recovery-recheck",
          ordinal: 2,
          decision: "skip",
          would_have_delivered: false,
          delivered_intervention_count: 0,
          helped_intervention_count: 0,
          harmed_intervention_count: 0,
          uncertain_intervention_count: 0,
          considered_candidate_ids: [],
          selected_candidate_ids: [],
          rejected_candidate_ids: [],
          governance_excluded_node_ids: ["node-harm"],
          skip_reason_code: "no_candidate",
          task_success: 1,
          skipped_guidance_required: false,
          authoritative_harm_evidence_id: null,
          governance_transition: null
        })
      ]
    });
    const controls = (["forced_holdout", "no_ee"] as const).map((arm) =>
      v2Observation({
        blockId: fixture.block.block_id,
        arm,
        opportunities: [
          withOpportunityDigest({
            opportunity_id: "harm-exposure",
            ordinal: 1,
            decision: arm === "forced_holdout" ? "conservative" : "skip",
            would_have_delivered: arm === "forced_holdout" ? true : null,
            delivered_intervention_count: 0,
            helped_intervention_count: 0,
            harmed_intervention_count: 0,
            uncertain_intervention_count: 0,
            considered_candidate_ids: arm === "forced_holdout" ? ["node-harm"] : [],
            selected_candidate_ids: arm === "forced_holdout" ? ["node-harm"] : [],
            rejected_candidate_ids: [],
            governance_excluded_node_ids: [],
            skip_reason_code: arm === "forced_holdout" ? null : "no_candidate",
            task_success: 1,
            skipped_guidance_required: null,
            authoritative_harm_evidence_id: null,
            governance_transition: null
          }),
          withOpportunityDigest({
            opportunity_id: "recovery-recheck",
            ordinal: 2,
            decision: "skip",
            would_have_delivered: false,
            delivered_intervention_count: 0,
            helped_intervention_count: 0,
            harmed_intervention_count: 0,
            uncertain_intervention_count: 0,
            considered_candidate_ids: [],
            selected_candidate_ids: [],
            rejected_candidate_ids: [],
            governance_excluded_node_ids: [],
            skip_reason_code: "no_candidate",
            task_success: 1,
            skipped_guidance_required: false,
            authoritative_harm_evidence_id: null,
            governance_transition: null
          })
        ]
      })
    );
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: [treatment, ...controls],
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-17T08:03:00.000Z",
      persistDecision: false
    });

    expect(result.campaign_scorecard.scorecard).toMatchObject({
      delivery_rate: 0.5,
      harmful_rate: 1,
      correct_skip_rate: 1,
      false_positive_injection_rate: 0
    });
    expect(result.campaign_scorecard.harm_recovery_metrics).toEqual({
      opportunity_count: 1,
      success_count: 1,
      recovery_rate: 1
    });
    expect(result.campaign_scorecard.decision_opportunity_metrics).toEqual({
      correct_skip_evidence_coverage: 1
    });
    const markdown = renderMatchedBlockCampaignMarkdown({
      evidence_mode: "matched_block_campaign",
      diagnostic_single_arm_reused: false,
      campaign_database_name: "campaign.sqlite",
      observations_file_name: "observations.json",
      generated_at: "2026-07-17T08:03:00.000Z",
      result
    });
    expect(markdown).toContain("## Harm Recovery Evidence");
    expect(markdown).toContain("- recovery_rate: `1`");

    const recovery = treatment.decision_opportunities[1]!;
    const { evidence_digest: _recoveryDigest, ...recoveryBase } = recovery;
    const repeatedDelivery = withOpportunityDigest({
      ...recoveryBase,
      decision: "inject",
      would_have_delivered: true,
      delivered_intervention_count: 1,
      harmed_intervention_count: 1,
      governance_excluded_node_ids: [],
      skip_reason_code: null,
      task_success: 0,
      skipped_guidance_required: null,
      authoritative_harm_evidence_id: "attribution-repeat-harm"
    });
    const repeatedTreatment = v2Observation({
      blockId: fixture.block.block_id,
      arm: "treatment",
      opportunities: [treatment.decision_opportunities[0]!, repeatedDelivery],
      taskSuccess: 0
    });
    const repeatedResult = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: [repeatedTreatment, ...controls],
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-17T08:04:00.000Z",
      persistDecision: false
    });
    expect(repeatedResult.campaign_scorecard.harm_recovery_metrics).toEqual({
      opportunity_count: 1,
      success_count: 0,
      recovery_rate: 0
    });
    expect(repeatedResult.campaign_scorecard.scorecard).toMatchObject({
      correct_skip_rate: 0,
      false_positive_injection_rate: 1
    });
    fixture.store.close();
  });

  it("fails harm recovery when transition authority is not production-owned", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite"),
      benchmarkProtocolVersion: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      groundTruth: buildHarmRecoveryGroundTruthV2()
    });
    insertCompleteBlock({ fixture });
    const invalidTransition = withGovernanceTransitionDigest({
      node_id: "node-harm",
      before_delivery_state: "conservative_only",
      after_delivery_state: "quarantined",
      authority_source: "benchmark_fixture" as never,
      transition_evidence_id: "manual-transition"
    });
    const invalidExposure = withOpportunityDigest({
      opportunity_id: "harm-exposure",
      ordinal: 1,
      decision: "conservative",
      would_have_delivered: true,
      delivered_intervention_count: 1,
      helped_intervention_count: 0,
      harmed_intervention_count: 1,
      uncertain_intervention_count: 0,
      considered_candidate_ids: ["node-harm"],
      selected_candidate_ids: ["node-harm"],
      rejected_candidate_ids: [],
      governance_excluded_node_ids: [],
      skip_reason_code: null,
      task_success: 0,
      skipped_guidance_required: null,
      authoritative_harm_evidence_id: "attribution-harm",
      governance_transition: invalidTransition
    });
    const recovery = withOpportunityDigest({
      opportunity_id: "recovery-recheck",
      ordinal: 2,
      decision: "skip",
      would_have_delivered: false,
      delivered_intervention_count: 0,
      helped_intervention_count: 0,
      harmed_intervention_count: 0,
      uncertain_intervention_count: 0,
      considered_candidate_ids: [],
      selected_candidate_ids: [],
      rejected_candidate_ids: [],
      governance_excluded_node_ids: ["node-harm"],
      skip_reason_code: "no_candidate",
      task_success: 1,
      skipped_guidance_required: false,
      authoritative_harm_evidence_id: null,
      governance_transition: null
    });
    const observation = v2Observation({
      blockId: fixture.block.block_id,
      arm: "treatment",
      opportunities: [invalidExposure, recovery]
    });
    try {
      expect(() => scoreMatchedBlockCampaign({
        store: fixture.store,
        campaignId: fixture.campaign.benchmark_campaign_id,
        observations: [
          observation,
          v2Observation({
            blockId: fixture.block.block_id,
            arm: "forced_holdout",
            opportunities: [invalidExposure, recovery]
          }),
          v2Observation({
            blockId: fixture.block.block_id,
            arm: "no_ee",
            opportunities: [invalidExposure, recovery]
          })
        ],
        negativeResultDisclosureIncluded: true,
        createdAt: "2026-07-17T08:03:00.000Z",
        persistDecision: false
      })).toThrow("authority_source must be production_runtime");
    } finally {
      fixture.store.close();
    }
  });

  it("rejects v2 aggregate drift and opportunity-set drift", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite"),
      benchmarkProtocolVersion: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      groundTruth: buildSkipGroundTruthV2()
    });
    insertCompleteBlock({ fixture });
    const valid = v2Observation({
      blockId: fixture.block.block_id,
      arm: "treatment",
      opportunities: [skipOpportunity()]
    });
    const controls = (["forced_holdout", "no_ee"] as const).map((arm) =>
      v2Observation({
        blockId: fixture.block.block_id,
        arm,
        opportunities: [skipOpportunity()]
      })
    );

    try {
      expect(() => scoreMatchedBlockCampaign({
        store: fixture.store,
        campaignId: fixture.campaign.benchmark_campaign_id,
        observations: [{
          ...valid,
          delivered_intervention_count: 1,
          uncertain_intervention_count: 1
        }, ...controls],
        negativeResultDisclosureIncluded: true,
        createdAt: "2026-07-17T08:03:00.000Z",
        persistDecision: false
      })).toThrow("does not match its opportunity records");

      const [opportunity] = valid.decision_opportunities;
      const { evidence_digest: _digest, ...opportunityBase } = opportunity!;
      const wrongOpportunity = withOpportunityDigest({
        ...opportunityBase,
        opportunity_id: "undeclared-opportunity"
      });
      const { observation_digest: _observationDigest, ...validBase } = valid;
      const wrongSet = withV2ObservationDigest({
        ...validBase,
        decision_opportunities: [wrongOpportunity]
      });
      expect(() => scoreMatchedBlockCampaign({
        store: fixture.store,
        campaignId: fixture.campaign.benchmark_campaign_id,
        observations: [wrongSet, ...controls],
        negativeResultDisclosureIncluded: true,
        createdAt: "2026-07-17T08:03:00.000Z",
        persistDecision: false
      })).toThrow("does not match sealed ground truth");
    } finally {
      fixture.store.close();
    }
  });

  it("counts invalid original attempts in reliability and excludes them from efficacy", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertAttempt({
      store: fixture.store,
      block: fixture.block,
      plans: fixture.armPlans,
      arm: "treatment",
      status: "infrastructure_failed",
      infrastructureCode: "BENCH_PROVIDER_UNAVAILABLE"
    });
    for (const arm of ["forced_holdout", "no_ee"] as const) {
      insertAttempt({ store: fixture.store, block: fixture.block, plans: fixture.armPlans, arm });
    }
    const replacement = createWholeBlockReplacement({
      store: fixture.store,
      originalBlockId: fixture.block.block_id,
      replacementBlockId: "block-score-replacement",
      randomizationSeed: "score-replacement-seed",
      reasonCode: "BENCH_PROVIDER_UNAVAILABLE",
      approvedBy: "benchmark-operator",
      createdAt: "2026-07-16T08:03:00.000Z"
    });
    insertCompleteBlock({
      fixture,
      block: replacement.manifest,
      plans: replacement.armPlans
    });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: observationsForBlock(replacement.manifest.block_id),
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-16T08:04:00.000Z",
      persistDecision: false
    });
    expect(result.campaign_scorecard.complete_block_ids).toEqual([replacement.manifest.block_id]);
    expect(result.campaign_scorecard.excluded_block_ids).toContain(fixture.block.block_id);
    expect(result.campaign_scorecard.attempted_arm_count).toBe(6);
    expect(result.campaign_scorecard.scorecard.infrastructure_failure_rate).toBeCloseTo(1 / 6);
    expect(result.campaign_scorecard.complete_block_coverage).toBe(0.5);
    expect(result.publication_decision.decision).toBe("not_publishable");
    expect(result.publication_decision.threshold_results.minimum_complete_block_coverage).toBe(false);
    fixture.store.close();
  });

  it("returns incomplete until every planned block has a terminal disposition", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    const result = scoreMatchedBlockCampaign({
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: [],
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-16T08:03:00.000Z",
      persistDecision: false
    });
    expect(result.publication_decision.decision).toBe("incomplete");
    fixture.store.close();
  });

  it("refuses to overwrite an immutable publication decision", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertCompleteBlock({ fixture });
    const options = {
      store: fixture.store,
      campaignId: fixture.campaign.benchmark_campaign_id,
      observations: observationsForBlock(fixture.block.block_id),
      negativeResultDisclosureIncluded: true,
      createdAt: "2026-07-16T08:03:00.000Z"
    } as const;
    scoreMatchedBlockCampaign(options);
    expect(() => scoreMatchedBlockCampaign(options)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_RECORD_CONFLICT" })
    );
    fixture.store.close();
  });
});
