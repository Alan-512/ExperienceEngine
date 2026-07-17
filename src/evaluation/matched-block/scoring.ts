import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import {
  BENCHMARK_ARM_SCORING_OBSERVATION_V2_FIELDS,
  BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2,
  BENCHMARK_CONFUSION_MATRIX_CELLS,
  BENCHMARK_DECISION_OPPORTUNITY_OBSERVATION_FIELDS,
  BENCHMARK_DECISIONS,
  BENCHMARK_GOVERNANCE_TRANSITION_OBSERVATION_FIELDS,
  BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS,
  MATCHED_BLOCK_ARMS,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "./constants.js";
import { computeBenchmarkRecordDigest } from "./contract.js";
import { MatchedBlockBenchmarkStore } from "./store.js";
import type {
  BenchmarkDecision,
  BenchmarkExpectedAction,
  BenchmarkMinimumPublicScorecard,
  BenchmarkPublicationDecision,
  BenchmarkPublicScorecardField,
  BenchmarkDecisionOpportunityGroundTruth,
  BenchmarkGroundTruth,
  BenchmarkGroundTruthV2,
  MatchedBlockArm
} from "./types.js";

export type BenchmarkGovernanceTransitionObservation = {
  node_id: string;
  before_delivery_state: string;
  after_delivery_state: string;
  authority_source: "production_runtime";
  transition_evidence_id: string;
  evidence_digest: string;
};

export type BenchmarkDecisionOpportunityScoringObservation = {
  opportunity_id: string;
  ordinal: number;
  decision: BenchmarkDecision;
  would_have_delivered: boolean | null;
  delivered_intervention_count: number;
  helped_intervention_count: number;
  harmed_intervention_count: number;
  uncertain_intervention_count: number;
  considered_candidate_ids: string[];
  selected_candidate_ids: string[];
  rejected_candidate_ids: string[];
  governance_excluded_node_ids: string[];
  skip_reason_code: string | null;
  task_success: 0 | 1;
  skipped_guidance_required: boolean | null;
  authoritative_harm_evidence_id: string | null;
  governance_transition: BenchmarkGovernanceTransitionObservation | null;
  evidence_digest: string;
};

export type BenchmarkArmScoringObservationV1 = {
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

export type BenchmarkArmScoringObservationV2 = Omit<
  BenchmarkArmScoringObservationV1,
  "decision_opportunity_count"
> & {
  observation_schema_version: typeof BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2;
  decision_opportunity_count: number;
  decision_opportunities: BenchmarkDecisionOpportunityScoringObservation[];
};

export type BenchmarkArmScoringObservation =
  | BenchmarkArmScoringObservationV1
  | BenchmarkArmScoringObservationV2;

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
  decision_opportunity_metrics?: {
    correct_skip_evidence_coverage: number | null;
  };
  harm_recovery_metrics?: {
    opportunity_count: number;
    success_count: number;
    recovery_rate: number | null;
  };
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

const isV2Observation = (
  observation: BenchmarkArmScoringObservation
): observation is BenchmarkArmScoringObservationV2 =>
  "observation_schema_version" in observation;

const isV2GroundTruth = (
  groundTruth: BenchmarkGroundTruth
): groundTruth is BenchmarkGroundTruthV2 =>
  "decision_opportunities" in groundTruth;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string
): void => {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(required)) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      `${field} has unexpected or missing fields.`
    );
  }
};

const assertUniqueStringArray = (value: string[], field: string): void => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${field} must contain non-empty strings.`);
  }
  if (new Set(value).size !== value.length) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${field} must not contain duplicates.`);
  }
};

