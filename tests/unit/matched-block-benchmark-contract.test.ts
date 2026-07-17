import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Text } from "../../src/runtime/package/package-generation.js";
import {
  BENCHMARK_ATTEMPT_EXECUTION_STATUSES,
  BENCHMARK_BLOCK_DISPOSITIONS,
  BENCHMARK_CAMPAIGN_MANIFEST_FIELDS,
  BENCHMARK_CONFUSION_MATRIX_CELLS,
  BENCHMARK_FORMAL_ATTEMPT_FIELDS,
  BENCHMARK_INFRASTRUCTURE_FAILURE_CODES,
  BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS,
  BENCHMARK_STATISTICAL_UNITS,
  BENCHMARK_TABLE_NAMES,
  MATCHED_BLOCK_ARMS,
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
  MATCHED_BLOCK_MANIFEST_FIELDS,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "../../src/evaluation/matched-block/constants.js";
import {
  assertBenchmarkFormalAttempt,
  assertBenchmarkGroundTruth,
  aggregateBenchmarkInterventionEventOutcome,
  assertCompleteMatchedBlockArmPlans,
  assertMatchedBlockManifest,
  computeBenchmarkRecordDigest,
  MatchedBlockBenchmarkContractError
} from "../../src/evaluation/matched-block/contract.js";
import { computeMatchedBlockArmControlDigest } from "../../src/evaluation/matched-block/arm-control.js";
import {
  MatchedBlockBenchmarkStore,
  MatchedBlockBenchmarkStoreError
} from "../../src/evaluation/matched-block/store.js";
import type {
  BenchmarkBlockDispositionRecord,
  BenchmarkCampaignManifest,
  BenchmarkFixtureManifest,
  BenchmarkFormalAttempt,
  BenchmarkGroundTruth,
  BenchmarkGroundTruthV2,
  BenchmarkInstrumentationManifest,
  BenchmarkPreflightRecord,
  BenchmarkPublicationDecision,
  BenchmarkPublicationPlan,
  BenchmarkReplacementLineageRecord,
  BenchmarkRuntimeManifest,
  BenchmarkScenarioManifest,
  MatchedBlockArm,
  MatchedBlockArmPlan,
  MatchedBlockManifest
} from "../../src/evaluation/matched-block/types.js";

const tempDirs: string[] = [];
const createdAt = "2026-07-16T08:00:00.000Z";

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});
const withDigest = <T extends Record<string, unknown>>(
  value: T,
  digestField: keyof T & string
): T => {
  const next: Record<string, unknown> = { ...value };
  next[digestField] = computeBenchmarkRecordDigest(next, digestField);
  return next as T;
};

const buildGroundTruth = (overrides: Partial<BenchmarkGroundTruth> = {}): BenchmarkGroundTruth =>
  withDigest({
    ground_truth_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.groundTruth,
    ground_truth_id: "ground-truth-1",
    scenario_id: "scenario-1",
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
    created_at: createdAt,
    ground_truth_digest: "",
    ...overrides
  } satisfies BenchmarkGroundTruth, "ground_truth_digest");

const buildGroundTruthV2 = (
  overrides: Partial<BenchmarkGroundTruthV2> = {}
): BenchmarkGroundTruthV2 => withDigest({
  ground_truth_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.groundTruthV2,
  ground_truth_id: "ground-truth-v2-1",
  scenario_id: "scenario-v2-1",
  scenario_version: "2",
  expected_action: "skip",
  applicable_node_ids: [],
  applicable_candidate_ids: [],
  distractor_node_ids: ["node-distractor"],
  distractor_candidate_ids: [],
  scope_validity: {
    valid: true,
    reason_code: "scope_matches"
  },
  safety_constraints: ["read_only"],
  deterministic_success_checks: ["command_exit_zero"],
  known_old_mistake_path: null,
  created_at: createdAt,
  decision_opportunities: [{
    opportunity_id: "skip-check",
    ordinal: 1,
    expected_action: "skip",
    plausible_node_ids: ["node-distractor"],
    plausible_candidate_ids: [],
    candidate_consideration_required: true,
    valid_skip_reason_codes: ["applicability_mismatch"],
    requires_prior_harm: false,
    known_old_mistake_path: null
  }],
  ground_truth_digest: "",
  ...overrides
} satisfies BenchmarkGroundTruthV2, "ground_truth_digest");

