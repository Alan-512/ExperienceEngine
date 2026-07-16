import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import {
  BENCHMARK_PREFLIGHT_STAGES,
  MATCHED_BLOCK_ARMS,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "./constants.js";
import {
  computeMatchedBlockArmControlDigest,
  deriveMatchedBlockArmOrder,
  getMatchedBlockArmControl,
  type MatchedBlockArmControl
} from "./arm-control.js";
import { assertCompleteMatchedBlockArmPlans } from "./contract.js";
import { MatchedBlockBenchmarkStore } from "./store.js";
import type {
  BenchmarkCampaignManifest,
  BenchmarkFixtureManifest,
  BenchmarkFormalAttempt,
  BenchmarkGroundTruth,
  BenchmarkInfrastructureFailureCode,
  BenchmarkInstrumentationManifest,
  BenchmarkPreflightRecord,
  BenchmarkPreflightStage,
  BenchmarkRuntimeManifest,
  BenchmarkScenarioManifest,
  BenchmarkTaskOutcome,
  MatchedBlockArm,
  MatchedBlockArmPlan,
  MatchedBlockManifest
} from "./types.js";

export type MatchedBlockHarnessErrorCode =
  | "BENCHMARK_BLOCK_NOT_READY"
  | "BENCHMARK_ARM_ORDER_MISMATCH"
  | "BENCHMARK_ARM_CONTROL_MISMATCH"
  | "BENCHMARK_ARM_ISOLATION_INVALID"
  | "BENCHMARK_EXECUTION_CONTRACT_MISMATCH"
  | "BENCHMARK_PREFLIGHT_FAILED"
  | "BENCHMARK_FORMAL_ATTEMPT_ALREADY_CONSUMED";

export class MatchedBlockHarnessError extends Error {
  constructor(
    readonly code: MatchedBlockHarnessErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MatchedBlockHarnessError";
  }
}

export class MatchedBlockHarnessInfrastructureError extends Error {
  constructor(
    readonly infrastructureCode: BenchmarkInfrastructureFailureCode,
    message: string
  ) {
    super(message);
    this.name = "MatchedBlockHarnessInfrastructureError";
  }
}

export type MatchedBlockHarnessExecutionContract = {
  preflight_attempt_limit: number;
  harness_version: string;
  transcript_adapter_version: string;
  scorer_version: string;
  observer_contract_digest: string;
  timeout_policy_digest: string;
  resource_policy_digest: string;
  fixture_reset_policy_digest: string;
  network_retry_policy_version: string;
};

export type MatchedBlockArmIsolation = {
  workspace_isolation_id: string;
  ee_home_isolation_id: string;
  host_session_isolation_id: string;
  workspace_path: string;
  ee_home_path: string;
  host_state_path: string;
  artifact_root_path: string;
};

export type MatchedBlockExecutionBundle = {
  campaign: BenchmarkCampaignManifest;
  block: MatchedBlockManifest;
  scenario: BenchmarkScenarioManifest;
  fixture: BenchmarkFixtureManifest;
  groundTruth: BenchmarkGroundTruth;
  runtime: BenchmarkRuntimeManifest;
  instrumentation: BenchmarkInstrumentationManifest;
  armPlans: MatchedBlockArmPlan[];
};

export type MatchedBlockArmContext = MatchedBlockExecutionBundle & {
  plan: MatchedBlockArmPlan;
  control: MatchedBlockArmControl;
  executionContract: MatchedBlockHarnessExecutionContract;
  executionContractDigest: string;
  isolation: MatchedBlockArmIsolation;
};

export type MatchedBlockPreflightObservation = {
  passed: boolean;
  failure_code: string | null;
  evidence_digest: string;
};

export type MatchedBlockFixtureResetObservation = {
  reset_contract_digest: string;
  evidence_digest: string;
};

export type MatchedBlockExternalObserverHandle = {
  observer_id: string;
  observer_contract_digest: string;
  instrumentation_manifest_digest: string;
  started_evidence_digest: string;
};

export type MatchedBlockPreparedArm = {
  preparation_evidence_digest: string;
  ee_runtime_loaded: boolean;
  decision_pipeline_ready: boolean;
  delivery_mode: MatchedBlockArmControl["delivery_mode"];
};

export type MatchedBlockTaskExecutionResult = {
  task_outcome: BenchmarkTaskOutcome;
  task_timeout: boolean;
  product_runtime_failure_codes: string[];
  workspace_artifact_digest: string;
  host_transcript_digest: string;
  deterministic_check_digest: string;
  scoring_record_digest: string;
  execution_contract_digest: string;
  ee_runtime_loaded: boolean;
  decision_pipeline_ran: boolean;
  would_have_delivered: boolean | null;
  delivered: boolean;
  delivered_node_ids: string[];
};

export type MatchedBlockObserverCompletion = {
  arm_neutral_metrics_digest: string;
  observer_contract_digest: string;
  instrumentation_manifest_digest: string;
};

export type MatchedBlockHarnessDriver = {
  resolveIsolation: (
    bundle: MatchedBlockExecutionBundle,
    plan: MatchedBlockArmPlan
  ) => Promise<MatchedBlockArmIsolation> | MatchedBlockArmIsolation;
  runPreflight: (
    context: MatchedBlockArmContext,
    stage: BenchmarkPreflightStage,
    attemptNumber: number
  ) => Promise<MatchedBlockPreflightObservation>;
  resetFixture: (
    context: MatchedBlockArmContext
  ) => Promise<MatchedBlockFixtureResetObservation>;
  startExternalObserver: (
    context: MatchedBlockArmContext
  ) => Promise<MatchedBlockExternalObserverHandle>;
  prepareArm: (
    context: MatchedBlockArmContext
  ) => Promise<MatchedBlockPreparedArm>;
  releaseTaskInput: (
    context: MatchedBlockArmContext,
    prepared: MatchedBlockPreparedArm,
    taskInput: string
  ) => Promise<MatchedBlockTaskExecutionResult>;
  finishExternalObserver: (
    context: MatchedBlockArmContext,
    handle: MatchedBlockExternalObserverHandle,
    execution: MatchedBlockTaskExecutionResult | null
  ) => Promise<MatchedBlockObserverCompletion>;
  cleanupArm: (
    context: MatchedBlockArmContext,
    prepared: MatchedBlockPreparedArm | null
  ) => Promise<void>;
};

export type MatchedBlockHarnessResult = {
  block_id: string;
  status: "completed" | "preflight_failed";
  planned_arm_order: MatchedBlockArm[];
  formal_attempts: BenchmarkFormalAttempt[];
  failed_preflight: BenchmarkPreflightRecord | null;
};

type HarnessOptions = {
  store: MatchedBlockBenchmarkStore;
  blockId: string;
  executionContract: MatchedBlockHarnessExecutionContract;
  driver: MatchedBlockHarnessDriver;
  now?: () => string;
};

const fail = (
  code: MatchedBlockHarnessErrorCode,
  message: string
): never => {
  throw new MatchedBlockHarnessError(code, message);
};

const requireValue = <T>(value: T | undefined, label: string): T =>
  value ?? fail("BENCHMARK_BLOCK_NOT_READY", `${label} is missing from the sealed campaign store.`);

const assertNonEmpty = (value: string, label: string): void => {
  if (value.trim().length === 0) {
    fail("BENCHMARK_EXECUTION_CONTRACT_MISMATCH", `${label} must be non-empty.`);
  }
};

export const computeMatchedBlockExecutionContractDigest = (
  contract: MatchedBlockHarnessExecutionContract
): string => sha256Text(canonicalJson(contract));

const assertExecutionContract = (
  block: MatchedBlockManifest,
  instrumentation: BenchmarkInstrumentationManifest,
  contract: MatchedBlockHarnessExecutionContract
): string => {
  if (!Number.isSafeInteger(contract.preflight_attempt_limit) || contract.preflight_attempt_limit < 1) {
    fail(
      "BENCHMARK_EXECUTION_CONTRACT_MISMATCH",
      "preflight_attempt_limit must be a positive safe integer."
    );
  }
  for (const [label, value] of Object.entries(contract)) {
    if (label !== "preflight_attempt_limit") {
      assertNonEmpty(String(value), label);
    }
  }
  if (
    contract.harness_version !== instrumentation.harness_version ||
    contract.transcript_adapter_version !== instrumentation.transcript_adapter_version ||
    contract.scorer_version !== instrumentation.scorer_version ||
    contract.observer_contract_digest !== instrumentation.observer_contract_digest ||
    contract.timeout_policy_digest !== instrumentation.timeout_policy_digest ||
    contract.resource_policy_digest !== instrumentation.resource_policy_digest ||
    contract.fixture_reset_policy_digest !== instrumentation.fixture_reset_policy_digest ||
    contract.network_retry_policy_version !== instrumentation.network_retry_policy_version
  ) {
    fail(
      "BENCHMARK_EXECUTION_CONTRACT_MISMATCH",
      "Harness execution contract differs from the sealed instrumentation manifest."
    );
  }
  const digest = computeMatchedBlockExecutionContractDigest(contract);
  if (digest !== block.environment_contract_digest) {
    fail(
      "BENCHMARK_EXECUTION_CONTRACT_MISMATCH",
      "Harness execution contract digest differs from the sealed block environment contract."
    );
  }
  return digest;
};

const assertUniqueIsolationIds = (plans: MatchedBlockArmPlan[]): void => {
  for (const field of [
    "workspace_isolation_id",
    "ee_home_isolation_id",
    "host_session_isolation_id"
  ] as const) {
    const values = plans.map((plan) => plan[field]);
    if (new Set(values).size !== MATCHED_BLOCK_ARMS.length) {
      fail(
        "BENCHMARK_ARM_ISOLATION_INVALID",
        `Every arm requires a unique ${field}.`
      );
    }
  }
};

const assertArmOrderAndControls = (
  block: MatchedBlockManifest,
  plans: MatchedBlockArmPlan[]
): void => {
  const expectedOrder = deriveMatchedBlockArmOrder(block.randomization_seed);
  if (canonicalJson(expectedOrder) !== canonicalJson(block.planned_arm_order)) {
    fail(
      "BENCHMARK_ARM_ORDER_MISMATCH",
      "Sealed arm order does not match the frozen randomization seed."
    );
  }
  for (const plan of plans) {
    if (plan.arm_control_digest !== computeMatchedBlockArmControlDigest(plan.arm)) {
      fail(
        "BENCHMARK_ARM_CONTROL_MISMATCH",
        `Arm control digest drifted for ${plan.arm}.`
      );
    }
  }
  assertUniqueIsolationIds(plans);
};

const loadExecutionBundle = (
  store: MatchedBlockBenchmarkStore,
  blockId: string
): MatchedBlockExecutionBundle => {
  const block = requireValue(store.getBlockManifest(blockId), "Matched-block manifest");
  const campaign = requireValue(
    store.getCampaignManifest(block.benchmark_campaign_id),
    "Benchmark campaign manifest"
  );
  const scenario = requireValue(
    store.getScenarioManifest(block.scenario_id, block.scenario_version),
    "Scenario manifest"
  );
  const fixture = requireValue(store.getFixtureManifest(block.fixture_id), "Fixture manifest");
  const groundTruth = requireValue(
    store.getGroundTruth(block.ground_truth_id),
    "Ground-truth manifest"
  );
  const runtime = requireValue(
    store.getRuntimeManifest(block.runtime_manifest_id),
    "Runtime manifest"
  );
  const instrumentation = requireValue(
    store.getInstrumentationManifest(block.instrumentation_manifest_id),
    "Instrumentation manifest"
  );
  const armPlans = assertCompleteMatchedBlockArmPlans(store.listArmPlans(block.block_id))
    .sort((left, right) => left.planned_ordinal - right.planned_ordinal);
  if (
    block.sealed_at.trim().length === 0 ||
    block.task_input_digest !== scenario.task_input_digest ||
    block.scenario_digest !== scenario.scenario_digest ||
    scenario.ground_truth_digest !== groundTruth.ground_truth_digest ||
    block.repository_snapshot_digest !== fixture.repository_snapshot_digest ||
    block.candidate_corpus_digest !== fixture.candidate_corpus_digest ||
    fixture.reset_contract_digest !== instrumentation.fixture_reset_policy_digest ||
    block.host_identity !== runtime.host_identity ||
    block.instrumentation_manifest_id !== instrumentation.instrumentation_manifest_id
  ) {
    fail(
      "BENCHMARK_BLOCK_NOT_READY",
      "Sealed block references are not internally consistent for formal execution."
    );
  }
  assertArmOrderAndControls(block, armPlans);
  return {
    campaign,
    block,
    scenario,
    fixture,
    groundTruth,
    runtime,
    instrumentation,
    armPlans
  };
};

const assertIsolation = (
  plan: MatchedBlockArmPlan,
  isolation: MatchedBlockArmIsolation
): void => {
  if (
    isolation.workspace_isolation_id !== plan.workspace_isolation_id ||
    isolation.ee_home_isolation_id !== plan.ee_home_isolation_id ||
    isolation.host_session_isolation_id !== plan.host_session_isolation_id
  ) {
    fail(
      "BENCHMARK_ARM_ISOLATION_INVALID",
      `Resolved isolation does not match the sealed ${plan.arm} arm plan.`
    );
  }
  for (const [label, value] of Object.entries(isolation)) {
    assertNonEmpty(value, label);
  }
};

const buildContext = async (
  bundle: MatchedBlockExecutionBundle,
  plan: MatchedBlockArmPlan,
  executionContract: MatchedBlockHarnessExecutionContract,
  executionContractDigest: string,
  driver: MatchedBlockHarnessDriver
): Promise<MatchedBlockArmContext> => {
  const isolation = await driver.resolveIsolation(bundle, plan);
  assertIsolation(plan, isolation);
  return {
    ...bundle,
    plan,
    control: getMatchedBlockArmControl(plan.arm),
    executionContract,
    executionContractDigest,
    isolation
  };
};

const buildPreflightId = (
  blockId: string,
  arm: MatchedBlockArm,
  stage: BenchmarkPreflightStage,
  attemptNumber: number
): string => `preflight_${sha256Text(canonicalJson({
  block_id: blockId,
  arm,
  stage,
  attempt_number: attemptNumber
})).slice(0, 24)}`;

const buildAttemptId = (
  block: MatchedBlockManifest,
  plan: MatchedBlockArmPlan
): string => `attempt_${sha256Text(canonicalJson({
  block_id: block.block_id,
  manifest_digest: block.manifest_digest,
  arm: plan.arm,
  planned_ordinal: plan.planned_ordinal
})).slice(0, 24)}`;

const assertPreparedArmControl = (
  control: MatchedBlockArmControl,
  prepared: MatchedBlockPreparedArm
): void => {
  assertNonEmpty(prepared.preparation_evidence_digest, "preparation_evidence_digest");
  const expectedRuntime = control.ee_runtime_mode === "enabled";
  const expectedDecision = control.decision_pipeline_mode === "enabled";
  if (
    prepared.ee_runtime_loaded !== expectedRuntime ||
    prepared.decision_pipeline_ready !== expectedDecision ||
    prepared.delivery_mode !== control.delivery_mode
  ) {
    fail(
      "BENCHMARK_ARM_CONTROL_MISMATCH",
      `Prepared arm does not enforce the frozen ${control.arm} control behavior.`
    );
  }
};

const assertObserverIdentity = (
  instrumentation: BenchmarkInstrumentationManifest,
  handle: MatchedBlockExternalObserverHandle
): void => {
  assertNonEmpty(handle.observer_id, "observer_id");
  assertNonEmpty(handle.started_evidence_digest, "started_evidence_digest");
  if (
    handle.observer_contract_digest !== instrumentation.observer_contract_digest ||
    handle.instrumentation_manifest_digest !== instrumentation.instrumentation_manifest_digest
  ) {
    throw new MatchedBlockHarnessInfrastructureError(
      "BENCH_INSTRUMENTATION_INCOMPARABLE",
      "External observer identity differs from the sealed instrumentation manifest."
    );
  }
};

const assertTaskExecutionControl = (
  context: MatchedBlockArmContext,
  execution: MatchedBlockTaskExecutionResult
): void => {
  const { arm } = context.plan;
  for (const [label, value] of [
    ["workspace_artifact_digest", execution.workspace_artifact_digest],
    ["host_transcript_digest", execution.host_transcript_digest],
    ["deterministic_check_digest", execution.deterministic_check_digest],
    ["scoring_record_digest", execution.scoring_record_digest]
  ] as const) {
    assertNonEmpty(value, label);
  }
  if (execution.execution_contract_digest !== context.executionContractDigest) {
    throw new MatchedBlockHarnessInfrastructureError(
      "BENCH_INSTRUMENTATION_INCOMPARABLE",
      "Arm execution used a different timeout/resource/instrumentation contract."
    );
  }
  if (new Set(execution.product_runtime_failure_codes).size !== execution.product_runtime_failure_codes.length) {
    throw new MatchedBlockHarnessInfrastructureError(
      "BENCH_HARNESS_DEFECT",
      "Product runtime failure codes must be unique."
    );
  }
  if (arm === "treatment") {
    if (
      !execution.ee_runtime_loaded ||
      !execution.decision_pipeline_ran ||
      execution.would_have_delivered === null ||
      (execution.delivered && !execution.would_have_delivered)
    ) {
      throw new MatchedBlockHarnessInfrastructureError(
        "BENCH_ARM_CONTAMINATION_DETECTED",
        "Treatment execution did not preserve the declared EE decision/delivery behavior."
      );
    }
    return;
  }
  if (arm === "forced_holdout") {
    if (
      !execution.ee_runtime_loaded ||
      !execution.decision_pipeline_ran ||
      execution.would_have_delivered === null ||
      execution.delivered ||
      execution.delivered_node_ids.length > 0
    ) {
      throw new MatchedBlockHarnessInfrastructureError(
        "BENCH_ARM_CONTAMINATION_DETECTED",
        "Forced holdout must run the decision pipeline, capture would-have-delivered, and suppress delivery unconditionally."
      );
    }
    return;
  }
  if (
    execution.ee_runtime_loaded ||
    execution.decision_pipeline_ran ||
    execution.would_have_delivered !== null ||
    execution.delivered ||
    execution.delivered_node_ids.length > 0
  ) {
    throw new MatchedBlockHarnessInfrastructureError(
      "BENCH_ARM_CONTAMINATION_DETECTED",
      "No-EE execution contained ExperienceEngine runtime, decision, or delivery evidence."
    );
  }
};

const infrastructureCodeForError = (
  error: unknown
): BenchmarkInfrastructureFailureCode =>
  error instanceof MatchedBlockHarnessInfrastructureError
    ? error.infrastructureCode
    : "BENCH_HARNESS_DEFECT";

const terminalStatusForInfrastructureCode = (
  code: BenchmarkInfrastructureFailureCode
): BenchmarkFormalAttempt["execution_status"] => {
  if (code === "BENCH_ARM_CONTAMINATION_DETECTED") {
    return "invalid";
  }
  if (code === "BENCH_HARNESS_TIMEOUT") {
    return "harness_timed_out";
  }
  if (code === "BENCH_OPERATOR_CANCELLED") {
    return "cancelled";
  }
  return "infrastructure_failed";
};

const terminalInfrastructureAttempt = (
  running: BenchmarkFormalAttempt,
  finishedAt: string,
  code: BenchmarkInfrastructureFailureCode
): BenchmarkFormalAttempt => ({
  ...running,
  attempt_state_revision: 2,
  execution_status: terminalStatusForInfrastructureCode(code),
  infrastructure_failure_code: code,
  finished_at: finishedAt
});

const runPreflightStage = async (
  store: MatchedBlockBenchmarkStore,
  context: MatchedBlockArmContext,
  stage: BenchmarkPreflightStage,
  now: () => string,
  driver: MatchedBlockHarnessDriver
): Promise<BenchmarkPreflightRecord | null> => {
  const existing = store.listPreflightRecords(context.block.block_id, context.plan.arm)
    .filter((record) => record.preflight_stage === stage);
  if (existing.some((record) => record.status === "passed")) {
    return null;
  }
  for (
    let attemptNumber = existing.length + 1;
    attemptNumber <= context.executionContract.preflight_attempt_limit;
    attemptNumber += 1
  ) {
    const startedAt = now();
    let observation: MatchedBlockPreflightObservation;
    try {
      observation = await driver.runPreflight(context, stage, attemptNumber);
    } catch (error) {
      observation = {
        passed: false,
        failure_code: infrastructureCodeForError(error),
        evidence_digest: sha256Text(canonicalJson({
          stage,
          attempt_number: attemptNumber,
          error_name: error instanceof Error ? error.name : "unknown"
        }))
      };
    }
    assertNonEmpty(observation.evidence_digest, "preflight evidence_digest");
    const finishedAt = now();
    const finalFailure = !observation.passed &&
      attemptNumber === context.executionContract.preflight_attempt_limit;
    const record: BenchmarkPreflightRecord = {
      preflight_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.preflight,
      benchmark_campaign_id: context.block.benchmark_campaign_id,
      block_id: context.block.block_id,
      manifest_digest: context.block.manifest_digest,
      arm: context.plan.arm,
      preflight_attempt_id: buildPreflightId(
        context.block.block_id,
        context.plan.arm,
        stage,
        attemptNumber
      ),
      preflight_attempt_number: attemptNumber,
      preflight_stage: stage,
      status: observation.passed ? "passed" : finalFailure ? "failed" : "retried",
      failure_code: observation.passed
        ? null
        : observation.failure_code ?? "BENCH_HARNESS_DEFECT",
      started_at: startedAt,
      finished_at: finishedAt,
      evidence_digest: observation.evidence_digest
    };
    store.appendPreflightRecord(record);
    if (observation.passed) {
      return null;
    }
    if (finalFailure) {
      return record;
    }
  }
  return existing.at(-1) ?? null;
};

const runPreflight = async (
  store: MatchedBlockBenchmarkStore,
  contexts: MatchedBlockArmContext[],
  now: () => string,
  driver: MatchedBlockHarnessDriver
): Promise<BenchmarkPreflightRecord | null> => {
  for (const context of contexts) {
    for (const stage of BENCHMARK_PREFLIGHT_STAGES) {
      const failed = await runPreflightStage(store, context, stage, now, driver);
      if (failed) {
        return failed;
      }
    }
  }
  return null;
};

const buildRunningAttempt = (
  context: MatchedBlockArmContext,
  startedAt: string
): BenchmarkFormalAttempt => ({
  attempt_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.formalAttempt,
  benchmark_campaign_id: context.block.benchmark_campaign_id,
  block_id: context.block.block_id,
  manifest_digest: context.block.manifest_digest,
  arm: context.plan.arm,
  attempt_id: buildAttemptId(context.block, context.plan),
  attempt_number: 1,
  attempt_state_revision: 1,
  planned_ordinal: context.plan.planned_ordinal,
  execution_status: "running",
  task_outcome: "unavailable",
  task_timeout: false,
  infrastructure_failure_code: null,
  product_runtime_failure_codes: [],
  started_at: startedAt,
  finished_at: null,
  workspace_artifact_digest: null,
  host_transcript_digest: null,
  arm_neutral_metrics_digest: null,
  deterministic_check_digest: null,
  scoring_record_digest: null
});

const executeArm = async (
  store: MatchedBlockBenchmarkStore,
  context: MatchedBlockArmContext,
  now: () => string,
  driver: MatchedBlockHarnessDriver
): Promise<BenchmarkFormalAttempt> => {
  let prepared: MatchedBlockPreparedArm | null = null;
  let observer: MatchedBlockExternalObserverHandle | null = null;
  let observerFinished = false;
  let running: BenchmarkFormalAttempt | null = null;
  let execution: MatchedBlockTaskExecutionResult | null = null;
  try {
    const reset = await driver.resetFixture(context);
    if (
      reset.reset_contract_digest !== context.instrumentation.fixture_reset_policy_digest ||
      reset.reset_contract_digest !== context.executionContract.fixture_reset_policy_digest
    ) {
      throw new MatchedBlockHarnessInfrastructureError(
        "BENCH_INSTRUMENTATION_INCOMPARABLE",
        "Fixture reset contract differs from the sealed arm-neutral policy."
      );
    }
    assertNonEmpty(reset.evidence_digest, "fixture reset evidence_digest");
    observer = await driver.startExternalObserver(context);
    assertObserverIdentity(context.instrumentation, observer);
    prepared = await driver.prepareArm(context);
    assertPreparedArmControl(context.control, prepared);
    running = buildRunningAttempt(context, now());
    store.startFormalAttempt(running);
    execution = await driver.releaseTaskInput(context, prepared, context.scenario.task_input);
    assertTaskExecutionControl(context, execution);
    observerFinished = true;
    const observerCompletion = await driver.finishExternalObserver(context, observer, execution);
    if (
      observerCompletion.observer_contract_digest !== context.instrumentation.observer_contract_digest ||
      observerCompletion.instrumentation_manifest_digest !==
        context.instrumentation.instrumentation_manifest_digest
    ) {
      throw new MatchedBlockHarnessInfrastructureError(
        "BENCH_INSTRUMENTATION_INCOMPARABLE",
        "Completed observer identity differs from the sealed instrumentation manifest."
      );
    }
    assertNonEmpty(
      observerCompletion.arm_neutral_metrics_digest,
      "arm_neutral_metrics_digest"
    );
    const terminal: BenchmarkFormalAttempt = {
      ...running,
      attempt_state_revision: 2,
      execution_status: "completed",
      task_outcome: execution.task_outcome,
      task_timeout: execution.task_timeout,
      product_runtime_failure_codes: [...execution.product_runtime_failure_codes],
      finished_at: now(),
      workspace_artifact_digest: execution.workspace_artifact_digest,
      host_transcript_digest: execution.host_transcript_digest,
      arm_neutral_metrics_digest: observerCompletion.arm_neutral_metrics_digest,
      deterministic_check_digest: execution.deterministic_check_digest,
      scoring_record_digest: execution.scoring_record_digest
    };
    store.terminalizeFormalAttempt(1, terminal);
    return terminal;
  } catch (error) {
    if (!running) {
      throw error;
    }
    if (observer && !observerFinished) {
      observerFinished = true;
      try {
        await driver.finishExternalObserver(context, observer, execution);
      } catch {
        // The formal row still terminalizes with the original stable failure code.
      }
    }
    const terminal = terminalInfrastructureAttempt(
      running,
      now(),
      infrastructureCodeForError(error)
    );
    store.terminalizeFormalAttempt(1, terminal);
    return terminal;
  } finally {
    await driver.cleanupArm(context, prepared);
  }
};

export const executeSealedMatchedBlock = async (
  options: HarnessOptions
): Promise<MatchedBlockHarnessResult> => {
  const now = options.now ?? (() => new Date().toISOString());
  const bundle = loadExecutionBundle(options.store, options.blockId);
  const executionContractDigest = assertExecutionContract(
    bundle.block,
    bundle.instrumentation,
    options.executionContract
  );
  if (options.store.getBlockDisposition(bundle.block.block_id)) {
    fail(
      "BENCHMARK_BLOCK_NOT_READY",
      "A terminal block disposition already exists for this sealed block."
    );
  }
  for (const arm of MATCHED_BLOCK_ARMS) {
    if (options.store.getFormalAttempt(bundle.block.block_id, arm)) {
      fail(
        "BENCHMARK_FORMAL_ATTEMPT_ALREADY_CONSUMED",
        "A formal arm slot is already consumed; the original block cannot be partially rerun."
      );
    }
  }
  const contexts: MatchedBlockArmContext[] = [];
  for (const plan of bundle.armPlans) {
    contexts.push(await buildContext(
      bundle,
      plan,
      options.executionContract,
      executionContractDigest,
      options.driver
    ));
  }
  for (const field of [
    "workspace_path",
    "ee_home_path",
    "host_state_path",
    "artifact_root_path"
  ] as const) {
    if (new Set(contexts.map((context) => context.isolation[field])).size !== MATCHED_BLOCK_ARMS.length) {
      fail(
        "BENCHMARK_ARM_ISOLATION_INVALID",
        `Resolved ${field} must be unique for every arm.`
      );
    }
  }
  const failedPreflight = await runPreflight(
    options.store,
    contexts,
    now,
    options.driver
  );
  if (failedPreflight) {
    for (const context of contexts) {
      await options.driver.cleanupArm(context, null);
    }
    return {
      block_id: bundle.block.block_id,
      status: "preflight_failed",
      planned_arm_order: [...bundle.block.planned_arm_order],
      formal_attempts: [],
      failed_preflight: failedPreflight
    };
  }
  const formalAttempts: BenchmarkFormalAttempt[] = [];
  for (const context of contexts) {
    formalAttempts.push(await executeArm(options.store, context, now, options.driver));
  }
  return {
    block_id: bundle.block.block_id,
    status: "completed",
    planned_arm_order: [...bundle.block.planned_arm_order],
    formal_attempts: formalAttempts,
    failed_preflight: null
  };
};
