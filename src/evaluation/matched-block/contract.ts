import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import {
  BENCHMARK_ATTEMPT_EXECUTION_STATUSES,
  BENCHMARK_BLOCK_DISPOSITION_FIELDS,
  BENCHMARK_BLOCK_DISPOSITIONS,
  BENCHMARK_CAMPAIGN_MANIFEST_FIELDS,
  BENCHMARK_EXPECTED_ACTIONS,
  BENCHMARK_FIXTURE_MANIFEST_FIELDS,
  BENCHMARK_FORMAL_ATTEMPT_FIELDS,
  BENCHMARK_GROUND_TRUTH_FIELDS,
  BENCHMARK_INFRASTRUCTURE_FAILURE_CODES,
  BENCHMARK_INSTRUMENTATION_MANIFEST_FIELDS,
  BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS,
  BENCHMARK_PREFLIGHT_RECORD_FIELDS,
  BENCHMARK_PREFLIGHT_STAGES,
  BENCHMARK_PREFLIGHT_STATUSES,
  BENCHMARK_PUBLICATION_DECISION_FIELDS,
  BENCHMARK_PUBLICATION_DECISIONS,
  BENCHMARK_PUBLICATION_PLAN_FIELDS,
  BENCHMARK_REPLACEMENT_LINEAGE_FIELDS,
  BENCHMARK_RUNTIME_MANIFEST_FIELDS,
  BENCHMARK_SCENARIO_MANIFEST_FIELDS,
  BENCHMARK_TASK_OUTCOMES,
  MATCHED_BLOCK_ARM_PLAN_FIELDS,
  MATCHED_BLOCK_ARMS,
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  MATCHED_BLOCK_MANIFEST_FIELDS,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "./constants.js";
import type {
  BenchmarkBlockDispositionRecord,
  BenchmarkCampaignManifest,
  BenchmarkFixtureManifest,
  BenchmarkFormalAttempt,
  BenchmarkGroundTruth,
  BenchmarkInterventionEventEvidence,
  BenchmarkInterventionEventOutcome,
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
} from "./types.js";
import { computeMatchedBlockArmControlDigest } from "./arm-control.js";

export type MatchedBlockBenchmarkErrorCode =
  | "BENCHMARK_CONTRACT_INVALID"
  | "BENCHMARK_DIGEST_MISMATCH"
  | "BENCHMARK_REQUIRED_ARM_SET_INVALID"
  | "BENCHMARK_ATTEMPT_STATE_INVALID";

export class MatchedBlockBenchmarkContractError extends Error {
  constructor(
    readonly code: MatchedBlockBenchmarkErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MatchedBlockBenchmarkContractError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const fail = (
  message: string,
  code: MatchedBlockBenchmarkErrorCode = "BENCHMARK_CONTRACT_INVALID"
): never => {
  throw new MatchedBlockBenchmarkContractError(code, message);
};
const assertRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    return fail(`${label} must be an object.`);
  }
  return value;
};
const assertExactKeys = (
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string
): void => {
  const observed = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    fail(`${label} fields are not exhaustive.`);
  }
};
const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(`${field} must be a non-empty string.`);
  }
  return value;
};

const assertNullableString = (value: unknown, field: string): string | null => {
  if (value === null) {
    return null;
  }
  return assertNonEmptyString(value, field);
};

const assertBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    return fail(`${field} must be boolean.`);
  }
  return value;
};

const assertSafeInteger = (
  value: unknown,
  field: string,
  minimum = 0
): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    return fail(`${field} must be a safe integer >= ${minimum}.`);
  }
  return Number(value);
};

const assertRate = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return fail(`${field} must be a finite rate between 0 and 1.`);
  }
  return value;
};

const assertEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T => {
  if (!allowed.includes(value as T)) {
    return fail(`${field} has an unsupported value.`);
  }
  return value as T;
};