const buildCampaign = (): BenchmarkCampaignManifest => withDigest({
  campaign_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.campaign,
  benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  benchmark_campaign_id: "campaign-1",
  scenario_set_digest: "scenario-set-digest",
  analysis_plan_digest: "analysis-plan-digest",
  exclusion_policy_version: "exclusion-v1",
  replacement_policy_version: "replacement-v1",
  created_at: createdAt,
  campaign_manifest_digest: ""
} satisfies BenchmarkCampaignManifest, "campaign_manifest_digest");

const buildScenario = (groundTruth: BenchmarkGroundTruth): BenchmarkScenarioManifest => {
  const taskInput = "Run the deterministic repository verification task.";
  return withDigest({
    scenario_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.scenario,
    scenario_id: groundTruth.scenario_id,
    scenario_version: groundTruth.scenario_version,
    title: "Deterministic repository verification",
    task_type: "test_debug",
    task_input: taskInput,
    task_input_digest: sha256Text(taskInput),
    ground_truth_id: groundTruth.ground_truth_id,
    ground_truth_digest: groundTruth.ground_truth_digest,
    created_at: createdAt,
    scenario_digest: ""
  } satisfies BenchmarkScenarioManifest, "scenario_digest");
};

const buildFixture = (): BenchmarkFixtureManifest => withDigest({
  fixture_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.fixture,
  fixture_id: "fixture-1",
  fixture_version: "1",
  repository_source: "fixture://experienceengine",
  repository_revision: "fixture-revision-1",
  repository_snapshot_digest: "repository-snapshot-digest",
  setup_contract_digest: "setup-contract-digest",
  reset_contract_digest: "reset-contract-digest",
  candidate_corpus_digest: "candidate-corpus-digest",
  created_at: createdAt,
  fixture_digest: ""
} satisfies BenchmarkFixtureManifest, "fixture_digest");

const buildRuntime = (): BenchmarkRuntimeManifest => withDigest({
  runtime_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.runtime,
  runtime_manifest_id: "runtime-1",
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
  created_at: createdAt,
  runtime_manifest_digest: ""
} satisfies BenchmarkRuntimeManifest, "runtime_manifest_digest");

const buildInstrumentation = (): BenchmarkInstrumentationManifest => withDigest({
  instrumentation_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.instrumentation,
  instrumentation_manifest_id: "instrumentation-1",
  harness_version: "harness-v1",
  transcript_adapter_version: "transcript-v1",
  scorer_version: "scorer-v1",
  observer_contract_digest: "observer-contract-digest",
  timeout_policy_digest: "timeout-policy-digest",
  resource_policy_digest: "resource-policy-digest",
  fixture_reset_policy_digest: "fixture-reset-policy-digest",
  network_retry_policy_version: "network-retry-v1",
  collected_metrics: [...BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS],
  unavailable_metric_policy: "mark_unavailable",
  created_at: createdAt,
  instrumentation_manifest_digest: ""
} satisfies BenchmarkInstrumentationManifest, "instrumentation_manifest_digest");

const buildPublicationPlan = (): BenchmarkPublicationPlan => withDigest({
  publication_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.publicationPlan,
  benchmark_campaign_id: "campaign-1",
  analysis_plan_digest: "analysis-plan-digest",
  minimum_repetitions_per_scenario: 5,
  minimum_complete_block_coverage: 0.8,
  minimum_infrastructure_reliability: 0.9,
  quality_thresholds: {
    harmful_rate: 0.02,
    correct_skip_rate: 0.9
  },
  uncertainty_method: "scenario_cluster_bootstrap_v1",
  negative_result_disclosure_required: true,
  sensitivity_exclusion_policy_version: "sensitivity-v1",
  created_at: createdAt,
  sealed_at: createdAt,
  publication_plan_digest: ""
} satisfies BenchmarkPublicationPlan, "publication_plan_digest");

