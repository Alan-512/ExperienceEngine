export const MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION =
  "matched-block-benchmark-v1" as const;
export const MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2 =
  "matched-block-benchmark-v2" as const;
export const MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSIONS = [
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2
] as const;

export const MATCHED_BLOCK_SCHEMA_VERSIONS = {
  campaign: "benchmark-campaign-manifest-v1",
  scenario: "benchmark-scenario-manifest-v1",
  fixture: "benchmark-fixture-manifest-v1",
  groundTruth: "benchmark-ground-truth-v1",
  groundTruthV2: "benchmark-ground-truth-v2",
  runtime: "benchmark-runtime-manifest-v1",
  instrumentation: "benchmark-instrumentation-manifest-v1",
  block: "matched-block-manifest-v1",
  armPlan: "matched-block-arm-plan-v1",
  preflight: "matched-block-preflight-v1",
  formalAttempt: "matched-block-formal-attempt-v1",
  disposition: "matched-block-disposition-v1",
  replacement: "matched-block-replacement-v1",
  publicationPlan: "benchmark-publication-plan-v1",
  publicationDecision: "benchmark-publication-decision-v1"
} as const;

export const BENCHMARK_ARM_SCORING_OBSERVATION_SCHEMA_V2 =
  "benchmark-arm-scoring-observation-v2" as const;

export const BENCHMARK_DECISION_OPPORTUNITY_GROUND_TRUTH_FIELDS = [
  "opportunity_id",
  "ordinal",
  "expected_action",
  "plausible_node_ids",
  "plausible_candidate_ids",
  "candidate_consideration_required",
  "valid_skip_reason_codes",
  "requires_prior_harm",
  "known_old_mistake_path"
] as const;

export const BENCHMARK_DECISION_OPPORTUNITY_OBSERVATION_FIELDS = [
  "opportunity_id",
  "ordinal",
  "decision",
  "would_have_delivered",
  "delivered_intervention_count",
  "helped_intervention_count",
  "harmed_intervention_count",
  "uncertain_intervention_count",
  "considered_candidate_ids",
  "selected_candidate_ids",
  "rejected_candidate_ids",
  "governance_excluded_node_ids",
  "skip_reason_code",
  "task_success",
  "skipped_guidance_required",
  "authoritative_harm_evidence_id",
  "governance_transition",
  "evidence_digest"
] as const;

export const BENCHMARK_GOVERNANCE_TRANSITION_OBSERVATION_FIELDS = [
  "node_id",
  "before_delivery_state",
  "after_delivery_state",
  "authority_source",
  "transition_evidence_id",
  "evidence_digest"
] as const;

export const BENCHMARK_ARM_SCORING_OBSERVATION_V2_FIELDS = [
  "observation_schema_version",
  "block_id",
  "arm",
  "decision",
  "decision_opportunity_count",
  "delivered_intervention_count",
  "helped_intervention_count",
  "harmed_intervention_count",
  "uncertain_intervention_count",
  "task_success",
  "repeated_old_mistake_avoided",
  "provider_cost",
  "total_token_count",
  "wall_clock_duration_ms",
  "tool_call_count",
  "decision_opportunities",
  "observation_digest"
] as const;

export const BENCHMARK_STATISTICAL_UNITS = [
  "decision_opportunity",
  "intervention_event",
  "node_delivery",
  "task_trial"
] as const;
export const BENCHMARK_INTERVENTION_EVENT_OUTCOMES = [
  "harmed",
  "helped",
  "uncertain"
] as const;
export const BENCHMARK_EXPECTED_ACTIONS = [
  "inject",
  "inject_conservative",
  "skip"
] as const;
export const BENCHMARK_DECISIONS = [
  "inject",
  "conservative",
  "skip"
] as const;

export const BENCHMARK_CONFUSION_MATRIX_CELLS = [
  "inject:inject",
  "inject:conservative",
  "inject:skip",
  "inject_conservative:inject",
  "inject_conservative:conservative",
  "inject_conservative:skip",
  "skip:inject",
  "skip:conservative",
  "skip:skip"
] as const;

export const MATCHED_BLOCK_ARMS = [
  "treatment",
  "forced_holdout",
  "no_ee"
] as const;

export const BENCHMARK_PREFLIGHT_STAGES = [
  "dependency_setup",
  "credential_validation",
  "host_startup",
  "fixture_preparation",
  "harness_smoke"
] as const;

export const BENCHMARK_PREFLIGHT_STATUSES = [
  "passed",
  "failed",
  "retried",
  "cancelled"
] as const;

export const BENCHMARK_ATTEMPT_EXECUTION_STATUSES = [
  "running",
  "completed",
  "infrastructure_failed",
  "harness_timed_out",
  "cancelled",
  "invalid"
] as const;

export const BENCHMARK_TASK_OUTCOMES = [
  "success",
  "failure",
  "partial",
  "unavailable"
] as const;

