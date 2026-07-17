import type {
  BENCHMARK_ATTEMPT_EXECUTION_STATUSES,
  BENCHMARK_BLOCK_DISPOSITIONS,
  BENCHMARK_DECISIONS,
  BENCHMARK_EXPECTED_ACTIONS,
  BENCHMARK_FAILURE_CLASSIFICATIONS,
  BENCHMARK_INFRASTRUCTURE_FAILURE_CODES,
  BENCHMARK_INTERVENTION_EVENT_OUTCOMES,
  BENCHMARK_METRIC_AVAILABILITY,
  BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS,
  BENCHMARK_PREFLIGHT_STAGES,
  BENCHMARK_PREFLIGHT_STATUSES,
  BENCHMARK_PUBLICATION_DECISIONS,
  BENCHMARK_STATISTICAL_UNITS,
  BENCHMARK_TASK_OUTCOMES,
  MATCHED_BLOCK_ARMS
} from "./constants.js";

export type BenchmarkStatisticalUnit = typeof BENCHMARK_STATISTICAL_UNITS[number];
export type BenchmarkInterventionEventOutcome =
  typeof BENCHMARK_INTERVENTION_EVENT_OUTCOMES[number];
export type BenchmarkExpectedAction = typeof BENCHMARK_EXPECTED_ACTIONS[number];
export type BenchmarkDecision = typeof BENCHMARK_DECISIONS[number];
export type MatchedBlockArm = typeof MATCHED_BLOCK_ARMS[number];
export type BenchmarkPreflightStage = typeof BENCHMARK_PREFLIGHT_STAGES[number];
export type BenchmarkPreflightStatus = typeof BENCHMARK_PREFLIGHT_STATUSES[number];
export type BenchmarkAttemptExecutionStatus =
  typeof BENCHMARK_ATTEMPT_EXECUTION_STATUSES[number];
export type BenchmarkTaskOutcome = typeof BENCHMARK_TASK_OUTCOMES[number];
export type BenchmarkFailureClassification =
  typeof BENCHMARK_FAILURE_CLASSIFICATIONS[number];
export type BenchmarkInfrastructureFailureCode =
  typeof BENCHMARK_INFRASTRUCTURE_FAILURE_CODES[number];
export type BenchmarkBlockDisposition = typeof BENCHMARK_BLOCK_DISPOSITIONS[number];
export type BenchmarkPublicationDecisionValue =
  typeof BENCHMARK_PUBLICATION_DECISIONS[number];
export type BenchmarkMetricAvailability = typeof BENCHMARK_METRIC_AVAILABILITY[number];
export type BenchmarkPublicScorecardField =
  typeof BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS[number];

export type BenchmarkCampaignManifest = {
  campaign_manifest_schema_version: string;
  benchmark_protocol_version: string;
  benchmark_campaign_id: string;
  scenario_set_digest: string;
  analysis_plan_digest: string;
  exclusion_policy_version: string;
  replacement_policy_version: string;
  created_at: string;
  campaign_manifest_digest: string;
};
export type BenchmarkScenarioManifest = {
  scenario_manifest_schema_version: string;
  scenario_id: string;
  scenario_version: string;
  title: string;
  task_type: string;
  task_input: string;
  task_input_digest: string;
  ground_truth_id: string;
  ground_truth_digest: string;
  created_at: string;
  scenario_digest: string;
};

export type BenchmarkDecisionOpportunityGroundTruth = {
  opportunity_id: string;
  ordinal: number;
  expected_action: BenchmarkExpectedAction;
  plausible_node_ids: string[];
  plausible_candidate_ids: string[];
  candidate_consideration_required: boolean;
  valid_skip_reason_codes: string[];
  requires_prior_harm: boolean;
  known_old_mistake_path: string | null;
};

