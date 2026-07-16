import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import {
  BENCHMARK_CONFUSION_MATRIX_CELLS,
  BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS,
  MATCHED_BLOCK_ARMS,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "./constants.js";
import { MatchedBlockBenchmarkStore } from "./store.js";
import type {
  BenchmarkDecision,
  BenchmarkExpectedAction,
  BenchmarkMinimumPublicScorecard,
  BenchmarkPublicationDecision,
  BenchmarkPublicScorecardField,
  MatchedBlockArm
} from "./types.js";

export type BenchmarkArmScoringObservation = {
  block_id: string;
  arm: MatchedBlockArm;
  decision: BenchmarkDecision;
  decision_opportunity_count: 1;
  delivered_intervention_count: number;
  helped_intervention_count: number;
  harmed_intervention_count: number;
  uncertain_intervention_count: number;
  task_success: 0 | 1;
  repeated_old_mistake_avoided: 0 | 1 | null;
  provider_cost: number | null;
  total_token_count: number | null;
  wall_clock_duration_ms: number;
  tool_call_count: number;
  observation_digest: string;
};

export type BenchmarkPairwiseDelta = {
  treatment_minus_forced_holdout: number | null;
  treatment_minus_no_ee: number | null;
  forced_holdout_minus_no_ee: number | null;
};

export type BenchmarkConfidenceInterval = {
  method: "scenario_cluster_normal_95_v1";
  point_estimate: number | null;
  lower_95: number | null;
  upper_95: number | null;
  cluster_count: number;
};

export type BenchmarkCampaignScorecard = {
  benchmark_campaign_id: string;
  scorecard: BenchmarkMinimumPublicScorecard;
  pairwise_deltas: {
    task_success: BenchmarkPairwiseDelta;
    repeated_old_mistake_avoidance: BenchmarkPairwiseDelta;
    wall_clock_latency_ms: BenchmarkPairwiseDelta;
    tool_calls: BenchmarkPairwiseDelta;
    total_tokens: BenchmarkPairwiseDelta;
  };
  confidence_intervals: {
    task_success_treatment_minus_no_ee: BenchmarkConfidenceInterval;
    repeated_old_mistake_avoidance_treatment_minus_no_ee: BenchmarkConfidenceInterval;
  };
  confusion_matrix: Record<string, number>;
  complete_block_ids: string[];
  excluded_block_ids: string[];
  complete_block_coverage: number;
  infrastructure_reliability: number;
  attempted_arm_count: number;
  evidence_digest: string;
};

export type ScoreBenchmarkCampaignOptions = {
  store: MatchedBlockBenchmarkStore;
  campaignId: string;
  observations: BenchmarkArmScoringObservation[];
  negativeResultDisclosureIncluded: boolean;
  createdAt: string;
  persistDecision?: boolean;
};

export type ScoreBenchmarkCampaignResult = {
  campaign_scorecard: BenchmarkCampaignScorecard;
  publication_decision: BenchmarkPublicationDecision;
};

export class MatchedBlockScoringError extends Error {
  constructor(
    readonly code:
      | "BENCHMARK_SCORING_INPUT_INVALID"
      | "BENCHMARK_SCORING_OBSERVATION_MISSING"
      | "BENCHMARK_PUBLICATION_PLAN_MISSING",
    message: string
  ) {
    super(message);
    this.name = "MatchedBlockScoringError";
  }
}

const fail = (
  code: MatchedBlockScoringError["code"],
  message: string
): never => {
  throw new MatchedBlockScoringError(code, message);
};

const assertFiniteNonNegative = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${field} must be finite and non-negative.`);
  }
};

const validateObservation = (observation: BenchmarkArmScoringObservation): void => {
  if (observation.decision_opportunity_count !== 1) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "Each formal task trial contributes exactly one decision opportunity."
    );
  }
  for (const field of [
    "delivered_intervention_count",
    "helped_intervention_count",
    "harmed_intervention_count",
    "uncertain_intervention_count",
    "wall_clock_duration_ms",
    "tool_call_count"
  ] as const) {
    assertFiniteNonNegative(observation[field], field);
  }
  if (
    observation.helped_intervention_count +
      observation.harmed_intervention_count +
      observation.uncertain_intervention_count !==
    observation.delivered_intervention_count
  ) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "Delivered intervention outcomes must be exhaustive and mutually exclusive."
    );
  }
  for (const [field, value] of [
    ["provider_cost", observation.provider_cost],
    ["total_token_count", observation.total_token_count]
  ] as const) {
    if (value !== null) {
      assertFiniteNonNegative(value, field);
    }
  }
  if (observation.observation_digest.trim().length === 0) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", "observation_digest must be non-empty.");
  }
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const rate = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

const subtractNullable = (left: number | null, right: number | null): number | null =>
  left === null || right === null ? null : left - right;

const buildPairwiseDelta = (
  values: Record<MatchedBlockArm, number | null>
): BenchmarkPairwiseDelta => ({
  treatment_minus_forced_holdout: subtractNullable(
    values.treatment,
    values.forced_holdout
  ),
  treatment_minus_no_ee: subtractNullable(values.treatment, values.no_ee),
  forced_holdout_minus_no_ee: subtractNullable(values.forced_holdout, values.no_ee)
});

const averagePairwise = (values: BenchmarkPairwiseDelta[]): BenchmarkPairwiseDelta => ({
  treatment_minus_forced_holdout: mean(values.flatMap((value) =>
    value.treatment_minus_forced_holdout === null ? [] : [value.treatment_minus_forced_holdout]
  )),
  treatment_minus_no_ee: mean(values.flatMap((value) =>
    value.treatment_minus_no_ee === null ? [] : [value.treatment_minus_no_ee]
  )),
  forced_holdout_minus_no_ee: mean(values.flatMap((value) =>
    value.forced_holdout_minus_no_ee === null ? [] : [value.forced_holdout_minus_no_ee]
  ))
});

const confidenceInterval = (
  scenarioClusterValues: number[]
): BenchmarkConfidenceInterval => {
  const pointEstimate = mean(scenarioClusterValues);
  if (pointEstimate === null || scenarioClusterValues.length < 2) {
    return {
      method: "scenario_cluster_normal_95_v1",
      point_estimate: pointEstimate,
      lower_95: null,
      upper_95: null,
      cluster_count: scenarioClusterValues.length
    };
  }
  const variance = scenarioClusterValues.reduce(
    (sum, value) => sum + ((value - pointEstimate) ** 2),
    0
  ) / (scenarioClusterValues.length - 1);
  const margin = 1.96 * Math.sqrt(variance / scenarioClusterValues.length);
  return {
    method: "scenario_cluster_normal_95_v1",
    point_estimate: pointEstimate,
    lower_95: pointEstimate - margin,
    upper_95: pointEstimate + margin,
    cluster_count: scenarioClusterValues.length
  };
};

const metricDirection: Record<BenchmarkPublicScorecardField, "minimum" | "maximum"> = {
  delivery_rate: "minimum",
  net_helpful_intervention_rate: "minimum",
  helpful_rate: "minimum",
  harmful_rate: "maximum",
  uncertain_rate: "maximum",
  task_success_delta: "minimum",
  repeated_old_mistake_avoidance_delta: "minimum",
  correct_skip_rate: "minimum",
  false_positive_injection_rate: "maximum",
  provider_cost: "maximum",
  experienceengine_token_overhead: "maximum",
  wall_clock_latency_delta: "maximum",
  tool_call_delta: "maximum",
  infrastructure_failure_rate: "maximum"
};

const expectedDecisionCell = (
  expected: BenchmarkExpectedAction,
  decision: BenchmarkDecision
): string => `${expected}:${decision}`;

export const scoreMatchedBlockCampaign = (
  options: ScoreBenchmarkCampaignOptions
): ScoreBenchmarkCampaignResult => {
  const plan = options.store.getPublicationPlan(options.campaignId) ?? fail(
    "BENCHMARK_PUBLICATION_PLAN_MISSING",
    `Campaign ${options.campaignId} has no sealed publication plan.`
  );
  const blocks = options.store.listBlockManifests(options.campaignId);
  const attempts = options.store.listCampaignFormalAttempts(options.campaignId);
  const observationsByKey = new Map<string, BenchmarkArmScoringObservation>();
  for (const observation of options.observations) {
    validateObservation(observation);
    const key = `${observation.block_id}:${observation.arm}`;
    if (observationsByKey.has(key)) {
      fail("BENCHMARK_SCORING_INPUT_INVALID", `Duplicate scoring observation ${key}.`);
    }
    observationsByKey.set(key, observation);
  }

  const completeBlocks = blocks.filter(
    (block) => options.store.getBlockDisposition(block.block_id)?.disposition === "complete"
  );
  const excludedBlocks = blocks.filter(
    (block) => options.store.getBlockDisposition(block.block_id)?.disposition !== "complete"
  );
  const missingDisposition = blocks.some(
    (block) => !options.store.getBlockDisposition(block.block_id)
  );
  const blockObservations = completeBlocks.map((block) => {
    const byArm = Object.fromEntries(MATCHED_BLOCK_ARMS.map((arm) => {
      const attempt = options.store.getFormalAttempt(block.block_id, arm);
      if (!attempt || attempt.execution_status !== "completed") {
        fail(
          "BENCHMARK_SCORING_OBSERVATION_MISSING",
          `Complete block ${block.block_id} lacks a completed ${arm} attempt.`
        );
      }
      const observation = observationsByKey.get(`${block.block_id}:${arm}`) ?? fail(
        "BENCHMARK_SCORING_OBSERVATION_MISSING",
        `Complete block ${block.block_id} lacks a ${arm} scoring observation.`
      );
      return [arm, observation];
    })) as Record<MatchedBlockArm, BenchmarkArmScoringObservation>;
    const scenario = options.store.getScenarioManifest(block.scenario_id, block.scenario_version) ??
      fail("BENCHMARK_SCORING_INPUT_INVALID", "Complete block scenario is missing.");
    const groundTruth = options.store.getGroundTruth(block.ground_truth_id) ??
      fail("BENCHMARK_SCORING_INPUT_INVALID", "Complete block ground truth is missing.");
    return { block, byArm, scenario, groundTruth };
  });

  const taskSuccessDeltas = blockObservations.map(({ byArm }) => buildPairwiseDelta({
    treatment: byArm.treatment.task_success,
    forced_holdout: byArm.forced_holdout.task_success,
    no_ee: byArm.no_ee.task_success
  }));
  const avoidanceDeltas = blockObservations.map(({ byArm }) => buildPairwiseDelta({
    treatment: byArm.treatment.repeated_old_mistake_avoided,
    forced_holdout: byArm.forced_holdout.repeated_old_mistake_avoided,
    no_ee: byArm.no_ee.repeated_old_mistake_avoided
  }));
  const latencyDeltas = blockObservations.map(({ byArm }) => buildPairwiseDelta({
    treatment: byArm.treatment.wall_clock_duration_ms,
    forced_holdout: byArm.forced_holdout.wall_clock_duration_ms,
    no_ee: byArm.no_ee.wall_clock_duration_ms
  }));
  const toolDeltas = blockObservations.map(({ byArm }) => buildPairwiseDelta({
    treatment: byArm.treatment.tool_call_count,
    forced_holdout: byArm.forced_holdout.tool_call_count,
    no_ee: byArm.no_ee.tool_call_count
  }));
  const tokenDeltas = blockObservations.map(({ byArm }) => buildPairwiseDelta({
    treatment: byArm.treatment.total_token_count,
    forced_holdout: byArm.forced_holdout.total_token_count,
    no_ee: byArm.no_ee.total_token_count
  }));

  const treatment = blockObservations.map(({ byArm }) => byArm.treatment);
  const delivered = treatment.reduce(
    (sum, observation) => sum + observation.delivered_intervention_count,
    0
  );
  const helped = treatment.reduce(
    (sum, observation) => sum + observation.helped_intervention_count,
    0
  );
  const harmed = treatment.reduce(
    (sum, observation) => sum + observation.harmed_intervention_count,
    0
  );
  const uncertain = treatment.reduce(
    (sum, observation) => sum + observation.uncertain_intervention_count,
    0
  );
  const skipBlocks = blockObservations.filter(
    ({ groundTruth }) => groundTruth.expected_action === "skip"
  );
  const correctSkips = skipBlocks.filter(({ byArm }) =>
    byArm.treatment.decision === "skip" &&
    byArm.treatment.task_success === 1 &&
    byArm.treatment.repeated_old_mistake_avoided !== 0
  ).length;
  const falsePositiveInjections = skipBlocks.filter(
    ({ byArm }) => byArm.treatment.delivered_intervention_count > 0
  ).length;
  const allTreatmentCosts = treatment.map((observation) => observation.provider_cost);
  const providerCost = allTreatmentCosts.every((value) => value !== null)
    ? mean(allTreatmentCosts as number[])
    : null;
  const tokenPairwise = averagePairwise(tokenDeltas);
  const taskPairwise = averagePairwise(taskSuccessDeltas);
  const avoidancePairwise = averagePairwise(avoidanceDeltas);
  const latencyPairwise = averagePairwise(latencyDeltas);
  const toolPairwise = averagePairwise(toolDeltas);
  const infrastructureFailureCount = attempts.filter(
    (attempt) => attempt.execution_status !== "completed"
  ).length;
  const infrastructureFailureRate = rate(infrastructureFailureCount, attempts.length) ?? 0;
  const scorecard: BenchmarkMinimumPublicScorecard = {
    delivery_rate: rate(delivered, treatment.length),
    net_helpful_intervention_rate: delivered === 0 ? null : (helped - harmed) / delivered,
    helpful_rate: rate(helped, delivered),
    harmful_rate: rate(harmed, delivered),
    uncertain_rate: rate(uncertain, delivered),
    task_success_delta: taskPairwise.treatment_minus_no_ee,
    repeated_old_mistake_avoidance_delta: avoidancePairwise.treatment_minus_no_ee,
    correct_skip_rate: rate(correctSkips, skipBlocks.length),
    false_positive_injection_rate: rate(falsePositiveInjections, skipBlocks.length),
    provider_cost: providerCost,
    experienceengine_token_overhead: tokenPairwise.treatment_minus_no_ee,
    wall_clock_latency_delta: latencyPairwise.treatment_minus_no_ee,
    tool_call_delta: toolPairwise.treatment_minus_no_ee,
    infrastructure_failure_rate: infrastructureFailureRate
  };
  const confusionMatrix = Object.fromEntries(
    BENCHMARK_CONFUSION_MATRIX_CELLS.map((cell) => [cell, 0])
  ) as Record<string, number>;
  for (const { byArm, groundTruth } of blockObservations) {
    confusionMatrix[expectedDecisionCell(groundTruth.expected_action, byArm.treatment.decision)] += 1;
  }

  const scenarioTaskDeltas = new Map<string, number[]>();
  const scenarioAvoidanceDeltas = new Map<string, number[]>();
  blockObservations.forEach(({ block }, index) => {
    const taskDelta = taskSuccessDeltas[index]!.treatment_minus_no_ee;
    if (taskDelta !== null) {
      const values = scenarioTaskDeltas.get(block.scenario_id) ?? [];
      values.push(taskDelta);
      scenarioTaskDeltas.set(block.scenario_id, values);
    }
    const avoidanceDelta = avoidanceDeltas[index]!.treatment_minus_no_ee;
    if (avoidanceDelta !== null) {
      const values = scenarioAvoidanceDeltas.get(block.scenario_id) ?? [];
      values.push(avoidanceDelta);
      scenarioAvoidanceDeltas.set(block.scenario_id, values);
    }
  });
  const completeBlockCoverage = rate(completeBlocks.length, blocks.length) ?? 0;
  const infrastructureReliability = 1 - infrastructureFailureRate;
  const scorecardWithoutDigest = {
    benchmark_campaign_id: options.campaignId,
    scorecard,
    pairwise_deltas: {
      task_success: taskPairwise,
      repeated_old_mistake_avoidance: avoidancePairwise,
      wall_clock_latency_ms: latencyPairwise,
      tool_calls: toolPairwise,
      total_tokens: tokenPairwise
    },
    confidence_intervals: {
      task_success_treatment_minus_no_ee: confidenceInterval(
        [...scenarioTaskDeltas.values()].map((values) => mean(values)!).filter(Number.isFinite)
      ),
      repeated_old_mistake_avoidance_treatment_minus_no_ee: confidenceInterval(
        [...scenarioAvoidanceDeltas.values()].map((values) => mean(values)!).filter(Number.isFinite)
      )
    },
    confusion_matrix: confusionMatrix,
    complete_block_ids: completeBlocks.map((block) => block.block_id),
    excluded_block_ids: excludedBlocks.map((block) => block.block_id),
    complete_block_coverage: completeBlockCoverage,
    infrastructure_reliability: infrastructureReliability,
    attempted_arm_count: attempts.length
  };
  const campaignScorecard: BenchmarkCampaignScorecard = {
    ...scorecardWithoutDigest,
    evidence_digest: sha256Text(canonicalJson({
      ...scorecardWithoutDigest,
      observations: options.observations.map((observation) => observation.observation_digest)
    }))
  };

  const thresholdResults: Record<string, boolean> = {
    minimum_complete_block_coverage:
      completeBlockCoverage >= plan.minimum_complete_block_coverage,
    minimum_infrastructure_reliability:
      infrastructureReliability >= plan.minimum_infrastructure_reliability,
    minimum_repetitions_per_scenario: [...new Set(blocks.map((block) => block.scenario_id))]
      .every((scenarioId) => completeBlocks.filter((block) => block.scenario_id === scenarioId).length >=
        plan.minimum_repetitions_per_scenario),
    negative_result_disclosure:
      !plan.negative_result_disclosure_required || options.negativeResultDisclosureIncluded
  };
  for (const field of BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS) {
    const threshold = plan.quality_thresholds[field];
    if (threshold === undefined) {
      continue;
    }
    const value = scorecard[field];
    thresholdResults[`quality:${field}`] = value !== null && (
      metricDirection[field] === "minimum" ? value >= threshold : value <= threshold
    );
  }
  const observationIncomplete = completeBlocks.some((block) =>
    MATCHED_BLOCK_ARMS.some((arm) => !observationsByKey.has(`${block.block_id}:${arm}`))
  );
  const decision = missingDisposition || observationIncomplete
    ? "incomplete"
    : Object.values(thresholdResults).every(Boolean)
      ? "publishable"
      : "not_publishable";
  const publicationDecision: BenchmarkPublicationDecision = {
    publication_decision_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.publicationDecision,
    benchmark_campaign_id: options.campaignId,
    publication_plan_digest: plan.publication_plan_digest,
    decision,
    threshold_results: thresholdResults,
    complete_block_count: completeBlocks.length,
    attempted_arm_count: attempts.length,
    evidence_digest: sha256Text(canonicalJson({
      publication_plan_digest: plan.publication_plan_digest,
      campaign_scorecard_digest: campaignScorecard.evidence_digest,
      threshold_results: thresholdResults,
      decision
    })),
    created_at: options.createdAt
  };
  if (options.persistDecision ?? true) {
    options.store.insertPublicationDecision(publicationDecision);
  }
  return {
    campaign_scorecard: campaignScorecard,
    publication_decision: publicationDecision
  };
};