export const BENCHMARK_FAILURE_CLASSIFICATIONS = [
  "completion",
  "product_failure",
  "infrastructure_failure",
  "exclusion",
  "abort"
] as const;

export const BENCHMARK_INFRASTRUCTURE_FAILURE_CODES = [
  "BENCH_HOST_START_FAILED",
  "BENCH_PROVIDER_UNAVAILABLE",
  "BENCH_HARNESS_TIMEOUT",
  "BENCH_WORKSPACE_SETUP_FAILED",
  "BENCH_TRANSCRIPT_MISSING",
  "BENCH_SCORER_FAILED",
  "BENCH_INSTRUMENTATION_INCOMPARABLE",
  "BENCH_ARM_CONTAMINATION_DETECTED",
  "BENCH_OPERATOR_CANCELLED",
  "BENCH_HARNESS_DEFECT"
] as const;

export const BENCHMARK_BLOCK_DISPOSITIONS = [
  "complete",
  "incomplete_infrastructure",
  "invalid_contamination",
  "invalid_protocol_defect",
  "aborted_operator",
  "superseded_by_replacement"
] as const;

export const BENCHMARK_PUBLICATION_DECISIONS = [
  "publishable",
  "not_publishable",
  "incomplete"
] as const;

export const BENCHMARK_METRIC_AVAILABILITY = [
  "available",
  "unavailable"
] as const;

export const BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS = [
  "delivery_rate",
  "net_helpful_intervention_rate",
  "helpful_rate",
  "harmful_rate",
  "uncertain_rate",
  "task_success_delta",
  "repeated_old_mistake_avoidance_delta",
  "correct_skip_rate",
  "false_positive_injection_rate",
  "provider_cost",
  "experienceengine_token_overhead",
  "wall_clock_latency_delta",
  "tool_call_delta",
  "infrastructure_failure_rate"
] as const;

export const BENCHMARK_TABLE_NAMES = [
  "benchmark_campaign_manifests",
  "benchmark_scenario_manifests",
  "benchmark_fixture_manifests",
  "benchmark_ground_truth_manifests",
  "benchmark_runtime_manifests",
  "benchmark_instrumentation_manifests",
  "benchmark_block_manifests",
  "benchmark_arm_plans",
  "benchmark_preflight_records",
  "benchmark_formal_attempts",
  "benchmark_block_dispositions",
  "benchmark_replacement_lineage",
  "benchmark_publication_plans",
  "benchmark_publication_decisions"
] as const;

export const BENCHMARK_CAMPAIGN_MANIFEST_FIELDS = [
  "campaign_manifest_schema_version",
  "benchmark_protocol_version",
  "benchmark_campaign_id",
  "scenario_set_digest",
  "analysis_plan_digest",
  "exclusion_policy_version",
  "replacement_policy_version",
  "created_at",
  "campaign_manifest_digest"
] as const;

export const BENCHMARK_SCENARIO_MANIFEST_FIELDS = [
  "scenario_manifest_schema_version",
  "scenario_id",
  "scenario_version",
  "title",
  "task_type",
  "task_input",
  "task_input_digest",
  "ground_truth_id",
  "ground_truth_digest",
  "created_at",
  "scenario_digest"
] as const;

export const BENCHMARK_FIXTURE_MANIFEST_FIELDS = [
  "fixture_manifest_schema_version",
  "fixture_id",
  "fixture_version",
  "repository_source",
  "repository_revision",
  "repository_snapshot_digest",
  "setup_contract_digest",
  "reset_contract_digest",
  "candidate_corpus_digest",
  "created_at",
  "fixture_digest"
] as const;

export const BENCHMARK_GROUND_TRUTH_FIELDS = [
  "ground_truth_schema_version",
  "ground_truth_id",
  "scenario_id",
  "scenario_version",
  "expected_action",
  "applicable_node_ids",
  "applicable_candidate_ids",
  "distractor_node_ids",
  "distractor_candidate_ids",
  "scope_validity",
  "safety_constraints",
  "deterministic_success_checks",
  "known_old_mistake_path",
  "created_at",
  "ground_truth_digest"
] as const;

export const BENCHMARK_GROUND_TRUTH_V2_FIELDS = [
  ...BENCHMARK_GROUND_TRUTH_FIELDS,
  "decision_opportunities"
] as const;

export const BENCHMARK_RUNTIME_MANIFEST_FIELDS = [
  "runtime_manifest_schema_version",
  "runtime_manifest_id",
  "package_name",
  "package_version",
  "published_channel",
  "artifact_integrity",
  "registry_record_identity",
  "openclaw_version",
  "node_version",
  "platform",
  "host_identity",
  "host_model_provider",
  "host_model_identity_fingerprint",
  "host_model_parameters_digest",
  "configuration_digest",
  "profile_registry_digest",
  "benchmark_evidence_target_id",
  "created_at",
  "runtime_manifest_digest"
] as const;