export type BenchmarkFixtureManifest = {
  fixture_manifest_schema_version: string;
  fixture_id: string;
  fixture_version: string;
  repository_source: string;
  repository_revision: string;
  repository_snapshot_digest: string;
  setup_contract_digest: string;
  reset_contract_digest: string;
  candidate_corpus_digest: string;
  created_at: string;
  fixture_digest: string;
};
export type BenchmarkGroundTruthV1 = {
  ground_truth_schema_version: string;
  ground_truth_id: string;
  scenario_id: string;
  scenario_version: string;
  expected_action: BenchmarkExpectedAction;
  applicable_node_ids: string[];
  applicable_candidate_ids: string[];
  distractor_node_ids: string[];
  distractor_candidate_ids: string[];
  scope_validity: {
    valid: boolean;
    reason_code: string;
  };
  safety_constraints: string[];
  deterministic_success_checks: string[];
  known_old_mistake_path: string | null;
  created_at: string;
  ground_truth_digest: string;
};

export type BenchmarkGroundTruthV2 = BenchmarkGroundTruthV1 & {
  decision_opportunities: BenchmarkDecisionOpportunityGroundTruth[];
};

export type BenchmarkGroundTruth = BenchmarkGroundTruthV1 | BenchmarkGroundTruthV2;

export type BenchmarkRuntimeManifest = {
  runtime_manifest_schema_version: string;
  runtime_manifest_id: string;
  package_name: string;
  package_version: string;
  published_channel: "npm" | "clawhub";
  artifact_integrity: string;
  registry_record_identity: string;
  openclaw_version: string;
  node_version: string;
  platform: string;
  host_identity: string;
  host_model_provider: string;
  host_model_identity_fingerprint: string;
  host_model_parameters_digest: string;
  configuration_digest: string;
  profile_registry_digest: string;
  benchmark_evidence_target_id: string;
  created_at: string;
  runtime_manifest_digest: string;
};

export type BenchmarkInstrumentationManifest = {
  instrumentation_manifest_schema_version: string;
  instrumentation_manifest_id: string;
  harness_version: string;
  transcript_adapter_version: string;
  scorer_version: string;
  observer_contract_digest: string;
  timeout_policy_digest: string;
  resource_policy_digest: string;
  fixture_reset_policy_digest: string;
  network_retry_policy_version: string;
  collected_metrics: BenchmarkPublicScorecardField[];
  unavailable_metric_policy: "mark_unavailable";
  created_at: string;
  instrumentation_manifest_digest: string;
};

export type MatchedBlockManifest = {
  benchmark_manifest_schema_version: string;
  benchmark_protocol_version: string;
  benchmark_campaign_id: string;
  benchmark_profile_registry_digest: string;
  benchmark_evidence_target_id: string;
  scenario_id: string;
  scenario_version: string;
  scenario_digest: string;
  scenario_set_digest: string;
  fixture_id: string;
  ground_truth_id: string;
  runtime_manifest_id: string;
  instrumentation_manifest_id: string;
  block_id: string;
  replacement_for_block_id: string | null;
  replacement_generation: number;
  repetition_index: number;
  randomization_seed: string;
  planned_arm_order: MatchedBlockArm[];
  repository_snapshot_digest: string;
  task_input_digest: string;
  candidate_corpus_digest: string;
  host_identity: string;
  host_model_provider: string;
  host_model_identity_fingerprint: string;
  host_model_parameters_digest: string;
  environment_contract_digest: string;
  network_retry_policy_version: string;
  harness_version: string;
  transcript_adapter_version: string;
  scorer_version: string;
  analysis_plan_digest: string;
  exclusion_policy_version: string;
  replacement_policy_version: string;
  created_at: string;
  sealed_at: string;
  manifest_digest: string;
};

export type MatchedBlockArmPlan = {
  arm_plan_schema_version: string;
  benchmark_campaign_id: string;
  block_id: string;
  manifest_digest: string;
  arm: MatchedBlockArm;
  planned_ordinal: number;
  workspace_isolation_id: string;
  ee_home_isolation_id: string;
  host_session_isolation_id: string;
  arm_control_digest: string;
};

