import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import { computeMatchedBlockArmControlDigest } from "./arm-control.js";
import { MATCHED_BLOCK_SCHEMA_VERSIONS } from "./constants.js";
import { computeBenchmarkRecordDigest } from "./contract.js";
import {
  computeMatchedBlockExecutionContractDigest,
  type MatchedBlockHarnessExecutionContract
} from "./harness.js";
import {
  assertOpenClawMultiScenarioCampaignPlan,
  type OpenClawMultiScenarioBlockPlan,
  type OpenClawMultiScenarioCampaignPlan
} from "./openclaw-multi-scenario-plan.js";
import type {
  BenchmarkFixtureManifest,
  BenchmarkInstrumentationManifest,
  BenchmarkPublicationPlan,
  BenchmarkRuntimeManifest,
  MatchedBlockArmPlan,
  MatchedBlockManifest
} from "./types.js";

export type OpenClawMultiScenarioExecutionBlock = {
  plan_block: OpenClawMultiScenarioBlockPlan;
  block_manifest: MatchedBlockManifest;
  arm_plans: MatchedBlockArmPlan[];
};

export type OpenClawMultiScenarioExecutionBundle = {
  fixtures: BenchmarkFixtureManifest[];
  instrumentation: BenchmarkInstrumentationManifest;
  publication_plan: BenchmarkPublicationPlan;
  blocks: OpenClawMultiScenarioExecutionBlock[];
};

const withDigest = <T extends Record<string, unknown>, K extends keyof T & string>(
  value: T,
  field: K
): T => ({
  ...value,
  [field]: computeBenchmarkRecordDigest(value, field)
});

const digest = (value: unknown): string => sha256Text(canonicalJson(value));

const fixtureContractForKind = (kind: string): Record<string, unknown> => {
  if (kind === "inject") {
    return {
      workspace_files: [],
      success_artifact: "result.txt",
      project_marker_ancestor: "forbidden"
    };
  }
  if (kind === "correct_skip") {
    return {
      workspace_files: ["package.json"],
      success_artifact: "answer.txt",
      forbidden_artifact: "result.txt",
      existing_files_immutable: true,
      project_marker_ancestor: "forbidden"
    };
  }
  return {
    workspace_files: ["auth-fixture.json", "focused-auth-test.mjs"],
    exposure_result: "FAIL",
    recovery_result: "PASS",
    task_fixture_reset_between_opportunities: true,
    ee_governance_state_reset_between_opportunities: false,
    project_marker_ancestor: "forbidden"
  };
};

