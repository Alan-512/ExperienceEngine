import { sha256Text } from "../../src/runtime/package/package-generation.js";
import {
  BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS,
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "../../src/evaluation/matched-block/constants.js";
import {
  computeMatchedBlockArmControlDigest,
  deriveMatchedBlockArmOrder
} from "../../src/evaluation/matched-block/arm-control.js";
import {
  computeBenchmarkRecordDigest
} from "../../src/evaluation/matched-block/contract.js";
import {
  computeMatchedBlockExecutionContractDigest,
  type MatchedBlockHarnessExecutionContract
} from "../../src/evaluation/matched-block/harness.js";
import { MatchedBlockBenchmarkStore } from "../../src/evaluation/matched-block/store.js";
import type {
  BenchmarkCampaignManifest,
  BenchmarkFixtureManifest,
  BenchmarkGroundTruth,
  BenchmarkInstrumentationManifest,
  BenchmarkPublicationPlan,
  BenchmarkRuntimeManifest,
  BenchmarkScenarioManifest,
  MatchedBlockArmPlan,
  MatchedBlockManifest
} from "../../src/evaluation/matched-block/types.js";

export const MATCHED_BLOCK_TEST_CREATED_AT = "2026-07-16T08:00:00.000Z";

export const DEFAULT_MATCHED_BLOCK_EXECUTION_CONTRACT: MatchedBlockHarnessExecutionContract = {
  preflight_attempt_limit: 2,
  harness_version: "harness-v1",
  transcript_adapter_version: "transcript-v1",
  scorer_version: "scorer-v1",
  observer_contract_digest: "observer-contract-digest",
  timeout_policy_digest: "timeout-policy-digest",
  resource_policy_digest: "resource-policy-digest",
  fixture_reset_policy_digest: "fixture-reset-policy-digest",
  network_retry_policy_version: "network-retry-v1"
};

export const withBenchmarkDigest = <T extends Record<string, unknown>>(
  value: T,
  digestField: keyof T & string
): T => {
  const next: Record<string, unknown> = { ...value };
  next[digestField] = computeBenchmarkRecordDigest(next, digestField);
  return next as T;
};

export const createMatchedBlockHarnessStoreFixture = (options: {
  databasePath: string;
  seed?: string;
  blockId?: string;
  executionContract?: MatchedBlockHarnessExecutionContract;
}) => {
  const executionContract = options.executionContract ?? DEFAULT_MATCHED_BLOCK_EXECUTION_CONTRACT;
  const campaign = withBenchmarkDigest({
    campaign_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.campaign,
    benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
    benchmark_campaign_id: "campaign-harness-1",
    scenario_set_digest: "scenario-set-digest",
    analysis_plan_digest: "analysis-plan-digest",
    exclusion_policy_version: "exclusion-v1",
    replacement_policy_version: "replacement-v1",
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    campaign_manifest_digest: ""
  } satisfies BenchmarkCampaignManifest, "campaign_manifest_digest");
  const groundTruth = withBenchmarkDigest({
    ground_truth_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.groundTruth,
    ground_truth_id: "ground-truth-harness-1",
    scenario_id: "scenario-harness-1",
    scenario_version: "1",
    expected_action: "inject",
    applicable_node_ids: ["node-1"],
    applicable_candidate_ids: [],
    distractor_node_ids: ["node-distractor"],
    distractor_candidate_ids: [],
    scope_validity: {
      valid: true,
      reason_code: "scope_matches"
    },
    safety_constraints: ["read_only"],
    deterministic_success_checks: ["command_exit_zero"],
    known_old_mistake_path: "run_from_wrong_directory",
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    ground_truth_digest: ""
  } satisfies BenchmarkGroundTruth, "ground_truth_digest");
  const taskInput = "Run the sealed deterministic repository verification task.";
  const scenario = withBenchmarkDigest({
    scenario_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.scenario,
    scenario_id: groundTruth.scenario_id,
    scenario_version: groundTruth.scenario_version,
    title: "Sealed deterministic repository verification",
    task_type: "test_debug",
    task_input: taskInput,
    task_input_digest: sha256Text(taskInput),
    ground_truth_id: groundTruth.ground_truth_id,
    ground_truth_digest: groundTruth.ground_truth_digest,
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    scenario_digest: ""
  } satisfies BenchmarkScenarioManifest, "scenario_digest");
  const fixture = withBenchmarkDigest({
    fixture_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.fixture,
    fixture_id: "fixture-harness-1",
    fixture_version: "1",
    repository_source: "fixture://experienceengine",
    repository_revision: "fixture-revision-1",
    repository_snapshot_digest: "repository-snapshot-digest",
    setup_contract_digest: "setup-contract-digest",
    reset_contract_digest: executionContract.fixture_reset_policy_digest,
    candidate_corpus_digest: "candidate-corpus-digest",
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    fixture_digest: ""
  } satisfies BenchmarkFixtureManifest, "fixture_digest");
  const runtime = withBenchmarkDigest({
    runtime_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.runtime,
    runtime_manifest_id: "runtime-harness-1",
    package_name: "@alan512/experienceengine",
    package_version: "0.5.1",
    published_channel: "clawhub",
    artifact_integrity: "sha512-runtime",
    registry_record_identity: "clawhub:@alan512/experienceengine@0.5.1:identity",
    openclaw_version: "OpenClaw 2026.7.1",
    node_version: "v22.21.0",
    platform: "linux-x64",
    host_identity: "openclaw-linux-x64",
    host_model_provider: "openrouter",
    host_model_identity_fingerprint: "model-fingerprint",
    host_model_parameters_digest: "model-parameters-digest",
    configuration_digest: "configuration-digest",
    profile_registry_digest: "profile-registry-digest",
    benchmark_evidence_target_id: "evidence-target-1",
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    runtime_manifest_digest: ""
  } satisfies BenchmarkRuntimeManifest, "runtime_manifest_digest");
  const instrumentation = withBenchmarkDigest({
    instrumentation_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.instrumentation,
    instrumentation_manifest_id: "instrumentation-harness-1",
    harness_version: executionContract.harness_version,
    transcript_adapter_version: executionContract.transcript_adapter_version,
    scorer_version: executionContract.scorer_version,
    observer_contract_digest: executionContract.observer_contract_digest,
    timeout_policy_digest: executionContract.timeout_policy_digest,
    resource_policy_digest: executionContract.resource_policy_digest,
    fixture_reset_policy_digest: executionContract.fixture_reset_policy_digest,
    network_retry_policy_version: executionContract.network_retry_policy_version,
    collected_metrics: [...BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS],
    unavailable_metric_policy: "mark_unavailable",
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    instrumentation_manifest_digest: ""
  } satisfies BenchmarkInstrumentationManifest, "instrumentation_manifest_digest");
  const publicationPlan = withBenchmarkDigest({
    publication_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.publicationPlan,
    benchmark_campaign_id: campaign.benchmark_campaign_id,
    analysis_plan_digest: campaign.analysis_plan_digest,
    minimum_repetitions_per_scenario: 1,
    minimum_complete_block_coverage: 1,
    minimum_infrastructure_reliability: 0.8,
    quality_thresholds: {
      harmful_rate: 0.2,
      infrastructure_failure_rate: 0.2
    },
    uncertainty_method: "scenario_cluster_normal_95_v1",
    negative_result_disclosure_required: true,
    sensitivity_exclusion_policy_version: "sensitivity-exclusion-v1",
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    sealed_at: MATCHED_BLOCK_TEST_CREATED_AT,
    publication_plan_digest: ""
  } satisfies BenchmarkPublicationPlan, "publication_plan_digest");
  const randomizationSeed = options.seed ?? "harness-seed-1";
  const block = withBenchmarkDigest({
    benchmark_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.block,
    benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
    benchmark_campaign_id: campaign.benchmark_campaign_id,
    benchmark_profile_registry_digest: runtime.profile_registry_digest,
    benchmark_evidence_target_id: runtime.benchmark_evidence_target_id,
    scenario_id: scenario.scenario_id,
    scenario_version: scenario.scenario_version,
    scenario_digest: scenario.scenario_digest,
    scenario_set_digest: campaign.scenario_set_digest,
    fixture_id: fixture.fixture_id,
    ground_truth_id: groundTruth.ground_truth_id,
    runtime_manifest_id: runtime.runtime_manifest_id,
    instrumentation_manifest_id: instrumentation.instrumentation_manifest_id,
    block_id: options.blockId ?? "block-harness-1",
    replacement_for_block_id: null,
    replacement_generation: 0,
    repetition_index: 1,
    randomization_seed: randomizationSeed,
    planned_arm_order: deriveMatchedBlockArmOrder(randomizationSeed),
    repository_snapshot_digest: fixture.repository_snapshot_digest,
    task_input_digest: scenario.task_input_digest,
    candidate_corpus_digest: fixture.candidate_corpus_digest,
    host_identity: runtime.host_identity,
    host_model_provider: runtime.host_model_provider,
    host_model_identity_fingerprint: runtime.host_model_identity_fingerprint,
    host_model_parameters_digest: runtime.host_model_parameters_digest,
    environment_contract_digest: computeMatchedBlockExecutionContractDigest(executionContract),
    network_retry_policy_version: instrumentation.network_retry_policy_version,
    harness_version: instrumentation.harness_version,
    transcript_adapter_version: instrumentation.transcript_adapter_version,
    scorer_version: instrumentation.scorer_version,
    analysis_plan_digest: campaign.analysis_plan_digest,
    exclusion_policy_version: campaign.exclusion_policy_version,
    replacement_policy_version: campaign.replacement_policy_version,
    created_at: MATCHED_BLOCK_TEST_CREATED_AT,
    sealed_at: MATCHED_BLOCK_TEST_CREATED_AT,
    manifest_digest: ""
  } satisfies MatchedBlockManifest, "manifest_digest");
  const armPlans: MatchedBlockArmPlan[] = block.planned_arm_order.map((arm, index) => ({
    arm_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.armPlan,
    benchmark_campaign_id: block.benchmark_campaign_id,
    block_id: block.block_id,
    manifest_digest: block.manifest_digest,
    arm,
    planned_ordinal: index + 1,
    workspace_isolation_id: `${block.block_id}-${arm}-workspace`,
    ee_home_isolation_id: `${block.block_id}-${arm}-ee-home`,
    host_session_isolation_id: `${block.block_id}-${arm}-session`,
    arm_control_digest: computeMatchedBlockArmControlDigest(arm)
  }));

  const store = new MatchedBlockBenchmarkStore(options.databasePath);
  store.insertCampaignManifest(campaign);
  store.insertGroundTruth(groundTruth);
  store.insertScenarioManifest(scenario);
  store.insertFixtureManifest(fixture);
  store.insertRuntimeManifest(runtime);
  store.insertInstrumentationManifest(instrumentation);
  store.insertPublicationPlan(publicationPlan);
  store.insertSealedBlock(block, armPlans);

  return {
    store,
    campaign,
    groundTruth,
    scenario,
    fixture,
    runtime,
    instrumentation,
    publicationPlan,
    block,
    armPlans,
    executionContract
  };
};