const assertStringArray = (
  value: unknown,
  field: string,
  options: { allowEmpty?: boolean; unique?: boolean } = {}
): string[] => {
  if (!Array.isArray(value)) {
    return fail(`${field} must be an array.`);
  }
  const normalized = value.map((item, index) =>
    assertNonEmptyString(item, `${field}[${index}]`)
  );
  if (!options.allowEmpty && normalized.length === 0) {
    fail(`${field} must not be empty.`);
  }
  if (options.unique && new Set(normalized).size !== normalized.length) {
    fail(`${field} must not contain duplicates.`);
  }
  return normalized;
};

const assertArmArray = (
  value: unknown,
  field: string,
  options: { requireCompleteSet?: boolean; allowEmpty?: boolean } = {}
): MatchedBlockArm[] => {
  if (!Array.isArray(value)) {
    return fail(`${field} must be an array.`);
  }
  const arms = value.map((item, index) =>
    assertEnum(item, MATCHED_BLOCK_ARMS, `${field}[${index}]`)
  );
  if (!options.allowEmpty && arms.length === 0) {
    fail(`${field} must not be empty.`);
  }
  if (new Set(arms).size !== arms.length) {
    fail(`${field} must not contain duplicate arms.`);
  }
  if (
    options.requireCompleteSet &&
    canonicalJson([...arms].sort()) !== canonicalJson([...MATCHED_BLOCK_ARMS].sort())
  ) {
    fail(
      `${field} must contain exactly treatment, forced_holdout, and no_ee.`,
      "BENCHMARK_REQUIRED_ARM_SET_INVALID"
    );
  }
  return arms;
};

const digestWithoutField = (
  record: Record<string, unknown>,
  digestField: string
): string => {
  const content = { ...record };
  delete content[digestField];
  return sha256Text(canonicalJson(content));
};

export const computeBenchmarkRecordDigest = (
  value: Record<string, unknown>,
  digestField: string
): string => digestWithoutField(value, digestField);

export const aggregateBenchmarkInterventionEventOutcome = (
  evidence: BenchmarkInterventionEventEvidence
): BenchmarkInterventionEventOutcome => {
  if (!evidence.delivered) {
    fail("Intervention event aggregation requires delivered = true.");
  }
  const mediumOrHigh = (confidence: string): boolean =>
    confidence === "medium" || confidence === "high";
  const harmed = evidence.manual_override === "harmed" || evidence.node_outcomes.some(
    (outcome) =>
      (outcome.verdict === "weak_harmed" || outcome.verdict === "strong_harmed") &&
      mediumOrHigh(outcome.confidence)
  );
  if (harmed) {
    return "harmed";
  }
  const helped = evidence.manual_override === "helped" || evidence.node_outcomes.some(
    (outcome) =>
      outcome.verdict === "strong_helped" && mediumOrHigh(outcome.confidence)
  );
  return helped ? "helped" : "uncertain";
};

const assertDigest = (
  record: Record<string, unknown>,
  digestField: string,
  label: string
): void => {
  const observed = assertNonEmptyString(record[digestField], digestField);
  const expected = digestWithoutField(record, digestField);
  if (observed !== expected) {
    fail(`${label} digest does not match canonical content.`, "BENCHMARK_DIGEST_MISMATCH");
  }
};

const assertStringFields = (
  record: Record<string, unknown>,
  fields: readonly string[]
): void => {
  for (const field of fields) {
    assertNonEmptyString(record[field], field);
  }
};

export const assertBenchmarkCampaignManifest = (
  value: unknown
): BenchmarkCampaignManifest => {
  const record = assertRecord(value, "Benchmark campaign manifest");
  assertExactKeys(record, BENCHMARK_CAMPAIGN_MANIFEST_FIELDS, "Benchmark campaign manifest");
  if (record.campaign_manifest_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.campaign) {
    fail("Benchmark campaign manifest schema version is unsupported.");
  }
  if (record.benchmark_protocol_version !== MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION) {
    fail("Benchmark protocol version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "scenario_set_digest",
    "analysis_plan_digest",
    "exclusion_policy_version",
    "replacement_policy_version",
    "created_at"
  ]);
  assertDigest(record, "campaign_manifest_digest", "Benchmark campaign manifest");
  return record as BenchmarkCampaignManifest;
};