const validateGovernanceTransition = (
  value: BenchmarkGovernanceTransitionObservation | null,
  field: string
): void => {
  if (value === null) return;
  assertExactKeys(
    value as unknown as Record<string, unknown>,
    BENCHMARK_GOVERNANCE_TRANSITION_OBSERVATION_FIELDS,
    field
  );
  for (const key of [
    "node_id",
    "before_delivery_state",
    "after_delivery_state",
    "transition_evidence_id",
    "evidence_digest"
  ] as const) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      fail("BENCHMARK_SCORING_INPUT_INVALID", `${field}.${key} must be non-empty.`);
    }
  }
  if (value.authority_source !== "production_runtime") {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      `${field}.authority_source must be production_runtime.`
    );
  }
  if (
    value.evidence_digest !==
    computeBenchmarkRecordDigest(
      value as unknown as Record<string, unknown>,
      "evidence_digest"
    )
  ) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${field}.evidence_digest does not match.`);
  }
};

const validateDecisionOpportunityObservation = (
  opportunity: BenchmarkDecisionOpportunityScoringObservation,
  index: number
): void => {
  const label = `decision_opportunities[${index}]`;
  assertExactKeys(
    opportunity as unknown as Record<string, unknown>,
    BENCHMARK_DECISION_OPPORTUNITY_OBSERVATION_FIELDS,
    label
  );
  if (typeof opportunity.opportunity_id !== "string" || opportunity.opportunity_id.length === 0) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${label}.opportunity_id must be non-empty.`);
  }
  if (!Number.isSafeInteger(opportunity.ordinal) || opportunity.ordinal < 1) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${label}.ordinal must be a positive integer.`);
  }
  if (!BENCHMARK_DECISIONS.includes(opportunity.decision)) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${label}.decision is unsupported.`);
  }
  if (
    opportunity.would_have_delivered !== null &&
    typeof opportunity.would_have_delivered !== "boolean"
  ) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      `${label}.would_have_delivered must be boolean or null.`
    );
  }
  for (const field of [
    "delivered_intervention_count",
    "helped_intervention_count",
    "harmed_intervention_count",
    "uncertain_intervention_count"
  ] as const) {
    assertFiniteNonNegative(opportunity[field], `${label}.${field}`);
  }
  if (opportunity.delivered_intervention_count > 1) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      `${label}.delivered_intervention_count cannot exceed one intervention event.`
    );
  }
  if (
    opportunity.helped_intervention_count +
      opportunity.harmed_intervention_count +
      opportunity.uncertain_intervention_count !==
    opportunity.delivered_intervention_count
  ) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      `${label} delivered outcomes must be exhaustive and mutually exclusive.`
    );
  }
  for (const field of [
    "considered_candidate_ids",
    "selected_candidate_ids",
    "rejected_candidate_ids",
    "governance_excluded_node_ids"
  ] as const) {
    assertUniqueStringArray(opportunity[field], `${label}.${field}`);
  }
  if (opportunity.skip_reason_code !== null && (
    typeof opportunity.skip_reason_code !== "string" || opportunity.skip_reason_code.length === 0
  )) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${label}.skip_reason_code is invalid.`);
  }
  if (opportunity.task_success !== 0 && opportunity.task_success !== 1) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${label}.task_success must be zero or one.`);
  }
  if (
    opportunity.skipped_guidance_required !== null &&
    typeof opportunity.skipped_guidance_required !== "boolean"
  ) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      `${label}.skipped_guidance_required must be boolean or null.`
    );
  }
  if (opportunity.authoritative_harm_evidence_id !== null && (
    typeof opportunity.authoritative_harm_evidence_id !== "string" ||
    opportunity.authoritative_harm_evidence_id.length === 0
  )) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      `${label}.authoritative_harm_evidence_id is invalid.`
    );
  }
  validateGovernanceTransition(opportunity.governance_transition, `${label}.governance_transition`);
  if (
    opportunity.evidence_digest !==
    computeBenchmarkRecordDigest(
      opportunity as unknown as Record<string, unknown>,
      "evidence_digest"
    )
  ) {
    fail("BENCHMARK_SCORING_INPUT_INVALID", `${label}.evidence_digest does not match.`);
  }
};