const buildBlock = (input: {
  campaign: BenchmarkCampaignManifest;
  scenario: BenchmarkScenarioManifest;
  fixture: BenchmarkFixtureManifest;
  groundTruth: BenchmarkGroundTruth;
  runtime: BenchmarkRuntimeManifest;
  instrumentation: BenchmarkInstrumentationManifest;
  blockId?: string;
  replacementForBlockId?: string | null;
  replacementGeneration?: number;
  seed?: string;
}): MatchedBlockManifest => withDigest({
  benchmark_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.block,
  benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  benchmark_campaign_id: input.campaign.benchmark_campaign_id,
  benchmark_profile_registry_digest: input.runtime.profile_registry_digest,
  benchmark_evidence_target_id: input.runtime.benchmark_evidence_target_id,
  scenario_id: input.scenario.scenario_id,
  scenario_version: input.scenario.scenario_version,
  scenario_digest: input.scenario.scenario_digest,
  scenario_set_digest: input.campaign.scenario_set_digest,
  fixture_id: input.fixture.fixture_id,
  ground_truth_id: input.groundTruth.ground_truth_id,
  runtime_manifest_id: input.runtime.runtime_manifest_id,
  instrumentation_manifest_id: input.instrumentation.instrumentation_manifest_id,
  block_id: input.blockId ?? "block-1",
  replacement_for_block_id: input.replacementForBlockId ?? null,
  replacement_generation: input.replacementGeneration ?? 0,
  repetition_index: 1,
  randomization_seed: input.seed ?? "seed-1",
  planned_arm_order: ["forced_holdout", "no_ee", "treatment"],
  repository_snapshot_digest: input.fixture.repository_snapshot_digest,
  task_input_digest: input.scenario.task_input_digest,
  candidate_corpus_digest: input.fixture.candidate_corpus_digest,
  host_identity: input.runtime.host_identity,
  host_model_provider: input.runtime.host_model_provider,
  host_model_identity_fingerprint: input.runtime.host_model_identity_fingerprint,
  host_model_parameters_digest: input.runtime.host_model_parameters_digest,
  environment_contract_digest: "environment-contract-digest",
  network_retry_policy_version: input.instrumentation.network_retry_policy_version,
  harness_version: input.instrumentation.harness_version,
  transcript_adapter_version: input.instrumentation.transcript_adapter_version,
  scorer_version: input.instrumentation.scorer_version,
  analysis_plan_digest: input.campaign.analysis_plan_digest,
  exclusion_policy_version: input.campaign.exclusion_policy_version,
  replacement_policy_version: input.campaign.replacement_policy_version,
  created_at: createdAt,
  sealed_at: createdAt,
  manifest_digest: ""
} satisfies MatchedBlockManifest, "manifest_digest");

const buildArmPlans = (block: MatchedBlockManifest): MatchedBlockArmPlan[] =>
  block.planned_arm_order.map((arm, index) => ({
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

const buildRunningAttempt = (
  block: MatchedBlockManifest,
  arm: MatchedBlockArm,
  plannedOrdinal: number
): BenchmarkFormalAttempt => ({
  attempt_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.formalAttempt,
  benchmark_campaign_id: block.benchmark_campaign_id,
  block_id: block.block_id,
  manifest_digest: block.manifest_digest,
  arm,
  attempt_id: `${block.block_id}-${arm}-attempt-1`,
  attempt_number: 1,
  attempt_state_revision: 1,
  planned_ordinal: plannedOrdinal,
  execution_status: "running",
  task_outcome: "unavailable",
  task_timeout: false,
  infrastructure_failure_code: null,
  product_runtime_failure_codes: [],
  started_at: createdAt,
  finished_at: null,
  workspace_artifact_digest: null,
  host_transcript_digest: null,
  arm_neutral_metrics_digest: null,
  deterministic_check_digest: null,
  scoring_record_digest: null
});
const buildTerminalAttempt = (
  running: BenchmarkFormalAttempt,
  overrides: Partial<BenchmarkFormalAttempt> = {}
): BenchmarkFormalAttempt => ({
  ...running,
  attempt_state_revision: 2,
  execution_status: "completed",
  task_outcome: "success",
  finished_at: "2026-07-16T08:01:00.000Z",
  workspace_artifact_digest: "workspace-artifact-digest",
  host_transcript_digest: "host-transcript-digest",
  arm_neutral_metrics_digest: "arm-neutral-metrics-digest",
  deterministic_check_digest: "deterministic-check-digest",
  scoring_record_digest: "scoring-record-digest",
  ...overrides
});
const createStoreFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "experienceengine-matched-block-"));
  tempDirs.push(root);
  const store = new MatchedBlockBenchmarkStore(join(root, "campaign.sqlite"));
  const campaign = buildCampaign();
  const groundTruth = buildGroundTruth();
  const scenario = buildScenario(groundTruth);
  const fixture = buildFixture();
  const runtime = buildRuntime();
  const instrumentation = buildInstrumentation();
  store.insertCampaignManifest(campaign);
  store.insertGroundTruth(groundTruth);
  store.insertScenarioManifest(scenario);
  store.insertFixtureManifest(fixture);
  store.insertRuntimeManifest(runtime);
  store.insertInstrumentationManifest(instrumentation);
  store.insertPublicationPlan(buildPublicationPlan());
  return { store, campaign, groundTruth, scenario, fixture, runtime, instrumentation };
};