export const assertBenchmarkScenarioManifest = (
  value: unknown
): BenchmarkScenarioManifest => {
  const record = assertRecord(value, "Benchmark scenario manifest");
  assertExactKeys(record, BENCHMARK_SCENARIO_MANIFEST_FIELDS, "Benchmark scenario manifest");
  if (record.scenario_manifest_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.scenario) {
    fail("Benchmark scenario manifest schema version is unsupported.");
  }
  assertStringFields(record, [
    "scenario_id",
    "scenario_version",
    "title",
    "task_type",
    "task_input",
    "task_input_digest",
    "ground_truth_id",
    "ground_truth_digest",
    "created_at"
  ]);
  if (record.task_input_digest !== sha256Text(String(record.task_input))) {
    fail("Benchmark scenario task_input_digest does not match task_input.", "BENCHMARK_DIGEST_MISMATCH");
  }
  assertDigest(record, "scenario_digest", "Benchmark scenario manifest");
  return record as BenchmarkScenarioManifest;
};

export const assertBenchmarkFixtureManifest = (
  value: unknown
): BenchmarkFixtureManifest => {
  const record = assertRecord(value, "Benchmark fixture manifest");
  assertExactKeys(record, BENCHMARK_FIXTURE_MANIFEST_FIELDS, "Benchmark fixture manifest");
  if (record.fixture_manifest_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.fixture) {
    fail("Benchmark fixture manifest schema version is unsupported.");
  }
  assertStringFields(record, [
    "fixture_id",
    "fixture_version",
    "repository_source",
    "repository_revision",
    "repository_snapshot_digest",
    "setup_contract_digest",
    "reset_contract_digest",
    "candidate_corpus_digest",
    "created_at"
  ]);
  assertDigest(record, "fixture_digest", "Benchmark fixture manifest");
  return record as BenchmarkFixtureManifest;
};

export const assertBenchmarkGroundTruth = (
  value: unknown
): BenchmarkGroundTruth => {
  const record = assertRecord(value, "Benchmark ground truth");
  assertExactKeys(record, BENCHMARK_GROUND_TRUTH_FIELDS, "Benchmark ground truth");
  if (record.ground_truth_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.groundTruth) {
    fail("Benchmark ground-truth schema version is unsupported.");
  }
  assertStringFields(record, [
    "ground_truth_id",
    "scenario_id",
    "scenario_version",
    "created_at"
  ]);
  assertEnum(record.expected_action, BENCHMARK_EXPECTED_ACTIONS, "expected_action");
  for (const field of [
    "applicable_node_ids",
    "applicable_candidate_ids",
    "distractor_node_ids",
    "distractor_candidate_ids"
  ] as const) {
    assertStringArray(record[field], field, { allowEmpty: true, unique: true });
  }
  const scopeValidity = assertRecord(record.scope_validity, "scope_validity");
  assertExactKeys(scopeValidity, ["valid", "reason_code"], "scope_validity");
  assertBoolean(scopeValidity.valid, "scope_validity.valid");
  assertNonEmptyString(scopeValidity.reason_code, "scope_validity.reason_code");
  assertStringArray(record.safety_constraints, "safety_constraints", { unique: true });
  assertStringArray(record.deterministic_success_checks, "deterministic_success_checks", {
    unique: true
  });
  assertNullableString(record.known_old_mistake_path, "known_old_mistake_path");
  const plausibleCount = [
    ...(record.applicable_node_ids as unknown[]),
    ...(record.applicable_candidate_ids as unknown[]),
    ...(record.distractor_node_ids as unknown[]),
    ...(record.distractor_candidate_ids as unknown[])
  ].length;
  if (record.expected_action === "skip" && plausibleCount === 0) {
    fail("Skip ground truth requires at least one plausible candidate or distractor.");
  }
  assertDigest(record, "ground_truth_digest", "Benchmark ground truth");
  return record as unknown as BenchmarkGroundTruth;
};

