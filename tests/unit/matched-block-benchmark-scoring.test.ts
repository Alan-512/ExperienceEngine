import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MATCHED_BLOCK_SCHEMA_VERSIONS } from "../../src/evaluation/matched-block/constants.js";
import {
  appendMatchedBlockDisposition,
  createWholeBlockReplacement
} from "../../src/evaluation/matched-block/failure-protocol.js";
import {
  scoreMatchedBlockCampaign,
  type BenchmarkArmScoringObservation
} from "../../src/evaluation/matched-block/scoring.js";
import type {
  BenchmarkAttemptExecutionStatus,
  BenchmarkFormalAttempt,
  BenchmarkInfrastructureFailureCode,
  MatchedBlockArm,
  MatchedBlockArmPlan,
  MatchedBlockManifest
} from "../../src/evaluation/matched-block/types.js";
import {
  createMatchedBlockHarnessStoreFixture,
  MATCHED_BLOCK_TEST_CREATED_AT
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
  overrides: Partial<Record<MatchedBlockArm, Partial<BenchmarkArmScoringObservation>>> = {}
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
