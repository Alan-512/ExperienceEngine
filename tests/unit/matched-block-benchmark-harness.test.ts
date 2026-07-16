import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Text } from "../../src/runtime/package/package-generation.js";
import {
  computeMatchedBlockArmControlDigest,
  deriveMatchedBlockArmOrder,
  getMatchedBlockArmControl
} from "../../src/evaluation/matched-block/arm-control.js";
import {
  computeMatchedBlockExecutionContractDigest,
  executeSealedMatchedBlock,
  MatchedBlockHarnessError,
  type MatchedBlockArmContext,
  type MatchedBlockHarnessDriver,
  type MatchedBlockTaskExecutionResult
} from "../../src/evaluation/matched-block/harness.js";
import { MATCHED_BLOCK_SCHEMA_VERSIONS } from "../../src/evaluation/matched-block/constants.js";
import type {
  BenchmarkFormalAttempt,
  BenchmarkPreflightStage,
  MatchedBlockArm
} from "../../src/evaluation/matched-block/types.js";
import {
  createMatchedBlockHarnessStoreFixture,
  DEFAULT_MATCHED_BLOCK_EXECUTION_CONTRACT,
  MATCHED_BLOCK_TEST_CREATED_AT
} from "./matched-block-benchmark-fixture.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const createRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "experienceengine-matched-harness-"));
  tempDirs.push(root);
  return root;
};

const createClock = () => {
  let tick = 0;
  return () => new Date(Date.parse(MATCHED_BLOCK_TEST_CREATED_AT) + (tick++ * 1_000)).toISOString();
};

type DriverOptions = {
  events?: string[];
  failPreflight?: (arm: MatchedBlockArm, stage: BenchmarkPreflightStage, attempt: number) => boolean;
  mutateExecution?: (
    context: MatchedBlockArmContext,
    execution: MatchedBlockTaskExecutionResult
  ) => MatchedBlockTaskExecutionResult;
};

const createDriver = (options: DriverOptions = {}): MatchedBlockHarnessDriver => {
  const events = options.events ?? [];
  return {
    resolveIsolation: (_bundle, plan) => ({
      workspace_isolation_id: plan.workspace_isolation_id,
      ee_home_isolation_id: plan.ee_home_isolation_id,
      host_session_isolation_id: plan.host_session_isolation_id,
      workspace_path: `workspace/${plan.workspace_isolation_id}`,
      ee_home_path: `ee-home/${plan.ee_home_isolation_id}`,
      host_state_path: `host/${plan.host_session_isolation_id}`,
      artifact_root_path: `artifacts/${plan.block_id}/${plan.arm}`
    }),
    runPreflight: async (context, stage, attempt) => {
      events.push(`preflight:${context.plan.arm}:${stage}:${attempt}`);
      const failed = options.failPreflight?.(context.plan.arm, stage, attempt) ?? false;
      return {
        passed: !failed,
        failure_code: failed ? "BENCH_HARNESS_DEFECT" : null,
        evidence_digest: sha256Text(`${context.plan.arm}:${stage}:${attempt}:${failed}`)
      };
    },
    resetFixture: async (context) => {
      events.push(`reset:${context.plan.arm}`);
      return {
        reset_contract_digest: context.executionContract.fixture_reset_policy_digest,
        evidence_digest: sha256Text(`reset:${context.plan.arm}`)
      };
    },
    startExternalObserver: async (context) => {
      events.push(`observer-start:${context.plan.arm}`);
      return {
        observer_id: `observer-${context.plan.arm}`,
        observer_contract_digest: context.instrumentation.observer_contract_digest,
        instrumentation_manifest_digest:
          context.instrumentation.instrumentation_manifest_digest,
        started_evidence_digest: sha256Text(`observer-start:${context.plan.arm}`)
      };
    },
    prepareArm: async (context) => {
      events.push(`prepare:${context.plan.arm}`);
      return {
        preparation_evidence_digest: sha256Text(`prepare:${context.plan.arm}`),
        ee_runtime_loaded: context.control.ee_runtime_mode === "enabled",
        decision_pipeline_ready: context.control.decision_pipeline_mode === "enabled",
        delivery_mode: context.control.delivery_mode
      };
    },
    releaseTaskInput: async (context, _prepared, taskInput) => {
      events.push(`release:${context.plan.arm}`);
      const arm = context.plan.arm;
      const execution: MatchedBlockTaskExecutionResult = {
        task_outcome: "success",
        task_timeout: false,
        product_runtime_failure_codes: [],
        workspace_artifact_digest: sha256Text(`workspace:${arm}`),
        host_transcript_digest: sha256Text(`transcript:${arm}:${taskInput}`),
        deterministic_check_digest: sha256Text(`checks:${arm}`),
        scoring_record_digest: sha256Text(`score:${arm}`),
        execution_contract_digest: context.executionContractDigest,
        ee_runtime_loaded: arm !== "no_ee",
        decision_pipeline_ran: arm !== "no_ee",
        would_have_delivered: arm === "no_ee" ? null : true,
        delivered: arm === "treatment",
        delivered_node_ids: arm === "treatment" ? ["node-1"] : []
      };
      return options.mutateExecution?.(context, execution) ?? execution;
    },
    finishExternalObserver: async (context) => {
      events.push(`observer-finish:${context.plan.arm}`);
      return {
        arm_neutral_metrics_digest: sha256Text(`metrics:${context.plan.arm}`),
        observer_contract_digest: context.instrumentation.observer_contract_digest,
        instrumentation_manifest_digest:
          context.instrumentation.instrumentation_manifest_digest
      };
    },
    cleanupArm: async (context) => {
      events.push(`cleanup:${context.plan.arm}`);
    }
  };
};