export const assertBenchmarkRuntimeManifest = (
  value: unknown
): BenchmarkRuntimeManifest => {
  const record = assertRecord(value, "Benchmark runtime manifest");
  assertExactKeys(record, BENCHMARK_RUNTIME_MANIFEST_FIELDS, "Benchmark runtime manifest");
  if (record.runtime_manifest_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.runtime) {
    fail("Benchmark runtime manifest schema version is unsupported.");
  }
  assertStringFields(record, BENCHMARK_RUNTIME_MANIFEST_FIELDS.filter(
    (field) => !["runtime_manifest_schema_version", "published_channel", "runtime_manifest_digest"].includes(field)
  ));
  assertEnum(record.published_channel, ["npm", "clawhub"] as const, "published_channel");
  assertDigest(record, "runtime_manifest_digest", "Benchmark runtime manifest");
  return record as unknown as BenchmarkRuntimeManifest;
};

export const assertBenchmarkInstrumentationManifest = (
  value: unknown
): BenchmarkInstrumentationManifest => {
  const record = assertRecord(value, "Benchmark instrumentation manifest");
  assertExactKeys(
    record,
    BENCHMARK_INSTRUMENTATION_MANIFEST_FIELDS,
    "Benchmark instrumentation manifest"
  );
  if (
    record.instrumentation_manifest_schema_version !==
    MATCHED_BLOCK_SCHEMA_VERSIONS.instrumentation
  ) {
    fail("Benchmark instrumentation manifest schema version is unsupported.");
  }
  assertStringFields(record, [
    "instrumentation_manifest_id",
    "harness_version",
    "transcript_adapter_version",
    "scorer_version",
    "observer_contract_digest",
    "timeout_policy_digest",
    "resource_policy_digest",
    "fixture_reset_policy_digest",
    "network_retry_policy_version",
    "created_at"
  ]);
  const metrics = assertStringArray(record.collected_metrics, "collected_metrics", {
    unique: true
  });
  if (
    canonicalJson([...metrics].sort()) !==
    canonicalJson([...BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS].sort())
  ) {
    fail("Instrumentation must collect the complete minimum public scorecard field set.");
  }
  if (record.unavailable_metric_policy !== "mark_unavailable") {
    fail("Unavailable cross-arm metrics must be marked unavailable.");
  }
  assertDigest(record, "instrumentation_manifest_digest", "Benchmark instrumentation manifest");
  return record as unknown as BenchmarkInstrumentationManifest;
};

export const assertMatchedBlockManifest = (value: unknown): MatchedBlockManifest => {
  const record = assertRecord(value, "Matched-block manifest");
  assertExactKeys(record, MATCHED_BLOCK_MANIFEST_FIELDS, "Matched-block manifest");
  if (record.benchmark_manifest_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.block) {
    fail("Matched-block manifest schema version is unsupported.");
  }
  if (record.benchmark_protocol_version !== MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION) {
    fail("Matched-block protocol version is unsupported.");
  }
  const nullable = new Set(["replacement_for_block_id"]);
  const nonStrings = new Set([
    "replacement_generation",
    "repetition_index",
    "planned_arm_order"
  ]);
  for (const field of MATCHED_BLOCK_MANIFEST_FIELDS) {
    if (
      field === "benchmark_manifest_schema_version" ||
      field === "benchmark_protocol_version" ||
      field === "manifest_digest" ||
      nonStrings.has(field)
    ) {
      continue;
    }
    if (nullable.has(field)) {
      assertNullableString(record[field], field);
    } else {
      assertNonEmptyString(record[field], field);
    }
  }
  const replacementGeneration = assertSafeInteger(
    record.replacement_generation,
    "replacement_generation",
    0
  );
  assertSafeInteger(record.repetition_index, "repetition_index", 1);
  assertArmArray(record.planned_arm_order, "planned_arm_order", {
    requireCompleteSet: true
  });
  if (record.replacement_for_block_id === null && replacementGeneration !== 0) {
    fail("Original blocks must have replacement_generation = 0.");
  }
  if (record.replacement_for_block_id !== null && replacementGeneration < 1) {
    fail("Replacement blocks must have replacement_generation >= 1.");
  }
  assertDigest(record, "manifest_digest", "Matched-block manifest");
  return record as unknown as MatchedBlockManifest;
};