describe("matched-block benchmark contract", () => {
  it("materializes the frozen exhaustive protocol members", () => {
    expect(BENCHMARK_STATISTICAL_UNITS).toEqual([
      "decision_opportunity",
      "intervention_event",
      "node_delivery",
      "task_trial"
    ]);
    expect(MATCHED_BLOCK_ARMS).toEqual(["treatment", "forced_holdout", "no_ee"]);
    expect(BENCHMARK_INFRASTRUCTURE_FAILURE_CODES).toEqual([
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
    ]);
    expect(BENCHMARK_ATTEMPT_EXECUTION_STATUSES).toEqual([
      "running",
      "completed",
      "infrastructure_failed",
      "harness_timed_out",
      "cancelled",
      "invalid"
    ]);
    expect(BENCHMARK_BLOCK_DISPOSITIONS).toHaveLength(6);
    expect(BENCHMARK_CONFUSION_MATRIX_CELLS).toHaveLength(9);
    expect(BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS).toHaveLength(14);
    expect(BENCHMARK_CAMPAIGN_MANIFEST_FIELDS).toContain("campaign_manifest_digest");
    expect(MATCHED_BLOCK_MANIFEST_FIELDS).toContain("planned_arm_order");
    expect(BENCHMARK_FORMAL_ATTEMPT_FIELDS).toContain("manifest_digest");
    expect(BENCHMARK_TABLE_NAMES).toHaveLength(14);
  });

  it("rejects omitted fields, digest drift, and an incomplete arm set", () => {
    const groundTruth = buildGroundTruth();
    const scenario = buildScenario(groundTruth);
    const campaign = buildCampaign();
    const fixture = buildFixture();
    const runtime = buildRuntime();
    const instrumentation = buildInstrumentation();
    const block = buildBlock({ campaign, scenario, fixture, groundTruth, runtime, instrumentation });

    const missing = { ...block } as Record<string, unknown>;
    delete missing.scorer_version;
    expect(() => assertMatchedBlockManifest(missing)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_CONTRACT_INVALID" })
    );

    expect(() => assertMatchedBlockManifest({ ...block, task_input_digest: "drift" })).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_DIGEST_MISMATCH" })
    );

    const plans = buildArmPlans(block).slice(0, 2);
    expect(() => assertCompleteMatchedBlockArmPlans(plans)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_REQUIRED_ARM_SET_INVALID" })
    );
  });

  it("requires a plausible candidate or distractor for skip ground truth", () => {
    const invalid = buildGroundTruth({
      expected_action: "skip",
      applicable_node_ids: [],
      applicable_candidate_ids: [],
      distractor_node_ids: [],
      distractor_candidate_ids: []
    });
    expect(() => assertBenchmarkGroundTruth(invalid)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_CONTRACT_INVALID" })
    );
  });

  it("accepts a sealed v2 decision-opportunity sequence", () => {
    const groundTruth = buildGroundTruthV2();
    expect(assertBenchmarkGroundTruth(groundTruth)).toEqual(groundTruth);
    const campaign = withDigest({
      ...buildCampaign(),
      benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
      campaign_manifest_digest: ""
    }, "campaign_manifest_digest");
    expect(campaign.benchmark_protocol_version).toBe(MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2);
  });

  it("rejects duplicate, non-contiguous, and undeclared v2 opportunities", () => {
    const duplicate = buildGroundTruthV2({
      expected_action: "skip",
      decision_opportunities: [
        buildGroundTruthV2().decision_opportunities[0]!,
        {
          ...buildGroundTruthV2().decision_opportunities[0]!,
          ordinal: 2
        }
      ]
    });
    expect(() => assertBenchmarkGroundTruth(duplicate)).toThrow("ids and ordinals must be unique");

    const nonContiguous = buildGroundTruthV2({
      decision_opportunities: [{
        ...buildGroundTruthV2().decision_opportunities[0]!,
        ordinal: 2
      }]
    });
    expect(() => assertBenchmarkGroundTruth(nonContiguous)).toThrow("contiguous from one");

    const undeclared = buildGroundTruthV2({
      decision_opportunities: [{
        ...buildGroundTruthV2().decision_opportunities[0]!,
        plausible_node_ids: ["node-not-declared"]
      }]
    });
    expect(() => assertBenchmarkGroundTruth(undeclared)).toThrow("undeclared plausible id");
  });

  it("aggregates intervention events harm-first and keeps weak evidence uncertain", () => {
    expect(aggregateBenchmarkInterventionEventOutcome({
      delivered: true,
      manual_override: "helped",
      node_outcomes: [{
        node_id: "node-1",
        verdict: "weak_harmed",
        confidence: "medium"
      }]
    })).toBe("harmed");
    expect(aggregateBenchmarkInterventionEventOutcome({
      delivered: true,
      manual_override: null,
      node_outcomes: [{
        node_id: "node-1",
        verdict: "strong_helped",
        confidence: "high"
      }]
    })).toBe("helped");
    expect(aggregateBenchmarkInterventionEventOutcome({
      delivered: true,
      manual_override: null,
      node_outcomes: [{
        node_id: "node-1",
        verdict: "strong_helped",
        confidence: "low"
      }]
    })).toBe("uncertain");
  });

  it("enforces pristine running authority and one terminal revision", () => {
    const fixture = createStoreFixture();
    const block = buildBlock(fixture);
    const running = buildRunningAttempt(block, "treatment", 3);
    expect(assertBenchmarkFormalAttempt(running)).toEqual(running);
    expect(() => assertBenchmarkFormalAttempt({
      ...running,
      attempt_state_revision: 2
    })).toThrowError(expect.objectContaining({ code: "BENCHMARK_ATTEMPT_STATE_INVALID" }));
    fixture.store.close();
  });
});

