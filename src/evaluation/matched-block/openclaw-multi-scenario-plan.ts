import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import { deriveMatchedBlockArmOrder } from "./arm-control.js";
import {
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "./constants.js";
import {
  assertBenchmarkCampaignManifest,
  assertBenchmarkGroundTruth,
  assertBenchmarkScenarioManifest,
  computeBenchmarkRecordDigest
} from "./contract.js";
import {
  assertOpenClawMultiScenarioSet,
  buildOpenClawScenarioGroundTruth,
  buildOpenClawScenarioManifest,
  computeOpenClawScenarioSetDigest,
  createOpenClawMultiScenarioAdapters,
  OPENCLAW_MULTI_SCENARIO_SET_VERSION,
  type OpenClawMultiScenarioKind,
  type OpenClawScenarioAdapterDefinition
} from "./openclaw-scenario-adapter.js";
import type {
  BenchmarkCampaignManifest,
  BenchmarkGroundTruthV2,
  BenchmarkScenarioManifest,
  MatchedBlockArm
} from "./types.js";

export const OPENCLAW_MULTI_SCENARIO_PLAN_SCHEMA_VERSION =
  "openclaw-multi-scenario-campaign-plan-v1" as const;

export type OpenClawMultiScenarioArtifactIdentity = {
  file_name: string;
  size_bytes: number;
  sha256: string;
  published_channel: "npm" | "clawhub";
  package_name: string;
  package_version: string;
};

export type OpenClawMultiScenarioHostIdentity = {
  executable_name: string;
  openclaw_version: string;
  node_version: string;
  platform: string;
  model_provider: string;
  model_identity: string;
  host_mode: "local_embedded";
};

export type OpenClawMultiScenarioBlockPlan = {
  block_id: string;
  scenario_id: string;
  scenario_kind: OpenClawMultiScenarioKind;
  scenario_version: string;
  repetition_index: number;
  randomization_seed: string;
  planned_arm_order: MatchedBlockArm[];
  adapter_digest: string;
  scenario_digest: string;
  ground_truth_digest: string;
  block_plan_digest: string;
};

export type OpenClawMultiScenarioScenarioPlan = {
  adapter: OpenClawScenarioAdapterDefinition;
  ground_truth: BenchmarkGroundTruthV2;
  scenario_manifest: BenchmarkScenarioManifest;
  blocks: OpenClawMultiScenarioBlockPlan[];
};

export type OpenClawMultiScenarioCampaignPlan = {
  plan_schema_version: typeof OPENCLAW_MULTI_SCENARIO_PLAN_SCHEMA_VERSION;
  benchmark_protocol_version: typeof MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2;
  scenario_set_version: typeof OPENCLAW_MULTI_SCENARIO_SET_VERSION;
  campaign_manifest: BenchmarkCampaignManifest;
  campaign_version: string;
  repetitions_per_scenario: number;
  scenario_cluster_count: 3;
  artifact: OpenClawMultiScenarioArtifactIdentity;
  host: OpenClawMultiScenarioHostIdentity;
  scenarios: OpenClawMultiScenarioScenarioPlan[];
  claim_boundary: {
    evidence_label: "infrastructure_directional_pilot";
    general_efficacy_claim_allowed: false;
    support_claim_allowed: false;
    production_learning_ready: false;
  };
  created_at: string;
  plan_digest: string;
};

export class OpenClawMultiScenarioPlanError extends Error {
  constructor(
    readonly code:
      | "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID"
      | "OPENCLAW_MULTI_SCENARIO_PLAN_DIGEST_MISMATCH",
    message: string
  ) {
    super(message);
    this.name = "OpenClawMultiScenarioPlanError";
  }
}

const fail = (
  code: OpenClawMultiScenarioPlanError["code"],
  message: string
): never => {
  throw new OpenClawMultiScenarioPlanError(code, message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const PLAN_FIELDS = [
  "plan_schema_version",
  "benchmark_protocol_version",
  "scenario_set_version",
  "campaign_manifest",
  "campaign_version",
  "repetitions_per_scenario",
  "scenario_cluster_count",
  "artifact",
  "host",
  "scenarios",
  "claim_boundary",
  "created_at",
  "plan_digest"
] as const;

const ARTIFACT_FIELDS = [
  "file_name",
  "size_bytes",
  "sha256",
  "published_channel",
  "package_name",
  "package_version"
] as const;

const HOST_FIELDS = [
  "executable_name",
  "openclaw_version",
  "node_version",
  "platform",
  "model_provider",
  "model_identity",
  "host_mode"
] as const;

const SCENARIO_PLAN_FIELDS = [
  "adapter",
  "ground_truth",
  "scenario_manifest",
  "blocks"
] as const;

const BLOCK_PLAN_FIELDS = [
  "block_id",
  "scenario_id",
  "scenario_kind",
  "scenario_version",
  "repetition_index",
  "randomization_seed",
  "planned_arm_order",
  "adapter_digest",
  "scenario_digest",
  "ground_truth_digest",
  "block_plan_digest"
] as const;

const CLAIM_BOUNDARY_FIELDS = [
  "evidence_label",
  "general_efficacy_claim_allowed",
  "support_claim_allowed",
  "production_learning_ready"
] as const;

const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string
): void => {
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    fail(
      "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
      `${field} has unexpected or missing fields.`
    );
  }
};

const withDigest = <T extends Record<string, unknown>, K extends keyof T & string>(
  value: T,
  field: K
): T => ({
  ...value,
  [field]: computeBenchmarkRecordDigest(value, field)
});

const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", `${field} must be non-empty.`);
  }
  return value;
};