export const assertMatchedBlockArmPlan = (value: unknown): MatchedBlockArmPlan => {
  const record = assertRecord(value, "Matched-block arm plan");
  assertExactKeys(record, MATCHED_BLOCK_ARM_PLAN_FIELDS, "Matched-block arm plan");
  if (record.arm_plan_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.armPlan) {
    fail("Matched-block arm-plan schema version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "block_id",
    "manifest_digest",
    "workspace_isolation_id",
    "ee_home_isolation_id",
    "host_session_isolation_id",
    "arm_control_digest"
  ]);
  const arm = assertEnum(record.arm, MATCHED_BLOCK_ARMS, "arm");
  const ordinal = assertSafeInteger(record.planned_ordinal, "planned_ordinal", 1);
  if (ordinal > MATCHED_BLOCK_ARMS.length) {
    fail("planned_ordinal exceeds the required arm count.");
  }
  if (record.arm_control_digest !== computeMatchedBlockArmControlDigest(arm)) {
    fail(
      "Matched-block arm control digest does not match the frozen arm behavior.",
      "BENCHMARK_REQUIRED_ARM_SET_INVALID"
    );
  }
  return record as unknown as MatchedBlockArmPlan;
};

export const assertCompleteMatchedBlockArmPlans = (
  plans: unknown
): MatchedBlockArmPlan[] => {
  if (!Array.isArray(plans) || plans.length !== MATCHED_BLOCK_ARMS.length) {
    return fail(
      "A matched block requires exactly three arm plans.",
      "BENCHMARK_REQUIRED_ARM_SET_INVALID"
    );
  }
  const validated = plans.map(assertMatchedBlockArmPlan);
  assertArmArray(validated.map((plan) => plan.arm), "arm_plans", {
    requireCompleteSet: true
  });
  const ordinals = validated.map((plan) => plan.planned_ordinal).sort((a, b) => a - b);
  if (canonicalJson(ordinals) !== canonicalJson([1, 2, 3])) {
    fail("Matched-block arm-plan ordinals must be exactly 1, 2, and 3.");
  }
  return validated;
};

export const assertBenchmarkPreflightRecord = (
  value: unknown
): BenchmarkPreflightRecord => {
  const record = assertRecord(value, "Benchmark preflight record");
  assertExactKeys(record, BENCHMARK_PREFLIGHT_RECORD_FIELDS, "Benchmark preflight record");
  if (record.preflight_record_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.preflight) {
    fail("Benchmark preflight schema version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "block_id",
    "manifest_digest",
    "preflight_attempt_id",
    "started_at",
    "finished_at",
    "evidence_digest"
  ]);
  assertEnum(record.arm, MATCHED_BLOCK_ARMS, "arm");
  assertSafeInteger(record.preflight_attempt_number, "preflight_attempt_number", 1);
  assertEnum(record.preflight_stage, BENCHMARK_PREFLIGHT_STAGES, "preflight_stage");
  const status = assertEnum(record.status, BENCHMARK_PREFLIGHT_STATUSES, "status");
  const failure = assertNullableString(record.failure_code, "failure_code");
  if (status === "failed" && failure === null) {
    fail("Failed preflight records require failure_code.");
  }
  return record as unknown as BenchmarkPreflightRecord;
};