const buildRunningAttempt = (
  blockId: string,
  manifestDigest: string,
  campaignId: string,
  arm: MatchedBlockArm,
  plannedOrdinal: number
): BenchmarkFormalAttempt => ({
  attempt_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.formalAttempt,
  benchmark_campaign_id: campaignId,
  block_id: blockId,
  manifest_digest: manifestDigest,
  arm,
  attempt_id: `${blockId}-${arm}-attempt-1`,
  attempt_number: 1,
  attempt_state_revision: 1,
  planned_ordinal: plannedOrdinal,
  execution_status: "running",
  task_outcome: "unavailable",
  task_timeout: false,
  infrastructure_failure_code: null,
  product_runtime_failure_codes: [],
  started_at: MATCHED_BLOCK_TEST_CREATED_AT,
  finished_at: null,
  workspace_artifact_digest: null,
  host_transcript_digest: null,
  arm_neutral_metrics_digest: null,
  deterministic_check_digest: null,
  scoring_record_digest: null
});

describe("sealed matched-block harness", () => {
  it("derives a stable complete arm order and exact frozen arm controls", () => {
    const first = deriveMatchedBlockArmOrder("seed-alpha");
    const second = deriveMatchedBlockArmOrder("seed-alpha");
    expect(first).toEqual(second);
    expect(new Set(first)).toEqual(new Set(["treatment", "forced_holdout", "no_ee"]));
    expect(getMatchedBlockArmControl("forced_holdout")).toMatchObject({
      ee_runtime_mode: "enabled",
      decision_pipeline_mode: "enabled",
      delivery_mode: "forced_suppressed",
      capture_would_have_delivered: true
    });
    expect(getMatchedBlockArmControl("no_ee")).toMatchObject({
      ee_runtime_mode: "disabled",
      decision_pipeline_mode: "disabled",
      delivery_mode: "disabled",
      capture_would_have_delivered: false
    });
    expect(computeMatchedBlockArmControlDigest("treatment")).not.toBe(
      computeMatchedBlockArmControlDigest("forced_holdout")
    );
  });

  it("runs bounded preflight retries without consuming a formal attempt", async () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    const firstArm = fixture.block.planned_arm_order[0]!;
    const result = await executeSealedMatchedBlock({
      store: fixture.store,
      blockId: fixture.block.block_id,
      executionContract: fixture.executionContract,
      driver: createDriver({
        failPreflight: (arm, stage) => arm === firstArm && stage === "host_startup"
      }),
      now: createClock()
    });

    expect(result.status).toBe("preflight_failed");
    expect(result.formal_attempts).toEqual([]);
    expect(result.failed_preflight).toMatchObject({
      arm: firstArm,
      preflight_stage: "host_startup",
      preflight_attempt_number: 2,
      status: "failed"
    });
    const records = fixture.store.listPreflightRecords(fixture.block.block_id, firstArm)
      .filter((record) => record.preflight_stage === "host_startup");
    expect(records.map((record) => record.status)).toEqual(["retried", "failed"]);
    for (const arm of fixture.block.planned_arm_order) {
      expect(fixture.store.getFormalAttempt(fixture.block.block_id, arm)).toBeUndefined();
    }
    fixture.store.close();
  });

  it("executes all three arms in sealed order with arm-neutral instrumentation", async () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    const events: string[] = [];
    const originalStart = fixture.store.startFormalAttempt.bind(fixture.store);
    fixture.store.startFormalAttempt = (attempt) => {
      events.push(`formal-start:${attempt.arm}`);
      originalStart(attempt);
    };

    const result = await executeSealedMatchedBlock({
      store: fixture.store,
      blockId: fixture.block.block_id,
      executionContract: fixture.executionContract,
      driver: createDriver({ events }),
      now: createClock()
    });

    expect(result.status).toBe("completed");
    expect(result.planned_arm_order).toEqual(fixture.block.planned_arm_order);
    expect(result.formal_attempts.map((attempt) => attempt.arm)).toEqual(
      fixture.block.planned_arm_order
    );
    expect(result.formal_attempts.every((attempt) => attempt.execution_status === "completed"))
      .toBe(true);
    for (const arm of fixture.block.planned_arm_order) {
      const startIndex = events.indexOf(`formal-start:${arm}`);
      expect(events[startIndex + 1]).toBe(`release:${arm}`);
      expect(events).toContain(`reset:${arm}`);
      expect(events).toContain(`observer-start:${arm}`);
      expect(events).toContain(`observer-finish:${arm}`);
      expect(events).toContain(`cleanup:${arm}`);
    }
    expect(computeMatchedBlockExecutionContractDigest(fixture.executionContract)).toBe(
      fixture.block.environment_contract_digest
    );
    fixture.store.close();
  });

  it("records forced-holdout delivery leakage as consumed contamination evidence", async () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    const result = await executeSealedMatchedBlock({
      store: fixture.store,
      blockId: fixture.block.block_id,
      executionContract: fixture.executionContract,
      driver: createDriver({
        mutateExecution: (context, execution) => context.plan.arm === "forced_holdout"
          ? { ...execution, delivered: true, delivered_node_ids: ["node-1"] }
          : execution
      }),
      now: createClock()
    });

    const holdout = result.formal_attempts.find((attempt) => attempt.arm === "forced_holdout");
    expect(holdout).toMatchObject({
      execution_status: "invalid",
      infrastructure_failure_code: "BENCH_ARM_CONTAMINATION_DETECTED",
      attempt_state_revision: 2
    });
    expect(() => fixture.store.startFormalAttempt(buildRunningAttempt(
      fixture.block.block_id,
      fixture.block.manifest_digest,
      fixture.block.benchmark_campaign_id,
      "forced_holdout",
      fixture.armPlans.find((plan) => plan.arm === "forced_holdout")!.planned_ordinal
    ))).toThrowError(expect.objectContaining({
      code: "BENCHMARK_ATTEMPT_ALREADY_EXISTS"
    }));
    fixture.store.close();
  });

  it("rejects no-EE runtime participation and preserves the formal failure", async () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    const result = await executeSealedMatchedBlock({
      store: fixture.store,
      blockId: fixture.block.block_id,
      executionContract: fixture.executionContract,
      driver: createDriver({
        mutateExecution: (context, execution) => context.plan.arm === "no_ee"
          ? { ...execution, ee_runtime_loaded: true }
          : execution
      }),
      now: createClock()
    });

    expect(result.formal_attempts.find((attempt) => attempt.arm === "no_ee")).toMatchObject({
      execution_status: "invalid",
      infrastructure_failure_code: "BENCH_ARM_CONTAMINATION_DETECTED"
    });
    fixture.store.close();
  });

  it("refuses a partial rerun before any new task input is released", async () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    const consumedPlan = fixture.armPlans[0]!;
    fixture.store.startFormalAttempt(buildRunningAttempt(
      fixture.block.block_id,
      fixture.block.manifest_digest,
      fixture.block.benchmark_campaign_id,
      consumedPlan.arm,
      consumedPlan.planned_ordinal
    ));
    const events: string[] = [];

    await expect(executeSealedMatchedBlock({
      store: fixture.store,
      blockId: fixture.block.block_id,
      executionContract: DEFAULT_MATCHED_BLOCK_EXECUTION_CONTRACT,
      driver: createDriver({ events }),
      now: createClock()
    })).rejects.toEqual(expect.objectContaining<Partial<MatchedBlockHarnessError>>({
      code: "BENCHMARK_FORMAL_ATTEMPT_ALREADY_CONSUMED"
    }));
    expect(events.some((event) => event.startsWith("release:"))).toBe(false);
    fixture.store.close();
  });
});