const assertCanonicalIso = (value: unknown, field: string): string => {
  const text = assertNonEmptyString(value, field);
  if (new Date(text).toISOString() !== text) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", `${field} must be canonical ISO time.`);
  }
  return text;
};

const assertPositiveInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", `${field} must be a positive integer.`);
  }
  return Number(value);
};

const assertSha256 = (value: unknown, field: string): string => {
  const text = assertNonEmptyString(value, field);
  if (!/^[a-f0-9]{64}$/.test(text)) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", `${field} must be lowercase SHA-256.`);
  }
  return text;
};

const buildAnalysisPlanDigest = (options: {
  repetitionsPerScenario: number;
  scenarioSetDigest: string;
}): string => sha256Text(canonicalJson({
  evidence_label: "infrastructure_directional_pilot",
  complete_block_only: true,
  scenarios: ["inject", "correct_skip", "harm_recovery"],
  repetitions_per_scenario: options.repetitionsPerScenario,
  scenario_cluster_count: 3,
  scenario_set_digest: options.scenarioSetDigest,
  general_efficacy_claim_allowed: false,
  support_claim_allowed: false,
  production_learning_ready: false
}));

export const createOpenClawMultiScenarioCampaignPlan = (options: {
  campaignVersion: string;
  repetitionsPerScenario: number;
  createdAt: string;
  artifact: OpenClawMultiScenarioArtifactIdentity;
  host: OpenClawMultiScenarioHostIdentity;
}): OpenClawMultiScenarioCampaignPlan => {
  const campaignVersion = assertNonEmptyString(options.campaignVersion, "campaignVersion");
  if (!/^[1-9][0-9]*$/.test(campaignVersion)) {
    return fail(
      "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
      "campaignVersion must be a positive integer string."
    );
  }
  const repetitionsPerScenario = assertPositiveInteger(
    options.repetitionsPerScenario,
    "repetitionsPerScenario"
  );
  const createdAt = assertCanonicalIso(options.createdAt, "createdAt");
  const adapters = createOpenClawMultiScenarioAdapters({ campaignVersion, createdAt });
  const scenarioSetDigest = computeOpenClawScenarioSetDigest(adapters);
  const campaignId = `phase-0.5c-openclaw-multi-scenario-v${campaignVersion}`;
  const campaignManifest = withDigest({
    campaign_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.campaign,
    benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
    benchmark_campaign_id: campaignId,
    scenario_set_digest: scenarioSetDigest,
    analysis_plan_digest: buildAnalysisPlanDigest({
      repetitionsPerScenario,
      scenarioSetDigest
    }),
    exclusion_policy_version: "matched-block-exclusion-v1",
    replacement_policy_version: "whole-block-replacement-v1",
    created_at: createdAt,
    campaign_manifest_digest: ""
  } satisfies BenchmarkCampaignManifest, "campaign_manifest_digest");

  const scenarios = adapters.map((adapter) => {
    const groundTruth = buildOpenClawScenarioGroundTruth(adapter);
    const scenarioManifest = buildOpenClawScenarioManifest(adapter, groundTruth);
    const blocks = Array.from({ length: repetitionsPerScenario }, (_, index) => {
      const repetitionIndex = index + 1;
      const blockId = `${campaignId}-${adapter.scenario_kind}-r${repetitionIndex}`;
      const randomizationSeed = `${blockId}-seed`;
      return withDigest({
        block_id: blockId,
        scenario_id: adapter.scenario_id,
        scenario_kind: adapter.scenario_kind,
        scenario_version: adapter.scenario_version,
        repetition_index: repetitionIndex,
        randomization_seed: randomizationSeed,
        planned_arm_order: deriveMatchedBlockArmOrder(randomizationSeed),
        adapter_digest: adapter.adapter_digest,
        scenario_digest: scenarioManifest.scenario_digest,
        ground_truth_digest: groundTruth.ground_truth_digest,
        block_plan_digest: ""
      } satisfies OpenClawMultiScenarioBlockPlan, "block_plan_digest");
    });
    return {
      adapter,
      ground_truth: groundTruth,
      scenario_manifest: scenarioManifest,
      blocks
    } satisfies OpenClawMultiScenarioScenarioPlan;
  });

  return withDigest({
    plan_schema_version: OPENCLAW_MULTI_SCENARIO_PLAN_SCHEMA_VERSION,
    benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2,
    scenario_set_version: OPENCLAW_MULTI_SCENARIO_SET_VERSION,
    campaign_manifest: campaignManifest,
    campaign_version: campaignVersion,
    repetitions_per_scenario: repetitionsPerScenario,
    scenario_cluster_count: 3,
    artifact: options.artifact,
    host: options.host,
    scenarios,
    claim_boundary: {
      evidence_label: "infrastructure_directional_pilot",
      general_efficacy_claim_allowed: false,
      support_claim_allowed: false,
      production_learning_ready: false
    },
    created_at: createdAt,
    plan_digest: ""
  } satisfies OpenClawMultiScenarioCampaignPlan, "plan_digest");
};