export const assertBenchmarkFormalAttempt = (
  value: unknown
): BenchmarkFormalAttempt => {
  const record = assertRecord(value, "Benchmark formal attempt");
  assertExactKeys(record, BENCHMARK_FORMAL_ATTEMPT_FIELDS, "Benchmark formal attempt");
  if (record.attempt_record_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.formalAttempt) {
    fail("Benchmark formal-attempt schema version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "block_id",
    "manifest_digest",
    "attempt_id",
    "started_at"
  ]);
  assertEnum(record.arm, MATCHED_BLOCK_ARMS, "arm");
  if (record.attempt_number !== 1) {
    fail("Formal attempt_number is fixed to 1.", "BENCHMARK_ATTEMPT_STATE_INVALID");
  }
  const revision = assertSafeInteger(record.attempt_state_revision, "attempt_state_revision", 1);
  assertSafeInteger(record.planned_ordinal, "planned_ordinal", 1);
  const status = assertEnum(
    record.execution_status,
    BENCHMARK_ATTEMPT_EXECUTION_STATUSES,
    "execution_status"
  );
  const taskOutcome = assertEnum(record.task_outcome, BENCHMARK_TASK_OUTCOMES, "task_outcome");
  const taskTimeout = assertBoolean(record.task_timeout, "task_timeout");
  const infrastructureCode = record.infrastructure_failure_code === null
    ? null
    : assertEnum(
        record.infrastructure_failure_code,
        BENCHMARK_INFRASTRUCTURE_FAILURE_CODES,
        "infrastructure_failure_code"
      );
  assertStringArray(record.product_runtime_failure_codes, "product_runtime_failure_codes", {
    allowEmpty: true,
    unique: true
  });
  const finishedAt = assertNullableString(record.finished_at, "finished_at");
  const terminalDigestFields = [
    "workspace_artifact_digest",
    "host_transcript_digest",
    "arm_neutral_metrics_digest",
    "deterministic_check_digest",
    "scoring_record_digest"
  ] as const;
  const terminalDigests = terminalDigestFields.map((field) =>
    assertNullableString(record[field], field)
  );

  if (status === "running") {
    if (
      revision !== 1 ||
      taskOutcome !== "unavailable" ||
      taskTimeout ||
      infrastructureCode !== null ||
      finishedAt !== null ||
      terminalDigests.some((digest) => digest !== null) ||
      (record.product_runtime_failure_codes as unknown[]).length > 0
    ) {
      fail(
        "Running formal attempts must be pristine revision-one authority rows.",
        "BENCHMARK_ATTEMPT_STATE_INVALID"
      );
    }
  } else {
    if (revision !== 2 || finishedAt === null) {
      fail(
        "Terminal formal attempts must be the single revision-two transition with finished_at.",
        "BENCHMARK_ATTEMPT_STATE_INVALID"
      );
    }
    if (status === "completed") {
      if (infrastructureCode !== null || terminalDigests.some((digest) => digest === null)) {
        fail(
          "Completed attempts require all terminal evidence digests and no infrastructure code.",
          "BENCHMARK_ATTEMPT_STATE_INVALID"
        );
      }
    } else if (infrastructureCode === null) {
      fail(
        "Non-completed terminal attempts require a stable BENCH_* infrastructure code.",
        "BENCHMARK_ATTEMPT_STATE_INVALID"
      );
    }
  }
  return record as unknown as BenchmarkFormalAttempt;
};

export const assertBenchmarkBlockDispositionRecord = (
  value: unknown
): BenchmarkBlockDispositionRecord => {
  const record = assertRecord(value, "Benchmark block disposition");
  assertExactKeys(
    record,
    BENCHMARK_BLOCK_DISPOSITION_FIELDS,
    "Benchmark block disposition"
  );
  if (record.block_disposition_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.disposition) {
    fail("Benchmark block-disposition schema version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "block_id",
    "manifest_digest",
    "reason_code",
    "detected_at",
    "detected_by",
    "evidence_digest"
  ]);
  const disposition = assertEnum(
    record.disposition,
    BENCHMARK_BLOCK_DISPOSITIONS,
    "disposition"
  );
  assertArmArray(record.affected_arms, "affected_arms", {
    allowEmpty: disposition === "complete"
  });
  const replacementBlockId = assertNullableString(
    record.replacement_block_id,
    "replacement_block_id"
  );
  if (disposition === "superseded_by_replacement" && replacementBlockId === null) {
    fail("Superseded block dispositions require replacement_block_id.");
  }
  return record as unknown as BenchmarkBlockDispositionRecord;
};

