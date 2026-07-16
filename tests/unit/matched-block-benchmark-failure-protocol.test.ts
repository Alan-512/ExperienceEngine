import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MATCHED_BLOCK_SCHEMA_VERSIONS } from "../../src/evaluation/matched-block/constants.js";
import {
  appendMatchedBlockDisposition,
  assessMatchedBlock,
  createWholeBlockReplacement,
  MatchedBlockFailureProtocolError
} from "../../src/evaluation/matched-block/failure-protocol.js";
import type {
  BenchmarkAttemptExecutionStatus,
  BenchmarkFormalAttempt,
  BenchmarkInfrastructureFailureCode,
  BenchmarkTaskOutcome,
  MatchedBlockArm
} from "../../src/evaluation/matched-block/types.js";
import {
  createMatchedBlockHarnessStoreFixture,
  MATCHED_BLOCK_TEST_CREATED_AT
} from "./matched-block-benchmark-fixture.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const createRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "experienceengine-matched-failure-"));
  tempDirs.push(root);
  return root;
};

type TerminalOverrides = {
  executionStatus?: Exclude<BenchmarkAttemptExecutionStatus, "running">;
  taskOutcome?: BenchmarkTaskOutcome;
  taskTimeout?: boolean;
  infrastructureCode?: BenchmarkInfrastructureFailureCode | null;
  productRuntimeFailureCodes?: string[];
};

const insertTerminalAttempt = (
  fixture: ReturnType<typeof createMatchedBlockHarnessStoreFixture>,
  arm: MatchedBlockArm,
  overrides: TerminalOverrides = {}
): BenchmarkFormalAttempt => {
  const plan = fixture.armPlans.find((candidate) => candidate.arm === arm)!;
  const running: BenchmarkFormalAttempt = {
    attempt_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.formalAttempt,
    benchmark_campaign_id: fixture.block.benchmark_campaign_id,
    block_id: fixture.block.block_id,
    manifest_digest: fixture.block.manifest_digest,
    arm,
    attempt_id: `${fixture.block.block_id}-${arm}-attempt-1`,
    attempt_number: 1,
    attempt_state_revision: 1,
    planned_ordinal: plan.planned_ordinal,
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
  };
  fixture.store.startFormalAttempt(running);
  const executionStatus = overrides.executionStatus ?? "completed";
  const terminal: BenchmarkFormalAttempt = {
    ...running,
    attempt_state_revision: 2,
    execution_status: executionStatus,
    task_outcome: overrides.taskOutcome ?? (executionStatus === "completed" ? "success" : "unavailable"),
    task_timeout: overrides.taskTimeout ?? false,
    infrastructure_failure_code: overrides.infrastructureCode ??
      (executionStatus === "completed" ? null : "BENCH_HARNESS_DEFECT"),
    product_runtime_failure_codes: overrides.productRuntimeFailureCodes ?? [],
    finished_at: "2026-07-16T08:01:00.000Z",
    workspace_artifact_digest: executionStatus === "completed" ? `${arm}-workspace` : null,
    host_transcript_digest: executionStatus === "completed" ? `${arm}-transcript` : null,
    arm_neutral_metrics_digest: executionStatus === "completed" ? `${arm}-metrics` : null,
    deterministic_check_digest: executionStatus === "completed" ? `${arm}-checks` : null,
    scoring_record_digest: executionStatus === "completed" ? `${arm}-score` : null
  };
  fixture.store.terminalizeFormalAttempt(1, terminal);
  return terminal;
};

const insertOtherCompletedArms = (
  fixture: ReturnType<typeof createMatchedBlockHarnessStoreFixture>,
  excludedArm?: MatchedBlockArm
): void => {
  for (const arm of fixture.block.planned_arm_order) {
    if (arm !== excludedArm) {
      insertTerminalAttempt(fixture, arm);
    }
  }
};