export const createOpenClawMultiScenarioExecutionBundle = (options: {
  plan: OpenClawMultiScenarioCampaignPlan;
  runtimeManifest: BenchmarkRuntimeManifest;
  executionContract: MatchedBlockHarnessExecutionContract;
}): OpenClawMultiScenarioExecutionBundle => {
  const plan = assertOpenClawMultiScenarioCampaignPlan(options.plan);
  const executionContractDigest = computeMatchedBlockExecutionContractDigest(
    options.executionContract
  );
  const fixtures = plan.scenarios.map(({ adapter }) => withDigest({
    fixture_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.fixture,
    fixture_id: `${adapter.scenario_id}-fixture`,
    fixture_version: adapter.scenario_version,
    repository_source: "generated://phase-0.5c-openclaw-multi-scenario",
    repository_revision: `${adapter.scenario_set_version}:${adapter.scenario_version}`,
    repository_snapshot_digest: digest(fixtureContractForKind(adapter.scenario_kind)),
    setup_contract_digest: digest({
      scenario_kind: adapter.scenario_kind,
      fixture: fixtureContractForKind(adapter.scenario_kind),
      candidate_corpus_digest: digest(adapter.candidate_corpus)
    }),
    reset_contract_digest: options.executionContract.fixture_reset_policy_digest,
    candidate_corpus_digest: digest(adapter.candidate_corpus),
    created_at: plan.created_at,
    fixture_digest: ""
  } satisfies BenchmarkFixtureManifest, "fixture_digest"));
  const fixtureByScenarioId = new Map(
    plan.scenarios.map((scenario, index) => [scenario.adapter.scenario_id, fixtures[index]!])
  );

  const instrumentation = withDigest({
    instrumentation_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.instrumentation,
    instrumentation_manifest_id: `${plan.campaign_manifest.benchmark_campaign_id}-instrumentation`,
    harness_version: options.executionContract.harness_version,
    transcript_adapter_version: options.executionContract.transcript_adapter_version,
    scorer_version: options.executionContract.scorer_version,
    observer_contract_digest: options.executionContract.observer_contract_digest,
    timeout_policy_digest: options.executionContract.timeout_policy_digest,
    resource_policy_digest: options.executionContract.resource_policy_digest,
    fixture_reset_policy_digest: options.executionContract.fixture_reset_policy_digest,
    network_retry_policy_version: options.executionContract.network_retry_policy_version,
    collected_metrics: [
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
    ],
    unavailable_metric_policy: "mark_unavailable",
    created_at: plan.created_at,
    instrumentation_manifest_digest: ""
  } satisfies BenchmarkInstrumentationManifest, "instrumentation_manifest_digest");

  const publicationPlan = withDigest({
    publication_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.publicationPlan,
    benchmark_campaign_id: plan.campaign_manifest.benchmark_campaign_id,
    analysis_plan_digest: plan.campaign_manifest.analysis_plan_digest,
    minimum_repetitions_per_scenario: 5,
    minimum_complete_block_coverage: 0.8,
    minimum_infrastructure_reliability: 0.95,
    quality_thresholds: {
      harmful_rate: 0.05,
      infrastructure_failure_rate: 0.05
    },
    uncertainty_method: "scenario_cluster_normal_95_v1",
    negative_result_disclosure_required: true,
    sensitivity_exclusion_policy_version: "sensitivity-exclusion-v1",
    created_at: plan.created_at,
    sealed_at: plan.created_at,
    publication_plan_digest: ""
  } satisfies BenchmarkPublicationPlan, "publication_plan_digest");

  const blocks = plan.scenarios.flatMap((scenario) => {
    const fixture = fixtureByScenarioId.get(scenario.adapter.scenario_id)!;
    return scenario.blocks.map((planBlock) => {
      const blockManifest = withDigest({
        benchmark_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.block,
        benchmark_protocol_version: plan.benchmark_protocol_version,
        benchmark_campaign_id: plan.campaign_manifest.benchmark_campaign_id,
        benchmark_profile_registry_digest: options.runtimeManifest.profile_registry_digest,
        benchmark_evidence_target_id: options.runtimeManifest.benchmark_evidence_target_id,
        scenario_id: scenario.scenario_manifest.scenario_id,
        scenario_version: scenario.scenario_manifest.scenario_version,
        scenario_digest: scenario.scenario_manifest.scenario_digest,
        scenario_set_digest: plan.campaign_manifest.scenario_set_digest,
        fixture_id: fixture.fixture_id,
        ground_truth_id: scenario.ground_truth.ground_truth_id,
        runtime_manifest_id: options.runtimeManifest.runtime_manifest_id,
        instrumentation_manifest_id: instrumentation.instrumentation_manifest_id,
        block_id: planBlock.block_id,
        replacement_for_block_id: null,
        replacement_generation: 0,
        repetition_index: planBlock.repetition_index,
        randomization_seed: planBlock.randomization_seed,
        planned_arm_order: planBlock.planned_arm_order,
        repository_snapshot_digest: fixture.repository_snapshot_digest,
        task_input_digest: scenario.scenario_manifest.task_input_digest,
        candidate_corpus_digest: fixture.candidate_corpus_digest,
        host_identity: options.runtimeManifest.host_identity,
        host_model_provider: options.runtimeManifest.host_model_provider,
        host_model_identity_fingerprint: options.runtimeManifest.host_model_identity_fingerprint,
        host_model_parameters_digest: options.runtimeManifest.host_model_parameters_digest,
        environment_contract_digest: executionContractDigest,
        network_retry_policy_version: options.executionContract.network_retry_policy_version,
        harness_version: options.executionContract.harness_version,
        transcript_adapter_version: options.executionContract.transcript_adapter_version,
        scorer_version: options.executionContract.scorer_version,
        analysis_plan_digest: plan.campaign_manifest.analysis_plan_digest,
        exclusion_policy_version: plan.campaign_manifest.exclusion_policy_version,
        replacement_policy_version: plan.campaign_manifest.replacement_policy_version,
        created_at: plan.created_at,
        sealed_at: plan.created_at,
        manifest_digest: ""
      } satisfies MatchedBlockManifest, "manifest_digest");
      const armPlans = planBlock.planned_arm_order.map((arm, index) => ({
        arm_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.armPlan,
        benchmark_campaign_id: plan.campaign_manifest.benchmark_campaign_id,
        block_id: blockManifest.block_id,
        manifest_digest: blockManifest.manifest_digest,
        arm,
        planned_ordinal: index + 1,
        workspace_isolation_id: `${blockManifest.block_id}-${arm}-workspace`,
        ee_home_isolation_id: `${blockManifest.block_id}-${arm}-ee-home`,
        host_session_isolation_id: `${blockManifest.block_id}-${arm}-session`,
        arm_control_digest: computeMatchedBlockArmControlDigest(arm)
      } satisfies MatchedBlockArmPlan));
      return {
        plan_block: planBlock,
        block_manifest: blockManifest,
        arm_plans: armPlans
      } satisfies OpenClawMultiScenarioExecutionBlock;
    });
  });

  return {
    fixtures,
    instrumentation,
    publication_plan: publicationPlan,
    blocks
  };
};