const assertArtifact = (value: unknown): OpenClawMultiScenarioArtifactIdentity => {
  if (!isRecord(value)) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "artifact must be an object.");
  }
  assertExactKeys(value, ARTIFACT_FIELDS, "artifact");
  const fileName = assertNonEmptyString(value.file_name, "artifact.file_name");
  if (fileName.includes("/") || fileName.includes("\\")) {
    return fail(
      "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
      "artifact.file_name must not contain a path."
    );
  }
  assertPositiveInteger(value.size_bytes, "artifact.size_bytes");
  assertSha256(value.sha256, "artifact.sha256");
  if (value.published_channel !== "npm" && value.published_channel !== "clawhub") {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "artifact channel is unsupported.");
  }
  assertNonEmptyString(value.package_name, "artifact.package_name");
  assertNonEmptyString(value.package_version, "artifact.package_version");
  return value as unknown as OpenClawMultiScenarioArtifactIdentity;
};

const assertHost = (value: unknown): OpenClawMultiScenarioHostIdentity => {
  if (!isRecord(value)) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "host must be an object.");
  }
  assertExactKeys(value, HOST_FIELDS, "host");
  for (const field of [
    "executable_name",
    "openclaw_version",
    "node_version",
    "platform",
    "model_provider",
    "model_identity"
  ] as const) {
    const text = assertNonEmptyString(value[field], `host.${field}`);
    if (field === "executable_name" && (text.includes("/") || text.includes("\\"))) {
      return fail(
        "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
        "host.executable_name must not contain a path."
      );
    }
  }
  if (value.host_mode !== "local_embedded") {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "host.host_mode is unsupported.");
  }
  return value as unknown as OpenClawMultiScenarioHostIdentity;
};