export const assertBenchmarkReplacementLineageRecord = (
  value: unknown
): BenchmarkReplacementLineageRecord => {
  const record = assertRecord(value, "Benchmark replacement lineage");
  assertExactKeys(
    record,
    BENCHMARK_REPLACEMENT_LINEAGE_FIELDS,
    "Benchmark replacement lineage"
  );
  if (record.replacement_record_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.replacement) {
    fail("Benchmark replacement schema version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "original_block_id",
    "original_manifest_digest",
    "replacement_block_id",
    "replacement_manifest_digest",
    "reason_code",
    "approved_at",
    "approved_by",
    "evidence_digest"
  ]);
  assertSafeInteger(record.replacement_generation, "replacement_generation", 1);
  if (record.original_block_id === record.replacement_block_id) {
    fail("A replacement block must have a new block id.");
  }
  return record as unknown as BenchmarkReplacementLineageRecord;
};

export const assertBenchmarkPublicationPlan = (
  value: unknown
): BenchmarkPublicationPlan => {
  const record = assertRecord(value, "Benchmark publication plan");
  assertExactKeys(record, BENCHMARK_PUBLICATION_PLAN_FIELDS, "Benchmark publication plan");
  if (record.publication_plan_schema_version !== MATCHED_BLOCK_SCHEMA_VERSIONS.publicationPlan) {
    fail("Benchmark publication-plan schema version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "analysis_plan_digest",
    "uncertainty_method",
    "sensitivity_exclusion_policy_version",
    "created_at",
    "sealed_at"
  ]);
  assertSafeInteger(
    record.minimum_repetitions_per_scenario,
    "minimum_repetitions_per_scenario",
    1
  );
  assertRate(record.minimum_complete_block_coverage, "minimum_complete_block_coverage");
  assertRate(record.minimum_infrastructure_reliability, "minimum_infrastructure_reliability");
  assertBoolean(
    record.negative_result_disclosure_required,
    "negative_result_disclosure_required"
  );
  if (record.negative_result_disclosure_required !== true) {
    fail("Publication plans must require negative-result disclosure.");
  }
  const thresholds = assertRecord(record.quality_thresholds, "quality_thresholds");
  if (Object.keys(thresholds).length === 0) {
    fail("Publication plans must predeclare at least one quality/effect threshold.");
  }
  for (const [metric, threshold] of Object.entries(thresholds)) {
    assertEnum(metric, BENCHMARK_MINIMUM_PUBLIC_SCORECARD_FIELDS, `quality_thresholds.${metric}`);
    if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
      fail(`quality_thresholds.${metric} must be finite.`);
    }
  }
  assertDigest(record, "publication_plan_digest", "Benchmark publication plan");
  return record as unknown as BenchmarkPublicationPlan;
};

export const assertBenchmarkPublicationDecision = (
  value: unknown
): BenchmarkPublicationDecision => {
  const record = assertRecord(value, "Benchmark publication decision");
  assertExactKeys(
    record,
    BENCHMARK_PUBLICATION_DECISION_FIELDS,
    "Benchmark publication decision"
  );
  if (
    record.publication_decision_schema_version !==
    MATCHED_BLOCK_SCHEMA_VERSIONS.publicationDecision
  ) {
    fail("Benchmark publication-decision schema version is unsupported.");
  }
  assertStringFields(record, [
    "benchmark_campaign_id",
    "publication_plan_digest",
    "evidence_digest",
    "created_at"
  ]);
  assertEnum(record.decision, BENCHMARK_PUBLICATION_DECISIONS, "decision");
  const thresholdResults = assertRecord(record.threshold_results, "threshold_results");
  for (const [threshold, passed] of Object.entries(thresholdResults)) {
    assertNonEmptyString(threshold, "threshold_results key");
    assertBoolean(passed, `threshold_results.${threshold}`);
  }
  assertSafeInteger(record.complete_block_count, "complete_block_count", 0);
  assertSafeInteger(record.attempted_arm_count, "attempted_arm_count", 0);
  return record as unknown as BenchmarkPublicationDecision;
};