export type BenchmarkPreflightRecord = {
  preflight_record_schema_version: string;
  benchmark_campaign_id: string;
  block_id: string;
  manifest_digest: string;
  arm: MatchedBlockArm;
  preflight_attempt_id: string;
  preflight_attempt_number: number;
  preflight_stage: BenchmarkPreflightStage;
  status: BenchmarkPreflightStatus;
  failure_code: string | null;
  started_at: string;
  finished_at: string;
  evidence_digest: string;
};

export type BenchmarkFormalAttempt = {
  attempt_record_schema_version: string;
  benchmark_campaign_id: string;
  block_id: string;
  manifest_digest: string;
  arm: MatchedBlockArm;
  attempt_id: string;
  attempt_number: 1;
  attempt_state_revision: number;
  planned_ordinal: number;
  execution_status: BenchmarkAttemptExecutionStatus;
  task_outcome: BenchmarkTaskOutcome;
  task_timeout: boolean;
  infrastructure_failure_code: BenchmarkInfrastructureFailureCode | null;
  product_runtime_failure_codes: string[];
  started_at: string;
  finished_at: string | null;
  workspace_artifact_digest: string | null;
  host_transcript_digest: string | null;
  arm_neutral_metrics_digest: string | null;
  deterministic_check_digest: string | null;
  scoring_record_digest: string | null;
};

export type BenchmarkBlockDispositionRecord = {
  block_disposition_schema_version: string;
  benchmark_campaign_id: string;
  block_id: string;
  manifest_digest: string;
  disposition: BenchmarkBlockDisposition;
  reason_code: string;
  affected_arms: MatchedBlockArm[];
  detected_at: string;
  detected_by: string;
  evidence_digest: string;
  replacement_block_id: string | null;
};

export type BenchmarkReplacementLineageRecord = {
  replacement_record_schema_version: string;
  benchmark_campaign_id: string;
  original_block_id: string;
  original_manifest_digest: string;
  replacement_block_id: string;
  replacement_manifest_digest: string;
  replacement_generation: number;
  reason_code: string;
  approved_at: string;
  approved_by: string;
  evidence_digest: string;
};

export type BenchmarkPublicationPlan = {
  publication_plan_schema_version: string;
  benchmark_campaign_id: string;
  analysis_plan_digest: string;
  minimum_repetitions_per_scenario: number;
  minimum_complete_block_coverage: number;
  minimum_infrastructure_reliability: number;
  quality_thresholds: Partial<Record<BenchmarkPublicScorecardField, number>>;
  uncertainty_method: string;
  negative_result_disclosure_required: boolean;
  sensitivity_exclusion_policy_version: string;
  created_at: string;
  sealed_at: string;
  publication_plan_digest: string;
};

export type BenchmarkPublicationDecision = {
  publication_decision_schema_version: string;
  benchmark_campaign_id: string;
  publication_plan_digest: string;
  decision: BenchmarkPublicationDecisionValue;
  threshold_results: Record<string, boolean>;
  complete_block_count: number;
  attempted_arm_count: number;
  evidence_digest: string;
  created_at: string;
};

export type BenchmarkMinimumPublicScorecard = Record<
  BenchmarkPublicScorecardField,
  number | null
>;

export type BenchmarkMetricObservation = {
  metric: BenchmarkPublicScorecardField;
  availability: BenchmarkMetricAvailability;
  value: number | null;
};

export type BenchmarkDeliveredNodeOutcomeEvidence = {
  node_id: string;
  verdict: "weak_harmed" | "strong_harmed" | "strong_helped" | "other";
  confidence: "low" | "medium" | "high";
};

export type BenchmarkInterventionEventEvidence = {
  delivered: boolean;
  manual_override: "helped" | "harmed" | null;
  node_outcomes: BenchmarkDeliveredNodeOutcomeEvidence[];
};