export const assertOpenClawMultiScenarioCampaignPlan = (
  value: unknown
): OpenClawMultiScenarioCampaignPlan => {
  if (!isRecord(value)) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "Campaign plan must be an object.");
  }
  assertExactKeys(value, PLAN_FIELDS, "Campaign plan");
  if (
    value.plan_schema_version !== OPENCLAW_MULTI_SCENARIO_PLAN_SCHEMA_VERSION ||
    value.benchmark_protocol_version !== MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2 ||
    value.scenario_set_version !== OPENCLAW_MULTI_SCENARIO_SET_VERSION
  ) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "Campaign plan identity is invalid.");
  }
  const campaignVersion = assertNonEmptyString(value.campaign_version, "campaign_version");
  if (!/^[1-9][0-9]*$/.test(campaignVersion)) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "campaign_version is invalid.");
  }
  const repetitions = assertPositiveInteger(
    value.repetitions_per_scenario,
    "repetitions_per_scenario"
  );
  if (value.scenario_cluster_count !== 3) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "scenario_cluster_count must equal three.");
  }
  const createdAt = assertCanonicalIso(value.created_at, "created_at");
  const artifact = assertArtifact(value.artifact);
  const host = assertHost(value.host);
  const campaignManifest = assertBenchmarkCampaignManifest(value.campaign_manifest);
  if (
    campaignManifest.benchmark_protocol_version !== MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION_V2 ||
    campaignManifest.created_at !== createdAt ||
    campaignManifest.benchmark_campaign_id !==
      `phase-0.5c-openclaw-multi-scenario-v${campaignVersion}`
  ) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "Campaign manifest binding is invalid.");
  }
  if (!Array.isArray(value.scenarios) || value.scenarios.length !== 3) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "Campaign plan must contain three scenarios.");
  }
  const scenarioRecords = value.scenarios as unknown[];
  const adapters = scenarioRecords.map((scenarioValue, index) => {
    if (!isRecord(scenarioValue)) {
      return fail(
        "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
        `scenarios[${index}] must be an object.`
      );
    }
    assertExactKeys(scenarioValue, SCENARIO_PLAN_FIELDS, `scenarios[${index}]`);
    return scenarioValue.adapter;
  });
  const validatedAdapters = assertOpenClawMultiScenarioSet(adapters);
  const expectedScenarioSetDigest = computeOpenClawScenarioSetDigest(validatedAdapters);
  if (campaignManifest.scenario_set_digest !== expectedScenarioSetDigest) {
    return fail(
      "OPENCLAW_MULTI_SCENARIO_PLAN_DIGEST_MISMATCH",
      "Campaign scenario_set_digest does not match sealed adapters."
    );
  }
  const expectedAnalysisPlanDigest = buildAnalysisPlanDigest({
    repetitionsPerScenario: repetitions,
    scenarioSetDigest: expectedScenarioSetDigest
  });
  if (campaignManifest.analysis_plan_digest !== expectedAnalysisPlanDigest) {
    return fail(
      "OPENCLAW_MULTI_SCENARIO_PLAN_DIGEST_MISMATCH",
      "Campaign analysis_plan_digest does not match the plan boundary."
    );
  }
  const typedScenarios: OpenClawMultiScenarioScenarioPlan[] = [];
  for (const [index, scenarioValue] of scenarioRecords.entries()) {
    const record = scenarioValue as Record<string, unknown>;
    const adapter = validatedAdapters[index]!;
    const groundTruth = assertBenchmarkGroundTruth(record.ground_truth);
    if (!("decision_opportunities" in groundTruth)) {
      return fail(
        "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
        `scenarios[${index}] must use V2 ground truth.`
      );
    }
    const scenarioManifest = assertBenchmarkScenarioManifest(record.scenario_manifest);
    if (
      groundTruth.scenario_id !== adapter.scenario_id ||
      groundTruth.scenario_version !== adapter.scenario_version ||
      scenarioManifest.scenario_id !== adapter.scenario_id ||
      scenarioManifest.scenario_version !== adapter.scenario_version ||
      scenarioManifest.ground_truth_digest !== groundTruth.ground_truth_digest
    ) {
      return fail(
        "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
        `scenarios[${index}] identity binding is invalid.`
      );
    }
    if (!Array.isArray(record.blocks) || record.blocks.length !== repetitions) {
      return fail(
        "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
        `scenarios[${index}] block count does not match the sealed repetition count.`
      );
    }
    const blocks = (record.blocks as unknown[]).map((blockValue, blockIndex) => {
      if (!isRecord(blockValue)) {
        return fail(
          "OPENCLAW_MULTI_SCENARIO_PLAN_INVALID",
          `scenarios[${index}].blocks[${blockIndex}] must be an object.`
        );
      }
      assertExactKeys(
        blockValue,
        BLOCK_PLAN_FIELDS,
        `scenarios[${index}].blocks[${blockIndex}]`
      );
      const repetitionIndex = blockIndex + 1;
      const expectedBlockId = `${campaignManifest.benchmark_campaign_id}-${adapter.scenario_kind}-r${
        repetitionIndex
      }`;
      const expectedSeed = `${expectedBlockId}-seed`;
      const expectedOrder = deriveMatchedBlockArmOrder(expectedSeed);
      if (
        blockValue.block_id !== expectedBlockId ||
        blockValue.scenario_id !== adapter.scenario_id ||
        blockValue.scenario_kind !== adapter.scenario_kind ||
        blockValue.scenario_version !== adapter.scenario_version ||
        blockValue.repetition_index !== repetitionIndex ||
        blockValue.randomization_seed !== expectedSeed ||
        canonicalJson(blockValue.planned_arm_order) !== canonicalJson(expectedOrder) ||
        blockValue.adapter_digest !== adapter.adapter_digest ||
        blockValue.scenario_digest !== scenarioManifest.scenario_digest ||
        blockValue.ground_truth_digest !== groundTruth.ground_truth_digest ||
        blockValue.block_plan_digest !==
          computeBenchmarkRecordDigest(blockValue, "block_plan_digest")
      ) {
        return fail(
          "OPENCLAW_MULTI_SCENARIO_PLAN_DIGEST_MISMATCH",
          `scenarios[${index}].blocks[${blockIndex}] is not the sealed deterministic block plan.`
        );
      }
      return blockValue as unknown as OpenClawMultiScenarioBlockPlan;
    });
    typedScenarios.push({
      adapter,
      ground_truth: groundTruth,
      scenario_manifest: scenarioManifest,
      blocks
    });
  }
  if (!isRecord(value.claim_boundary)) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "Claim boundary must be an object.");
  }
  assertExactKeys(value.claim_boundary, CLAIM_BOUNDARY_FIELDS, "claim_boundary");
  if (
    value.claim_boundary.evidence_label !== "infrastructure_directional_pilot" ||
    value.claim_boundary.general_efficacy_claim_allowed !== false ||
    value.claim_boundary.support_claim_allowed !== false ||
    value.claim_boundary.production_learning_ready !== false) {
    return fail("OPENCLAW_MULTI_SCENARIO_PLAN_INVALID", "Claim boundary is not fail-closed.");
  }
  if (value.plan_digest !== computeBenchmarkRecordDigest(value, "plan_digest")) {
    return fail(
      "OPENCLAW_MULTI_SCENARIO_PLAN_DIGEST_MISMATCH",
      "Campaign plan digest does not match."
    );
  }
  return {
    ...value,
    campaign_manifest: campaignManifest,
    artifact,
    host,
    scenarios: typedScenarios
  } as unknown as OpenClawMultiScenarioCampaignPlan;
};