export const BENCHMARK_INSTRUMENTATION_MANIFEST_FIELDS = [
  "instrumentation_manifest_schema_version",
  "instrumentation_manifest_id",
  "harness_version",
  "transcript_adapter_version",
  "scorer_version",
  "observer_contract_digest",
  "timeout_policy_digest",
  "resource_policy_digest",
  "fixture_reset_policy_digest",
  "network_retry_policy_version",
  "collected_metrics",
  "unavailable_metric_policy",
  "created_at",
  "instrumentation_manifest_digest"
] as const;

export const MATCHED_BLOCK_MANIFEST_FIELDS = [
  "benchmark_manifest_schema_version",
  "benchmark_protocol_version",
  "benchmark_campaign_id",
  "benchmark_profile_registry_digest",
  "benchmark_evidence_target_id",
  "scenario_id",
  "scenario_version",
  "scenario_digest",
  "scenario_set_digest",
  "fixture_id",
  "ground_truth_id",
  "runtime_manifest_id",
  "instrumentation_manifest_id",
  "block_id",
  "replacement_for_block_id",
  "replacement_generation",
  "repetition_index",
  "randomization_seed",
  "planned_arm_order",
  "repository_snapshot_digest",
  "task_input_digest",
  "candidate_corpus_digest",
  "host_identity",
  "host_model_provider",
  "host_model_identity_fingerprint",
  "host_model_parameters_digest",
  "environment_contract_digest",
  "network_retry_policy_version",
  "harness_version",
  "transcript_adapter_version",
  "scorer_version",
  "analysis_plan_digest",
  "exclusion_policy_version",
  "replacement_policy_version",
  "created_at",
  "sealed_at",
  "manifest_digest"
] as const;

export const MATCHED_BLOCK_ARM_PLAN_FIELDS = [
  "arm_plan_schema_version",
  "benchmark_campaign_id",
  "block_id",
  "manifest_digest",
  "arm",
  "planned_ordinal",
  "workspace_isolation_id",
  "ee_home_isolation_id",
  "host_session_isolation_id",
  "arm_control_digest"
] as const;

export const BENCHMARK_PREFLIGHT_RECORD_FIELDS = [
  "preflight_record_schema_version",
  "benchmark_campaign_id",
  "block_id",
  "manifest_digest",
  "arm",
  "preflight_attempt_id",
  "preflight_attempt_number",
  "preflight_stage",
  "status",
  "failure_code",
  "started_at",
  "finished_at",
  "evidence_digest"
] as const;

export const BENCHMARK_FORMAL_ATTEMPT_FIELDS = [
  "attempt_record_schema_version",
  "benchmark_campaign_id",
  "block_id",
  "manifest_digest",
  "arm",
  "attempt_id",
  "attempt_number",
  "attempt_state_revision",
  "planned_ordinal",
  "execution_status",
  "task_outcome",
  "task_timeout",
  "infrastructure_failure_code",
  "product_runtime_failure_codes",
  "started_at",
  "finished_at",
  "workspace_artifact_digest",
  "host_transcript_digest",
  "arm_neutral_metrics_digest",
  "deterministic_check_digest",
  "scoring_record_digest"
] as const;

export const BENCHMARK_BLOCK_DISPOSITION_FIELDS = [
  "block_disposition_schema_version",
  "benchmark_campaign_id",
  "block_id",
  "manifest_digest",
  "disposition",
  "reason_code",
  "affected_arms",
  "detected_at",
  "detected_by",
  "evidence_digest",
  "replacement_block_id"
] as const;

export const BENCHMARK_REPLACEMENT_LINEAGE_FIELDS = [
  "replacement_record_schema_version",
  "benchmark_campaign_id",
  "original_block_id",
  "original_manifest_digest",
  "replacement_block_id",
  "replacement_manifest_digest",
  "replacement_generation",
  "reason_code",
  "approved_at",
  "approved_by",
  "evidence_digest"
] as const;

export const BENCHMARK_PUBLICATION_PLAN_FIELDS = [
  "publication_plan_schema_version",
  "benchmark_campaign_id",
  "analysis_plan_digest",
  "minimum_repetitions_per_scenario",
  "minimum_complete_block_coverage",
  "minimum_infrastructure_reliability",
  "quality_thresholds",
  "uncertainty_method",
  "negative_result_disclosure_required",
  "sensitivity_exclusion_policy_version",
  "created_at",
  "sealed_at",
  "publication_plan_digest"
] as const;

export const BENCHMARK_PUBLICATION_DECISION_FIELDS = [
  "publication_decision_schema_version",
  "benchmark_campaign_id",
  "publication_plan_digest",
  "decision",
  "threshold_results",
  "complete_block_count",
  "attempted_arm_count",
  "evidence_digest",
  "created_at"
] as const;