const validateObservation = (observation: BenchmarkArmScoringObservation): void => {
  if (!Number.isSafeInteger(observation.decision_opportunity_count) ||
    observation.decision_opportunity_count < 1) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "Each formal task trial must contain at least one decision opportunity."
    );
  }
  if (!isV2Observation(observation) && observation.decision_opportunity_count !== 1) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "Legacy arm observations contribute exactly one decision opportunity."
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
  if (isV2Observation(observation)) {
    if (
      observation.observation_schema_version !==
      BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2
    ) {
      fail("BENCHMARK_SCORING_INPUT_INVALID", "Arm observation schema version is unsupported.");
    }
    if (!Array.isArray(observation.decision_opportunities) ||
      observation.decision_opportunities.length !== observation.decision_opportunity_count) {
      fail(
        "BENCHMARK_SCORING_INPUT_INVALID",
        "Arm observation opportunity count does not match its opportunity array."
      );
    }
    observation.decision_opportunities.forEach(validateDecisionOpportunityObservation);
    const ids = new Set(observation.decision_opportunities.map((entry) => entry.opportunity_id));
    const ordinals = new Set(observation.decision_opportunities.map((entry) => entry.ordinal));
    if (ids.size !== observation.decision_opportunities.length ||
      ordinals.size !== observation.decision_opportunities.length) {
      fail(
        "BENCHMARK_SCORING_INPUT_INVALID",
        "Arm observation opportunity ids and ordinals must be unique."
      );
    }
    const ordered = [...observation.decision_opportunities]
      .sort((left, right) => left.ordinal - right.ordinal);
    if (ordered.some((entry, index) => entry.ordinal !== index + 1)) {
      fail(
        "BENCHMARK_SCORING_INPUT_INVALID",
        "Arm observation opportunity ordinals must be contiguous from one."
      );
    }
    const sum = (field: keyof Pick<
      BenchmarkDecisionOpportunityScoringObservation,
      | "delivered_intervention_count"
      | "helped_intervention_count"
      | "harmed_intervention_count"
      | "uncertain_intervention_count"
    >): number => ordered.reduce((total, entry) => total + entry[field], 0);
    for (const field of [
      "delivered_intervention_count",
      "helped_intervention_count",
      "harmed_intervention_count",
      "uncertain_intervention_count"
    ] as const) {
      if (observation[field] !== sum(field)) {
        fail(
          "BENCHMARK_SCORING_INPUT_INVALID",
          `Arm observation ${field} does not match its opportunity records.`
        );
      }
    }
    if (observation.decision !== ordered.at(-1)?.decision) {
      fail(
        "BENCHMARK_SCORING_INPUT_INVALID",
        "Arm observation decision must match the final opportunity decision."
      );
    }
    if (
      observation.observation_digest !==
      computeBenchmarkRecordDigest(
        observation as unknown as Record<string, unknown>,
        "observation_digest"
      )
    ) {
      fail("BENCHMARK_SCORING_INPUT_INVALID", "Arm observation digest does not match.");
    }
  }
};

export const assertBenchmarkArmScoringObservationV2 = (
  value: unknown
): BenchmarkArmScoringObservationV2 => {
  if (!isRecord(value)) {
    return fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "V2 arm observation must be an object."
    );
  }
  if (
    value.observation_schema_version !== BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2 ||
    typeof value.block_id !== "string" ||
    value.block_id.length === 0 ||
    !MATCHED_BLOCK_ARMS.includes(value.arm as MatchedBlockArm) ||
    !BENCHMARK_DECISIONS.includes(value.decision as BenchmarkDecision) ||
    typeof value.observation_digest !== "string" ||
    !Array.isArray(value.decision_opportunities)
  ) {
    return fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "V2 arm observation identity or opportunity array is invalid."
    );
  }
  assertExactKeys(
    value,
    BENCHMARK_ARM_SCORING_OBSERVATION_V2_FIELDS,
    "V2 arm observation"
  );
  for (const [index, opportunityValue] of value.decision_opportunities.entries()) {
    if (!isRecord(opportunityValue)) {
      return fail(
        "BENCHMARK_SCORING_INPUT_INVALID",
        `decision_opportunities[${index}] must be an object.`
      );
    }
    for (const field of [
      "considered_candidate_ids",
      "selected_candidate_ids",
      "rejected_candidate_ids",
      "governance_excluded_node_ids"
    ] as const) {
      if (!Array.isArray(opportunityValue[field])) {
        return fail(
          "BENCHMARK_SCORING_INPUT_INVALID",
          `decision_opportunities[${index}].${field} must be an array.`
        );
      }
    }
    if (
      opportunityValue.governance_transition !== null &&
      !isRecord(opportunityValue.governance_transition)
    ) {
      return fail(
        "BENCHMARK_SCORING_INPUT_INVALID",
        `decision_opportunities[${index}].governance_transition must be an object or null.`
      );
    }
  }
  const observation = value as unknown as BenchmarkArmScoringObservationV2;
  validateObservation(observation);
  return observation;
};