describe("matched-block benchmark campaign store", () => {
  it("keeps benchmark storage separate from EE runtime authority tables", () => {
    const fixture = createStoreFixture();
    expect(fixture.store.listOwnedTableNames()).toEqual([...BENCHMARK_TABLE_NAMES].sort());
    expect(() => fixture.store.assertOwnsOnlyBenchmarkTables()).not.toThrow();
    fixture.store.db.exec("CREATE TABLE unrelated_state (id TEXT PRIMARY KEY) STRICT;");
    expect(() => fixture.store.assertOwnsOnlyBenchmarkTables()).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_IMMUTABILITY_VIOLATION" })
    );
    fixture.store.close();
  });

  it("separates retryable preflight from the unique formal attempt slot", () => {
    const fixture = createStoreFixture();
    const block = buildBlock(fixture);
    const plans = buildArmPlans(block);
    fixture.store.insertSealedBlock(block, plans);

    const preflight: BenchmarkPreflightRecord = {
      preflight_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.preflight,
      benchmark_campaign_id: block.benchmark_campaign_id,
      block_id: block.block_id,
      manifest_digest: block.manifest_digest,
      arm: "treatment",
      preflight_attempt_id: "preflight-1",
      preflight_attempt_number: 1,
      preflight_stage: "host_startup",
      status: "failed",
      failure_code: "BENCH_HOST_START_FAILED",
      started_at: createdAt,
      finished_at: "2026-07-16T08:00:05.000Z",
      evidence_digest: "preflight-evidence-1"
    };
    fixture.store.appendPreflightRecord(preflight);
    fixture.store.appendPreflightRecord({
      ...preflight,
      preflight_attempt_id: "preflight-2",
      preflight_attempt_number: 2,
      status: "passed",
      failure_code: null,
      evidence_digest: "preflight-evidence-2"
    });
    expect(fixture.store.listPreflightRecords(block.block_id, "treatment")).toHaveLength(2);

    const running = buildRunningAttempt(block, "treatment", 3);
    fixture.store.startFormalAttempt(running);
    expect(() => fixture.store.appendPreflightRecord({
      ...preflight,
      preflight_attempt_id: "preflight-after-formal-start",
      preflight_attempt_number: 3,
      status: "passed",
      failure_code: null,
      evidence_digest: "preflight-evidence-3"
    })).toThrowError(expect.objectContaining({
      code: "BENCHMARK_IMMUTABILITY_VIOLATION"
    }));
    expect(() => fixture.store.startFormalAttempt({ ...running, attempt_id: "attempt-duplicate" }))
      .toThrowError(expect.objectContaining({ code: "BENCHMARK_ATTEMPT_ALREADY_EXISTS" }));

    const terminal = buildTerminalAttempt(running);
    fixture.store.terminalizeFormalAttempt(1, terminal);
    expect(fixture.store.getFormalAttempt(block.block_id, "treatment")).toEqual(terminal);
    expect(() => fixture.store.terminalizeFormalAttempt(1, terminal)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_ATTEMPT_CAS_LOST" })
    );
    fixture.store.close();
  });

  it("preserves block disposition and replacement lineage without overwrite", () => {
    const fixture = createStoreFixture();
    const original = buildBlock(fixture);
    fixture.store.insertSealedBlock(original, buildArmPlans(original));
    const replacement = buildBlock({
      ...fixture,
      blockId: "block-2",
      replacementForBlockId: original.block_id,
      replacementGeneration: 1,
      seed: "seed-2"
    });
    fixture.store.insertSealedBlock(replacement, buildArmPlans(replacement));

    const disposition: BenchmarkBlockDispositionRecord = {
      block_disposition_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.disposition,
      benchmark_campaign_id: original.benchmark_campaign_id,
      block_id: original.block_id,
      manifest_digest: original.manifest_digest,
      disposition: "superseded_by_replacement",
      reason_code: "BENCH_HOST_START_FAILED",
      affected_arms: ["treatment", "forced_holdout", "no_ee"],
      detected_at: createdAt,
      detected_by: "benchmark_harness",
      evidence_digest: "disposition-evidence",
      replacement_block_id: replacement.block_id
    };
    fixture.store.appendBlockDisposition(disposition);

    const lineage: BenchmarkReplacementLineageRecord = {
      replacement_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.replacement,
      benchmark_campaign_id: original.benchmark_campaign_id,
      original_block_id: original.block_id,
      original_manifest_digest: original.manifest_digest,
      replacement_block_id: replacement.block_id,
      replacement_manifest_digest: replacement.manifest_digest,
      replacement_generation: 1,
      reason_code: "BENCH_HOST_START_FAILED",
      approved_at: createdAt,
      approved_by: "benchmark_operator",
      evidence_digest: "replacement-evidence"
    };
    fixture.store.appendReplacementLineage(lineage);
    expect(fixture.store.getBlockDisposition(original.block_id)).toEqual(disposition);
    expect(fixture.store.getReplacementLineage(replacement.block_id)).toEqual(lineage);
    expect(() => fixture.store.appendBlockDisposition(disposition)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_RECORD_CONFLICT" })
    );
    expect(() => fixture.store.appendReplacementLineage(lineage)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_RECORD_CONFLICT" })
    );
    fixture.store.close();
  });

  it("stores one immutable publication plan and one decision", () => {
    const fixture = createStoreFixture();
    const plan = fixture.store.getPublicationPlan("campaign-1");
    expect(plan?.negative_result_disclosure_required).toBe(true);
    const decision: BenchmarkPublicationDecision = {
      publication_decision_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.publicationDecision,
      benchmark_campaign_id: "campaign-1",
      publication_plan_digest: plan!.publication_plan_digest,
      decision: "incomplete",
      threshold_results: {
        complete_block_coverage: false,
        infrastructure_reliability: true
      },
      complete_block_count: 2,
      attempted_arm_count: 9,
      evidence_digest: "publication-decision-evidence",
      created_at: createdAt
    };
    fixture.store.insertPublicationDecision(decision);
    expect(fixture.store.getPublicationDecision("campaign-1")).toEqual(decision);
    expect(() => fixture.store.insertPublicationDecision(decision)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_RECORD_CONFLICT" })
    );
    fixture.store.close();
  });
});

describe("matched-block error identities", () => {
  it("uses stable contract and store error classes", () => {
    expect(new MatchedBlockBenchmarkContractError("BENCHMARK_CONTRACT_INVALID", "x").code)
      .toBe("BENCHMARK_CONTRACT_INVALID");
    expect(new MatchedBlockBenchmarkStoreError("BENCHMARK_RECORD_CONFLICT", "x").code)
      .toBe("BENCHMARK_RECORD_CONFLICT");
  });
});