describe("matched-block failure and replacement protocol", () => {
  it("keeps task timeout and EE product-runtime failures in a complete efficacy block", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertTerminalAttempt(fixture, "treatment", {
      taskOutcome: "failure",
      taskTimeout: true,
      productRuntimeFailureCodes: ["EE_ROUTE_UNAVAILABLE"]
    });
    insertTerminalAttempt(fixture, "forced_holdout");
    insertTerminalAttempt(fixture, "no_ee");

    const assessment = assessMatchedBlock(fixture.store, fixture.block.block_id);
    expect(assessment).toMatchObject({
      disposition: "complete",
      efficacy_eligible: true,
      affected_arms: []
    });
    expect(assessment.attempts.find((attempt) => attempt.arm === "treatment")).toMatchObject({
      classification: "product_failure",
      efficacy_eligible: true,
      reason_code: "BENCH_PRODUCT_TASK_TIMEOUT"
    });
    const disposition = appendMatchedBlockDisposition(
      fixture.store,
      fixture.block.block_id,
      "2026-07-16T08:02:00.000Z",
      "harness"
    );
    expect(disposition.disposition).toBe("complete");
    expect(fixture.store.listFormalAttempts(fixture.block.block_id)).toHaveLength(3);
    fixture.store.close();
  });

  it("classifies common infrastructure failure as an incomplete whole block", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertTerminalAttempt(fixture, "treatment", {
      executionStatus: "infrastructure_failed",
      infrastructureCode: "BENCH_PROVIDER_UNAVAILABLE"
    });
    insertOtherCompletedArms(fixture, "treatment");

    expect(assessMatchedBlock(fixture.store, fixture.block.block_id)).toMatchObject({
      disposition: "incomplete_infrastructure",
      reason_code: "BENCH_PROVIDER_UNAVAILABLE",
      affected_arms: ["treatment"],
      efficacy_eligible: false
    });
    fixture.store.close();
  });

  it("prioritizes contamination and operator abort into stable dispositions", () => {
    const contaminationRoot = createRoot();
    const contamination = createMatchedBlockHarnessStoreFixture({
      databasePath: join(contaminationRoot, "campaign.sqlite")
    });
    insertTerminalAttempt(contamination, "forced_holdout", {
      executionStatus: "invalid",
      infrastructureCode: "BENCH_ARM_CONTAMINATION_DETECTED"
    });
    insertTerminalAttempt(contamination, "treatment", {
      executionStatus: "cancelled",
      infrastructureCode: "BENCH_OPERATOR_CANCELLED"
    });
    insertTerminalAttempt(contamination, "no_ee");
    expect(assessMatchedBlock(contamination.store, contamination.block.block_id)).toMatchObject({
      disposition: "invalid_contamination",
      reason_code: "BENCH_ARM_CONTAMINATION_DETECTED"
    });
    contamination.store.close();

    const abortRoot = createRoot();
    const abort = createMatchedBlockHarnessStoreFixture({
      databasePath: join(abortRoot, "campaign.sqlite")
    });
    insertTerminalAttempt(abort, "no_ee", {
      executionStatus: "cancelled",
      infrastructureCode: "BENCH_OPERATOR_CANCELLED"
    });
    insertOtherCompletedArms(abort, "no_ee");
    expect(assessMatchedBlock(abort.store, abort.block.block_id)).toMatchObject({
      disposition: "aborted_operator",
      reason_code: "BENCH_OPERATOR_CANCELLED"
    });
    abort.store.close();
  });

  it("refuses disposition until all three formal attempts are terminal", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertTerminalAttempt(fixture, "treatment");
    expect(() => assessMatchedBlock(fixture.store, fixture.block.block_id)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_BLOCK_INCOMPLETE" })
    );
    fixture.store.close();
  });

  it("atomically creates a full replacement block and preserves original attempts", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    insertTerminalAttempt(fixture, "forced_holdout", {
      executionStatus: "harness_timed_out",
      infrastructureCode: "BENCH_HARNESS_TIMEOUT"
    });
    insertOtherCompletedArms(fixture, "forced_holdout");
    const replacement = createWholeBlockReplacement({
      store: fixture.store,
      originalBlockId: fixture.block.block_id,
      replacementBlockId: "block-harness-replacement-1",
      randomizationSeed: "replacement-seed-2",
      reasonCode: "BENCH_HARNESS_TIMEOUT",
      approvedBy: "benchmark-operator",
      createdAt: "2026-07-16T08:03:00.000Z"
    });

    expect(replacement.manifest).toMatchObject({
      replacement_for_block_id: fixture.block.block_id,
      replacement_generation: 1,
      scenario_id: fixture.block.scenario_id,
      scenario_version: fixture.block.scenario_version,
      repository_snapshot_digest: fixture.block.repository_snapshot_digest,
      task_input_digest: fixture.block.task_input_digest,
      candidate_corpus_digest: fixture.block.candidate_corpus_digest,
      host_model_identity_fingerprint: fixture.block.host_model_identity_fingerprint
    });
    expect(replacement.manifest.block_id).not.toBe(fixture.block.block_id);
    expect(replacement.manifest.randomization_seed).not.toBe(fixture.block.randomization_seed);
    expect(replacement.armPlans).toHaveLength(3);
    expect(new Set(replacement.armPlans.map((plan) => plan.arm))).toEqual(
      new Set(["treatment", "forced_holdout", "no_ee"])
    );
    expect(fixture.store.getBlockDisposition(fixture.block.block_id)).toMatchObject({
      disposition: "superseded_by_replacement",
      replacement_block_id: replacement.manifest.block_id
    });
    expect(fixture.store.getReplacementLineage(replacement.manifest.block_id)).toEqual(
      replacement.lineage
    );
    expect(fixture.store.listFormalAttempts(fixture.block.block_id)).toHaveLength(3);
    expect(fixture.store.listFormalAttempts(replacement.manifest.block_id)).toEqual([]);
    fixture.store.close();
  });

  it("forbids replacement of a valid complete block regardless of outcome", () => {
    const root = createRoot();
    const fixture = createMatchedBlockHarnessStoreFixture({
      databasePath: join(root, "campaign.sqlite")
    });
    for (const arm of fixture.block.planned_arm_order) {
      insertTerminalAttempt(fixture, arm, {
        taskOutcome: "failure",
        productRuntimeFailureCodes: arm === "treatment" ? ["EE_RETRIEVAL_FAILED"] : []
      });
    }
    expect(() => createWholeBlockReplacement({
      store: fixture.store,
      originalBlockId: fixture.block.block_id,
      replacementBlockId: "forbidden-replacement",
      randomizationSeed: "different-seed",
      reasonCode: "UNFAVORABLE_RESULT",
      approvedBy: "benchmark-operator",
      createdAt: "2026-07-16T08:04:00.000Z"
    })).toThrowError(expect.objectContaining<Partial<MatchedBlockFailureProtocolError>>({
      code: "BENCHMARK_REPLACEMENT_NOT_ALLOWED"
    }));
    expect(fixture.store.getBlockManifest("forbidden-replacement")).toBeUndefined();
    fixture.store.close();
  });
});