const assertObservationMatchesGroundTruth = (
  observation: BenchmarkArmScoringObservation,
  groundTruth: BenchmarkGroundTruth
): void => {
  if (!isV2GroundTruth(groundTruth)) {
    if (isV2Observation(observation)) {
      fail(
        "BENCHMARK_SCORING_INPUT_INVALID",
        "V2 arm observations require V2 ground truth."
      );
    }
    return;
  }
  if (!isV2Observation(observation)) {
    return fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "V2 ground truth requires V2 arm observations."
    );
  }
  const expected = [...groundTruth.decision_opportunities]
    .sort((left, right) => left.ordinal - right.ordinal);
  const actual = [...observation.decision_opportunities]
    .sort((left, right) => left.ordinal - right.ordinal);
  if (expected.length !== actual.length || expected.some((entry, index) =>
    entry.opportunity_id !== actual[index]?.opportunity_id ||
    entry.ordinal !== actual[index]?.ordinal
  )) {
    fail(
      "BENCHMARK_SCORING_INPUT_INVALID",
      "Arm observation opportunity set does not match sealed ground truth."
    );
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

type ScoredTreatmentOpportunity = {
  block_id: string;
  opportunity_id: string;
  ordinal: number;
  expected_action: BenchmarkExpectedAction;
  decision: BenchmarkDecision;
  delivered_intervention_count: number;
  task_success: 0 | 1;
  skipped_guidance_required: boolean | null;
  plausible_candidate_ids: string[];
  considered_candidate_ids: string[];
  selected_candidate_ids: string[];
  rejected_candidate_ids: string[];
  governance_excluded_node_ids: string[];
  candidate_consideration_required: boolean;
  requires_prior_harm: boolean;
  valid_skip_reason_codes: string[];
  skip_reason_code: string | null;
  harmed_intervention_count: number;
  authoritative_harm_evidence_id: string | null;
  governance_transition: BenchmarkGovernanceTransitionObservation | null;
  legacy: boolean;
};

const buildTreatmentOpportunities = (
  observation: BenchmarkArmScoringObservation,
  groundTruth: BenchmarkGroundTruth,
  blockId: string
): ScoredTreatmentOpportunity[] => {
  if (!isV2GroundTruth(groundTruth) || !isV2Observation(observation)) {
    return [{
      block_id: blockId,
      opportunity_id: "legacy-opportunity",
      ordinal: 1,
      expected_action: groundTruth.expected_action,
      decision: observation.decision,
      delivered_intervention_count: observation.delivered_intervention_count,
      task_success: observation.task_success,
      skipped_guidance_required:
        observation.repeated_old_mistake_avoided === 0 ? true : false,
      plausible_candidate_ids: [
        ...groundTruth.applicable_node_ids,
        ...groundTruth.applicable_candidate_ids,
        ...groundTruth.distractor_node_ids,
        ...groundTruth.distractor_candidate_ids
      ],
      considered_candidate_ids: [],
      selected_candidate_ids: [],
      rejected_candidate_ids: [],
      governance_excluded_node_ids: [],
      candidate_consideration_required: false,
      requires_prior_harm: false,
      valid_skip_reason_codes: [],
      skip_reason_code: null,
      harmed_intervention_count: observation.harmed_intervention_count,
      authoritative_harm_evidence_id: null,
      governance_transition: null,
      legacy: true
    }];
  }
  const observationsById = new Map(
    observation.decision_opportunities.map((entry) => [entry.opportunity_id, entry])
  );
  return [...groundTruth.decision_opportunities]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((expected) => {
      const actual = observationsById.get(expected.opportunity_id)!;
      return {
        block_id: blockId,
        opportunity_id: expected.opportunity_id,
        ordinal: expected.ordinal,
        expected_action: expected.expected_action,
        decision: actual.decision,
        delivered_intervention_count: actual.delivered_intervention_count,
        task_success: actual.task_success,
        skipped_guidance_required: actual.skipped_guidance_required,
        plausible_candidate_ids: [
          ...expected.plausible_node_ids,
          ...expected.plausible_candidate_ids
        ],
        considered_candidate_ids: actual.considered_candidate_ids,
        selected_candidate_ids: actual.selected_candidate_ids,
        rejected_candidate_ids: actual.rejected_candidate_ids,
        governance_excluded_node_ids: actual.governance_excluded_node_ids,
        candidate_consideration_required: expected.candidate_consideration_required,
        requires_prior_harm: expected.requires_prior_harm,
        valid_skip_reason_codes: expected.valid_skip_reason_codes,
        skip_reason_code: actual.skip_reason_code,
        harmed_intervention_count: actual.harmed_intervention_count,
        authoritative_harm_evidence_id: actual.authoritative_harm_evidence_id,
        governance_transition: actual.governance_transition,
        legacy: false
      };
    });
};

const hasPlausibleCandidateEvidence = (
  opportunity: ScoredTreatmentOpportunity
): boolean => {
  const plausible = new Set(opportunity.plausible_candidate_ids);
  return [
    ...opportunity.considered_candidate_ids,
    ...opportunity.selected_candidate_ids,
    ...opportunity.rejected_candidate_ids
  ].some((id) => plausible.has(id));
};

const hasValidSkipReason = (opportunity: ScoredTreatmentOpportunity): boolean =>
  opportunity.skip_reason_code !== null &&
  opportunity.valid_skip_reason_codes.includes(opportunity.skip_reason_code);

const NON_LIVE_DELIVERY_STATES = new Set([
  "shadow_only",
  "quarantined",
  "shadow_probe",
  "retired"
]);

export type BenchmarkHarmRecoveryAssessment = {
  opportunity_count: number;
  success_count: number;
  recovery_rate: number | null;
  successful_opportunity_ids: string[];
};

export const assessBenchmarkHarmRecovery = (
  opportunities: ScoredTreatmentOpportunity[]
): BenchmarkHarmRecoveryAssessment => {
  const recoveryOpportunities = opportunities.filter((opportunity) =>
    opportunity.requires_prior_harm
  );
  const successfulOpportunityIds = recoveryOpportunities.flatMap((recovery) => {
    const plausibleNodes = new Set(recovery.plausible_candidate_ids);
    const exposure = opportunities
      .filter((candidate) => candidate.ordinal < recovery.ordinal)
      .find((candidate) => {
        const transition = candidate.governance_transition;
        return candidate.delivered_intervention_count > 0 &&
          candidate.harmed_intervention_count > 0 &&
          candidate.authoritative_harm_evidence_id !== null &&
          transition !== null &&
          transition.authority_source === "production_runtime" &&
          NON_LIVE_DELIVERY_STATES.has(transition.after_delivery_state) &&
          plausibleNodes.has(transition.node_id);
      });
    if (!exposure?.governance_transition) return [];
    const transitionedNodeId = exposure.governance_transition.node_id;
    const recovered = recovery.decision === "skip" &&
      recovery.delivered_intervention_count === 0 &&
      recovery.task_success === 1 &&
      recovery.skipped_guidance_required === false &&
      hasValidSkipReason(recovery) &&
      recovery.governance_excluded_node_ids.includes(transitionedNodeId);
    return recovered ? [recovery.opportunity_id] : [];
  });
  return {
    opportunity_count: recoveryOpportunities.length,
    success_count: successfulOpportunityIds.length,
    recovery_rate: rate(successfulOpportunityIds.length, recoveryOpportunities.length),
    successful_opportunity_ids: successfulOpportunityIds
  };
};

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
    for (const observation of Object.values(byArm)) {
      assertObservationMatchesGroundTruth(observation, groundTruth);
    }
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
  const treatmentOpportunityGroups = blockObservations.map(({ block, byArm, groundTruth }) => ({
    block_id: block.block_id,
    opportunities: buildTreatmentOpportunities(byArm.treatment, groundTruth, block.block_id)
  }));
  const treatmentOpportunities = treatmentOpportunityGroups.flatMap((group) => group.opportunities);
  const harmRecoveryAssessments = treatmentOpportunityGroups.map((group) => ({
    block_id: group.block_id,
    assessment: assessBenchmarkHarmRecovery(group.opportunities)
  }));
  const successfulHarmRecoveryKeys = new Set(harmRecoveryAssessments.flatMap(({ block_id, assessment }) =>
    assessment.successful_opportunity_ids.map((opportunityId) => `${block_id}:${opportunityId}`)
  ));
  const harmRecoveryOpportunityCount = harmRecoveryAssessments.reduce(
    (sum, { assessment }) => sum + assessment.opportunity_count,
    0
  );
  const harmRecoverySuccessCount = harmRecoveryAssessments.reduce(
    (sum, { assessment }) => sum + assessment.success_count,
    0
  );
  const skipOpportunities = treatmentOpportunities.filter(
    (opportunity) => opportunity.expected_action === "skip"
  );
  const strictSkipEvidence = skipOpportunities.filter((opportunity) =>
    !opportunity.legacy &&
    (
      (
        opportunity.candidate_consideration_required &&
        hasPlausibleCandidateEvidence(opportunity) &&
        hasValidSkipReason(opportunity)
      ) ||
      (
        opportunity.requires_prior_harm &&
        successfulHarmRecoveryKeys.has(`${opportunity.block_id}:${opportunity.opportunity_id}`)
      )
    )
  );
  const correctSkips = skipOpportunities.filter((opportunity) =>
    opportunity.decision === "skip" &&
    opportunity.delivered_intervention_count === 0 &&
    opportunity.task_success === 1 &&
    opportunity.skipped_guidance_required === false &&
    (
      opportunity.legacy ||
      (
        opportunity.requires_prior_harm
          ? successfulHarmRecoveryKeys.has(
            `${opportunity.block_id}:${opportunity.opportunity_id}`
          )
          : opportunity.candidate_consideration_required &&
            hasPlausibleCandidateEvidence(opportunity) &&
            hasValidSkipReason(opportunity)
      )
    )
  ).length;
  const falsePositiveInjections = skipOpportunities.filter(
    (opportunity) => opportunity.delivered_intervention_count > 0
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
    delivery_rate: rate(
      delivered,
      treatment.reduce((sum, observation) => sum + observation.decision_opportunity_count, 0)
    ),
    net_helpful_intervention_rate: delivered === 0 ? null : (helped - harmed) / delivered,
    helpful_rate: rate(helped, delivered),
    harmful_rate: rate(harmed, delivered),
    uncertain_rate: rate(uncertain, delivered),
    task_success_delta: taskPairwise.treatment_minus_no_ee,
    repeated_old_mistake_avoidance_delta: avoidancePairwise.treatment_minus_no_ee,
    correct_skip_rate: rate(correctSkips, skipOpportunities.length),
    false_positive_injection_rate: rate(falsePositiveInjections, skipOpportunities.length),
    provider_cost: providerCost,
    experienceengine_token_overhead: tokenPairwise.treatment_minus_no_ee,
    wall_clock_latency_delta: latencyPairwise.treatment_minus_no_ee,
    tool_call_delta: toolPairwise.treatment_minus_no_ee,
    infrastructure_failure_rate: infrastructureFailureRate
  };
  const confusionMatrix = Object.fromEntries(
    BENCHMARK_CONFUSION_MATRIX_CELLS.map((cell) => [cell, 0])
  ) as Record<string, number>;
  for (const opportunity of treatmentOpportunities) {
    confusionMatrix[expectedDecisionCell(opportunity.expected_action, opportunity.decision)] += 1;
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
  const hasV2Evidence = treatment.some(isV2Observation);
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
    attempted_arm_count: attempts.length,
    ...(hasV2Evidence ? {
      decision_opportunity_metrics: {
        correct_skip_evidence_coverage: rate(
          strictSkipEvidence.length,
          skipOpportunities.filter((opportunity) => !opportunity.legacy).length
        )
      },
      harm_recovery_metrics: {
        opportunity_count: harmRecoveryOpportunityCount,
        success_count: harmRecoverySuccessCount,
        recovery_rate: rate(harmRecoverySuccessCount, harmRecoveryOpportunityCount)
      }
    } : {})
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
