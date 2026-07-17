import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson } from "../../runtime/package/package-generation.js";
import {
  assertBenchmarkBlockDispositionRecord,
  assertBenchmarkCampaignManifest,
  assertBenchmarkFixtureManifest,
  assertBenchmarkFormalAttempt,
  assertBenchmarkGroundTruth,
  assertBenchmarkInstrumentationManifest,
  assertBenchmarkPreflightRecord,
  assertBenchmarkPublicationDecision,
  assertBenchmarkPublicationPlan,
  assertBenchmarkReplacementLineageRecord,
  assertBenchmarkRuntimeManifest,
  assertBenchmarkScenarioManifest,
  assertCompleteMatchedBlockArmPlans,
  assertMatchedBlockManifest
} from "./contract.js";
import { BENCHMARK_TABLE_NAMES } from "./constants.js";
import type {
  BenchmarkBlockDispositionRecord,
  BenchmarkCampaignManifest,
  BenchmarkFixtureManifest,
  BenchmarkFormalAttempt,
  BenchmarkGroundTruth,
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

export type MatchedBlockBenchmarkStoreErrorCode =
  | "BENCHMARK_RECORD_CONFLICT"
  | "BENCHMARK_REFERENCE_MISSING"
  | "BENCHMARK_REFERENCE_MISMATCH"
  | "BENCHMARK_ATTEMPT_ALREADY_EXISTS"
  | "BENCHMARK_ATTEMPT_CAS_LOST"
  | "BENCHMARK_IMMUTABILITY_VIOLATION";

export class MatchedBlockBenchmarkStoreError extends Error {
  constructor(
    readonly code: MatchedBlockBenchmarkStoreErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MatchedBlockBenchmarkStoreError";
  }
}
type JsonRow = { record_json: string };

const fail = (
  code: MatchedBlockBenchmarkStoreErrorCode,
  message: string
): never => {
  throw new MatchedBlockBenchmarkStoreError(code, message);
};

const parseRow = <T>(row: JsonRow | undefined): T | undefined =>
  row ? JSON.parse(row.record_json) as T : undefined;

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed|PRIMARY KEY/i.test(error.message);

const createSchema = (db: DatabaseSync): void => {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;

    CREATE TABLE IF NOT EXISTS benchmark_campaign_manifests (
      benchmark_campaign_id TEXT PRIMARY KEY,
      campaign_manifest_digest TEXT NOT NULL UNIQUE,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_scenario_manifests (
      scenario_id TEXT NOT NULL,
      scenario_version TEXT NOT NULL,
      scenario_digest TEXT NOT NULL UNIQUE,
      record_json TEXT NOT NULL,
      PRIMARY KEY (scenario_id, scenario_version)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_fixture_manifests (
      fixture_id TEXT PRIMARY KEY,
      fixture_version TEXT NOT NULL,
      fixture_digest TEXT NOT NULL UNIQUE,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_ground_truth_manifests (
      ground_truth_id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      scenario_version TEXT NOT NULL,
      ground_truth_digest TEXT NOT NULL UNIQUE,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_runtime_manifests (
      runtime_manifest_id TEXT PRIMARY KEY,
      runtime_manifest_digest TEXT NOT NULL UNIQUE,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_instrumentation_manifests (
      instrumentation_manifest_id TEXT PRIMARY KEY,
      instrumentation_manifest_digest TEXT NOT NULL UNIQUE,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_block_manifests (
      block_id TEXT PRIMARY KEY,
      benchmark_campaign_id TEXT NOT NULL,
      manifest_digest TEXT NOT NULL UNIQUE,
      replacement_for_block_id TEXT,
      replacement_generation INTEGER NOT NULL,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_arm_plans (
      block_id TEXT NOT NULL,
      arm TEXT NOT NULL,
      planned_ordinal INTEGER NOT NULL,
      manifest_digest TEXT NOT NULL,
      record_json TEXT NOT NULL,
      PRIMARY KEY (block_id, arm),
      UNIQUE (block_id, planned_ordinal)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_preflight_records (
      preflight_attempt_id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL,
      arm TEXT NOT NULL,
      preflight_stage TEXT NOT NULL,
      preflight_attempt_number INTEGER NOT NULL,
      record_json TEXT NOT NULL,
      UNIQUE (block_id, arm, preflight_stage, preflight_attempt_number)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_formal_attempts (
      block_id TEXT NOT NULL,
      arm TEXT NOT NULL,
      attempt_id TEXT NOT NULL UNIQUE,
      attempt_state_revision INTEGER NOT NULL,
      execution_status TEXT NOT NULL,
      record_json TEXT NOT NULL,
      PRIMARY KEY (block_id, arm)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_block_dispositions (
      block_id TEXT PRIMARY KEY,
      disposition TEXT NOT NULL,
      replacement_block_id TEXT,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_replacement_lineage (
      replacement_block_id TEXT PRIMARY KEY,
      original_block_id TEXT NOT NULL UNIQUE,
      replacement_generation INTEGER NOT NULL,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_publication_plans (
      benchmark_campaign_id TEXT PRIMARY KEY,
      publication_plan_digest TEXT NOT NULL UNIQUE,
      record_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS benchmark_publication_decisions (
      benchmark_campaign_id TEXT PRIMARY KEY,
      decision TEXT NOT NULL,
      record_json TEXT NOT NULL
    ) STRICT;
  `);
};

export class MatchedBlockBenchmarkStore {
  readonly databasePath: string;
  readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.databasePath = resolve(databasePath);
    mkdirSync(dirname(this.databasePath), { recursive: true });
    this.db = new DatabaseSync(this.databasePath);
    createSchema(this.db);
  }

  close(): void {
    this.db.close();
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private insertImmutable(
    sql: string,
    params: Record<string, string | number | null>,
    label: string
  ): void {
    try {
      this.db.prepare(sql).run(params);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        fail("BENCHMARK_RECORD_CONFLICT", `${label} already exists and is immutable.`);
      }
      throw error;
    }
  }

  private requireBlock(blockId: string): MatchedBlockManifest {
    const block = this.getBlockManifest(blockId);
    if (!block) {
      return fail("BENCHMARK_REFERENCE_MISSING", `Benchmark block ${blockId} does not exist.`);
    }
    return block;
  }

  private requireArmPlan(blockId: string, arm: MatchedBlockArm): MatchedBlockArmPlan {
    const plan = this.getArmPlan(blockId, arm);
    if (!plan) {
      return fail(
        "BENCHMARK_REFERENCE_MISSING",
        `Benchmark arm plan ${blockId}/${arm} does not exist.`
      );
    }
    return plan;
  }

  insertCampaignManifest(value: BenchmarkCampaignManifest): void {
    const record = assertBenchmarkCampaignManifest(value);
    this.insertImmutable(
      `INSERT INTO benchmark_campaign_manifests (
        benchmark_campaign_id, campaign_manifest_digest, record_json
      ) VALUES (@benchmark_campaign_id, @campaign_manifest_digest, @record_json)`,
      {
        benchmark_campaign_id: record.benchmark_campaign_id,
        campaign_manifest_digest: record.campaign_manifest_digest,
        record_json: canonicalJson(record)
      },
      "Benchmark campaign manifest"
    );
  }

  insertScenarioManifest(value: BenchmarkScenarioManifest): void {
    const record = assertBenchmarkScenarioManifest(value);
    this.insertImmutable(
      `INSERT INTO benchmark_scenario_manifests (
        scenario_id, scenario_version, scenario_digest, record_json
      ) VALUES (@scenario_id, @scenario_version, @scenario_digest, @record_json)`,
      {
        scenario_id: record.scenario_id,
        scenario_version: record.scenario_version,
        scenario_digest: record.scenario_digest,
        record_json: canonicalJson(record)
      },
      "Benchmark scenario manifest"
    );
  }

  insertFixtureManifest(value: BenchmarkFixtureManifest): void {
    const record = assertBenchmarkFixtureManifest(value);
    this.insertImmutable(
      `INSERT INTO benchmark_fixture_manifests (
        fixture_id, fixture_version, fixture_digest, record_json
      ) VALUES (@fixture_id, @fixture_version, @fixture_digest, @record_json)`,
      {
        fixture_id: record.fixture_id,
        fixture_version: record.fixture_version,
        fixture_digest: record.fixture_digest,
        record_json: canonicalJson(record)
      },
      "Benchmark fixture manifest"
    );
  }

  insertGroundTruth(value: BenchmarkGroundTruth): void {
    const record = assertBenchmarkGroundTruth(value);
    this.insertImmutable(
      `INSERT INTO benchmark_ground_truth_manifests (
        ground_truth_id, scenario_id, scenario_version, ground_truth_digest, record_json
      ) VALUES (
        @ground_truth_id, @scenario_id, @scenario_version, @ground_truth_digest, @record_json
      )`,
      {
        ground_truth_id: record.ground_truth_id,
        scenario_id: record.scenario_id,
        scenario_version: record.scenario_version,
        ground_truth_digest: record.ground_truth_digest,
        record_json: canonicalJson(record)
      },
      "Benchmark ground truth"
    );
  }

  insertRuntimeManifest(value: BenchmarkRuntimeManifest): void {
    const record = assertBenchmarkRuntimeManifest(value);
    this.insertImmutable(
      `INSERT INTO benchmark_runtime_manifests (
        runtime_manifest_id, runtime_manifest_digest, record_json
      ) VALUES (@runtime_manifest_id, @runtime_manifest_digest, @record_json)`,
      {
        runtime_manifest_id: record.runtime_manifest_id,
        runtime_manifest_digest: record.runtime_manifest_digest,
        record_json: canonicalJson(record)
      },
      "Benchmark runtime manifest"
    );
  }

  insertInstrumentationManifest(value: BenchmarkInstrumentationManifest): void {
    const record = assertBenchmarkInstrumentationManifest(value);
    this.insertImmutable(
      `INSERT INTO benchmark_instrumentation_manifests (
        instrumentation_manifest_id, instrumentation_manifest_digest, record_json
      ) VALUES (
        @instrumentation_manifest_id, @instrumentation_manifest_digest, @record_json
      )`,
      {
        instrumentation_manifest_id: record.instrumentation_manifest_id,
        instrumentation_manifest_digest: record.instrumentation_manifest_digest,
        record_json: canonicalJson(record)
      },
      "Benchmark instrumentation manifest"
    );
  }

  insertPublicationPlan(value: BenchmarkPublicationPlan): void {
    const record = assertBenchmarkPublicationPlan(value);
    if (!this.getCampaignManifest(record.benchmark_campaign_id)) {
      fail(
        "BENCHMARK_REFERENCE_MISSING",
        `Publication plan campaign ${record.benchmark_campaign_id} does not exist.`
      );
    }
    this.insertImmutable(
      `INSERT INTO benchmark_publication_plans (
        benchmark_campaign_id, publication_plan_digest, record_json
      ) VALUES (@benchmark_campaign_id, @publication_plan_digest, @record_json)`,
      {
        benchmark_campaign_id: record.benchmark_campaign_id,
        publication_plan_digest: record.publication_plan_digest,
        record_json: canonicalJson(record)
      },
      "Benchmark publication plan"
    );
  }

  insertSealedBlock(
    manifestValue: MatchedBlockManifest,
    armPlanValues: MatchedBlockArmPlan[]
  ): void {
    const manifest = assertMatchedBlockManifest(manifestValue);
    const plans = assertCompleteMatchedBlockArmPlans(armPlanValues);
    this.assertBlockReferences(manifest, plans);

    this.transaction(() => this.insertSealedBlockRows(manifest, plans));
  }

  private insertSealedBlockRows(
    manifest: MatchedBlockManifest,
    plans: MatchedBlockArmPlan[]
  ): void {
    this.insertImmutable(
        `INSERT INTO benchmark_block_manifests (
          block_id, benchmark_campaign_id, manifest_digest,
          replacement_for_block_id, replacement_generation, record_json
        ) VALUES (
          @block_id, @benchmark_campaign_id, @manifest_digest,
          @replacement_for_block_id, @replacement_generation, @record_json
        )`,
        {
          block_id: manifest.block_id,
          benchmark_campaign_id: manifest.benchmark_campaign_id,
          manifest_digest: manifest.manifest_digest,
          replacement_for_block_id: manifest.replacement_for_block_id,
          replacement_generation: manifest.replacement_generation,
          record_json: canonicalJson(manifest)
        },
        "Matched-block manifest"
    );

    for (const plan of plans) {
      this.insertImmutable(
          `INSERT INTO benchmark_arm_plans (
            block_id, arm, planned_ordinal, manifest_digest, record_json
          ) VALUES (
            @block_id, @arm, @planned_ordinal, @manifest_digest, @record_json
          )`,
          {
            block_id: plan.block_id,
            arm: plan.arm,
            planned_ordinal: plan.planned_ordinal,
            manifest_digest: plan.manifest_digest,
            record_json: canonicalJson(plan)
          },
          "Matched-block arm plan"
      );
    }
  }

  insertReplacementBlock(
    manifestValue: MatchedBlockManifest,
    armPlanValues: MatchedBlockArmPlan[],
    dispositionValue: BenchmarkBlockDispositionRecord,
    lineageValue: BenchmarkReplacementLineageRecord
  ): void {
    const manifest = assertMatchedBlockManifest(manifestValue);
    const plans = assertCompleteMatchedBlockArmPlans(armPlanValues);
    const disposition = assertBenchmarkBlockDispositionRecord(dispositionValue);
    const lineage = assertBenchmarkReplacementLineageRecord(lineageValue);
    this.assertBlockReferences(manifest, plans);
    if (
      manifest.replacement_for_block_id === null ||
      disposition.block_id !== manifest.replacement_for_block_id ||
      disposition.disposition !== "superseded_by_replacement" ||
      disposition.replacement_block_id !== manifest.block_id ||
      lineage.original_block_id !== manifest.replacement_for_block_id ||
      lineage.replacement_block_id !== manifest.block_id ||
      lineage.replacement_manifest_digest !== manifest.manifest_digest ||
      lineage.replacement_generation !== manifest.replacement_generation
    ) {
      fail(
        "BENCHMARK_REFERENCE_MISMATCH",
        "Atomic replacement records do not describe one complete replacement transition."
      );
    }
    this.transaction(() => {
      this.insertSealedBlockRows(manifest, plans);
      this.appendBlockDisposition(disposition);
      this.appendReplacementLineage(lineage);
    });
  }

  private assertBlockReferences(
    manifest: MatchedBlockManifest,
    plans: MatchedBlockArmPlan[]
  ): void {
    const campaign = this.getCampaignManifest(manifest.benchmark_campaign_id) ??
      fail(
        "BENCHMARK_REFERENCE_MISSING",
        `Benchmark campaign ${manifest.benchmark_campaign_id} does not exist.`
      );
    const scenario = this.getScenarioManifest(manifest.scenario_id, manifest.scenario_version) ??
      fail("BENCHMARK_REFERENCE_MISSING", "Benchmark scenario manifest does not exist.");
    const fixture = this.getFixtureManifest(manifest.fixture_id) ??
      fail("BENCHMARK_REFERENCE_MISSING", "Benchmark fixture manifest does not exist.");
    const groundTruth = this.getGroundTruth(manifest.ground_truth_id) ??
      fail("BENCHMARK_REFERENCE_MISSING", "Benchmark ground truth does not exist.");
    const runtime = this.getRuntimeManifest(manifest.runtime_manifest_id) ??
      fail("BENCHMARK_REFERENCE_MISSING", "Benchmark runtime manifest does not exist.");
    const instrumentation = this.getInstrumentationManifest(
      manifest.instrumentation_manifest_id
    ) ?? fail(
      "BENCHMARK_REFERENCE_MISSING",
      "Benchmark instrumentation manifest does not exist."
    );
    const referenceChecks: Array<[boolean, string]> = [
      [campaign.benchmark_protocol_version === manifest.benchmark_protocol_version, "benchmark_protocol_version"],
      [campaign.scenario_set_digest === manifest.scenario_set_digest, "scenario_set_digest"],
      [campaign.analysis_plan_digest === manifest.analysis_plan_digest, "analysis_plan_digest"],
      [campaign.exclusion_policy_version === manifest.exclusion_policy_version, "exclusion_policy_version"],
      [campaign.replacement_policy_version === manifest.replacement_policy_version, "replacement_policy_version"],
      [scenario.scenario_digest === manifest.scenario_digest, "scenario_digest"],
      [scenario.task_input_digest === manifest.task_input_digest, "task_input_digest"],
      [scenario.ground_truth_id === manifest.ground_truth_id, "ground_truth_id"],
      [groundTruth.ground_truth_digest === scenario.ground_truth_digest, "ground_truth_digest"],
      [fixture.repository_snapshot_digest === manifest.repository_snapshot_digest, "repository_snapshot_digest"],
      [fixture.candidate_corpus_digest === manifest.candidate_corpus_digest, "candidate_corpus_digest"],
      [runtime.profile_registry_digest === manifest.benchmark_profile_registry_digest, "benchmark_profile_registry_digest"],
      [runtime.benchmark_evidence_target_id === manifest.benchmark_evidence_target_id, "benchmark_evidence_target_id"],
      [runtime.host_identity === manifest.host_identity, "host_identity"],
      [runtime.host_model_provider === manifest.host_model_provider, "host_model_provider"],
      [runtime.host_model_identity_fingerprint === manifest.host_model_identity_fingerprint, "host_model_identity_fingerprint"],
      [runtime.host_model_parameters_digest === manifest.host_model_parameters_digest, "host_model_parameters_digest"],
      [instrumentation.harness_version === manifest.harness_version, "harness_version"],
      [instrumentation.transcript_adapter_version === manifest.transcript_adapter_version, "transcript_adapter_version"],
      [instrumentation.scorer_version === manifest.scorer_version, "scorer_version"],
      [instrumentation.network_retry_policy_version === manifest.network_retry_policy_version, "network_retry_policy_version"]
    ];
    const mismatch = referenceChecks.find(([matches]) => !matches);
    if (mismatch) {
      fail(
        "BENCHMARK_REFERENCE_MISMATCH",
        `Sealed block reference ${mismatch[1]} does not match its immutable manifest.`
      );
    }

    for (const plan of plans) {
      if (
        plan.benchmark_campaign_id !== manifest.benchmark_campaign_id ||
        plan.block_id !== manifest.block_id ||
        plan.manifest_digest !== manifest.manifest_digest ||
        manifest.planned_arm_order[plan.planned_ordinal - 1] !== plan.arm
      ) {
        fail(
          "BENCHMARK_REFERENCE_MISMATCH",
          "Matched-block arm plans do not match the sealed block identity and arm order."
        );
      }
    }
  }

  appendPreflightRecord(value: BenchmarkPreflightRecord): void {
    const record = assertBenchmarkPreflightRecord(value);
    const block = this.requireBlock(record.block_id);
    this.requireArmPlan(record.block_id, record.arm);
    if (
      block.benchmark_campaign_id !== record.benchmark_campaign_id ||
      block.manifest_digest !== record.manifest_digest
    ) {
      fail("BENCHMARK_REFERENCE_MISMATCH", "Preflight record does not match its sealed block.");
    }
    if (this.getFormalAttempt(record.block_id, record.arm)) {
      fail(
        "BENCHMARK_IMMUTABILITY_VIOLATION",
        "Preflight evidence cannot be appended after the formal arm start boundary."
      );
    }
    this.insertImmutable(
      `INSERT INTO benchmark_preflight_records (
        preflight_attempt_id, block_id, arm, preflight_stage,
        preflight_attempt_number, record_json
      ) VALUES (
        @preflight_attempt_id, @block_id, @arm, @preflight_stage,
        @preflight_attempt_number, @record_json
      )`,
      {
        preflight_attempt_id: record.preflight_attempt_id,
        block_id: record.block_id,
        arm: record.arm,
        preflight_stage: record.preflight_stage,
        preflight_attempt_number: record.preflight_attempt_number,
        record_json: canonicalJson(record)
      },
      "Benchmark preflight record"
    );
  }

  startFormalAttempt(value: BenchmarkFormalAttempt): void {
    const record = assertBenchmarkFormalAttempt(value);
    if (record.execution_status !== "running") {
      fail("BENCHMARK_IMMUTABILITY_VIOLATION", "Formal attempts must start in running state.");
    }
    const block = this.requireBlock(record.block_id);
    const plan = this.requireArmPlan(record.block_id, record.arm);
    if (
      block.benchmark_campaign_id !== record.benchmark_campaign_id ||
      block.manifest_digest !== record.manifest_digest ||
      plan.planned_ordinal !== record.planned_ordinal
    ) {
      fail("BENCHMARK_REFERENCE_MISMATCH", "Formal attempt does not match its sealed arm plan.");
    }
    try {
      this.db.prepare(`INSERT INTO benchmark_formal_attempts (
        block_id, arm, attempt_id, attempt_state_revision, execution_status, record_json
      ) VALUES (
        @block_id, @arm, @attempt_id, @attempt_state_revision, @execution_status, @record_json
      )`).run({
        block_id: record.block_id,
        arm: record.arm,
        attempt_id: record.attempt_id,
        attempt_state_revision: record.attempt_state_revision,
        execution_status: record.execution_status,
        record_json: canonicalJson(record)
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        fail(
          "BENCHMARK_ATTEMPT_ALREADY_EXISTS",
          `Formal attempt authority already exists for ${record.block_id}/${record.arm}.`
        );
      }
      throw error;
    }
  }

  terminalizeFormalAttempt(
    expectedRevision: number,
    value: BenchmarkFormalAttempt
  ): void {
    const terminal = assertBenchmarkFormalAttempt(value);
    if (terminal.execution_status === "running") {
      fail("BENCHMARK_IMMUTABILITY_VIOLATION", "Terminal transition cannot retain running state.");
    }
    const current = this.getFormalAttempt(terminal.block_id, terminal.arm) ??
      fail("BENCHMARK_REFERENCE_MISSING", "Formal attempt authority row does not exist.");
    const immutableIdentity = [
      "benchmark_campaign_id",
      "block_id",
      "manifest_digest",
      "arm",
      "attempt_id",
      "attempt_number",
      "planned_ordinal",
      "started_at"
    ] as const;
    for (const field of immutableIdentity) {
      if (current[field] !== terminal[field]) {
        fail(
          "BENCHMARK_IMMUTABILITY_VIOLATION",
          `Formal attempt immutable field ${field} changed during terminalization.`
        );
      }
    }
    if (
      current.execution_status !== "running" ||
      current.attempt_state_revision !== expectedRevision ||
      terminal.attempt_state_revision !== expectedRevision + 1
    ) {
      fail("BENCHMARK_ATTEMPT_CAS_LOST", "Formal attempt terminal CAS precondition failed.");
    }
    const result = this.db.prepare(`UPDATE benchmark_formal_attempts
      SET attempt_state_revision = @next_revision,
          execution_status = @execution_status,
          record_json = @record_json
      WHERE block_id = @block_id
        AND arm = @arm
        AND attempt_state_revision = @expected_revision
        AND execution_status = 'running'`).run({
      next_revision: terminal.attempt_state_revision,
      execution_status: terminal.execution_status,
      record_json: canonicalJson(terminal),
      block_id: terminal.block_id,
      arm: terminal.arm,
      expected_revision: expectedRevision
    });
    if (Number(result.changes) !== 1) {
      fail("BENCHMARK_ATTEMPT_CAS_LOST", "Formal attempt terminal CAS update lost authority.");
    }
  }

  appendBlockDisposition(value: BenchmarkBlockDispositionRecord): void {
    const record = assertBenchmarkBlockDispositionRecord(value);
    const block = this.requireBlock(record.block_id);
    if (
      block.benchmark_campaign_id !== record.benchmark_campaign_id ||
      block.manifest_digest !== record.manifest_digest
    ) {
      fail("BENCHMARK_REFERENCE_MISMATCH", "Block disposition does not match its manifest.");
    }
    if (record.replacement_block_id && !this.getBlockManifest(record.replacement_block_id)) {
      fail("BENCHMARK_REFERENCE_MISSING", "Disposition replacement block does not exist.");
    }
    this.insertImmutable(
      `INSERT INTO benchmark_block_dispositions (
        block_id, disposition, replacement_block_id, record_json
      ) VALUES (@block_id, @disposition, @replacement_block_id, @record_json)`,
      {
        block_id: record.block_id,
        disposition: record.disposition,
        replacement_block_id: record.replacement_block_id,
        record_json: canonicalJson(record)
      },
      "Benchmark block disposition"
    );
  }

  appendReplacementLineage(value: BenchmarkReplacementLineageRecord): void {
    const record = assertBenchmarkReplacementLineageRecord(value);
    const original = this.requireBlock(record.original_block_id);
    const replacement = this.requireBlock(record.replacement_block_id);
    const disposition = this.getBlockDisposition(record.original_block_id);
    if (
      original.benchmark_campaign_id !== record.benchmark_campaign_id ||
      replacement.benchmark_campaign_id !== record.benchmark_campaign_id ||
      original.manifest_digest !== record.original_manifest_digest ||
      replacement.manifest_digest !== record.replacement_manifest_digest ||
      replacement.replacement_for_block_id !== original.block_id ||
      replacement.replacement_generation !== record.replacement_generation
    ) {
      fail("BENCHMARK_REFERENCE_MISMATCH", "Replacement lineage does not match block manifests.");
    }
    if (
      disposition?.disposition !== "superseded_by_replacement" ||
      disposition.replacement_block_id !== replacement.block_id
    ) {
      fail(
        "BENCHMARK_REFERENCE_MISMATCH",
        "Replacement lineage requires a matching superseded disposition."
      );
    }
    this.insertImmutable(
      `INSERT INTO benchmark_replacement_lineage (
        replacement_block_id, original_block_id, replacement_generation, record_json
      ) VALUES (
        @replacement_block_id, @original_block_id, @replacement_generation, @record_json
      )`,
      {
        replacement_block_id: record.replacement_block_id,
        original_block_id: record.original_block_id,
        replacement_generation: record.replacement_generation,
        record_json: canonicalJson(record)
      },
      "Benchmark replacement lineage"
    );
  }

  insertPublicationDecision(value: BenchmarkPublicationDecision): void {
    const record = assertBenchmarkPublicationDecision(value);
    const plan = this.getPublicationPlan(record.benchmark_campaign_id);
    if (!plan || plan.publication_plan_digest !== record.publication_plan_digest) {
      fail("BENCHMARK_REFERENCE_MISSING", "Publication decision has no matching sealed plan.");
    }
    this.insertImmutable(
      `INSERT INTO benchmark_publication_decisions (
        benchmark_campaign_id, decision, record_json
      ) VALUES (@benchmark_campaign_id, @decision, @record_json)`,
      {
        benchmark_campaign_id: record.benchmark_campaign_id,
        decision: record.decision,
        record_json: canonicalJson(record)
      },
      "Benchmark publication decision"
    );
  }

  getCampaignManifest(campaignId: string): BenchmarkCampaignManifest | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_campaign_manifests WHERE benchmark_campaign_id = ?"
    ).get(campaignId) as JsonRow | undefined);
  }

  getScenarioManifest(
    scenarioId: string,
    scenarioVersion: string
  ): BenchmarkScenarioManifest | undefined {
    return parseRow(this.db.prepare(
      `SELECT record_json FROM benchmark_scenario_manifests
       WHERE scenario_id = ? AND scenario_version = ?`
    ).get(scenarioId, scenarioVersion) as JsonRow | undefined);
  }

  getFixtureManifest(fixtureId: string): BenchmarkFixtureManifest | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_fixture_manifests WHERE fixture_id = ?"
    ).get(fixtureId) as JsonRow | undefined);
  }

  getGroundTruth(groundTruthId: string): BenchmarkGroundTruth | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_ground_truth_manifests WHERE ground_truth_id = ?"
    ).get(groundTruthId) as JsonRow | undefined);
  }

  getRuntimeManifest(runtimeManifestId: string): BenchmarkRuntimeManifest | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_runtime_manifests WHERE runtime_manifest_id = ?"
    ).get(runtimeManifestId) as JsonRow | undefined);
  }

  getInstrumentationManifest(
    instrumentationManifestId: string
  ): BenchmarkInstrumentationManifest | undefined {
    return parseRow(this.db.prepare(
      `SELECT record_json FROM benchmark_instrumentation_manifests
       WHERE instrumentation_manifest_id = ?`
    ).get(instrumentationManifestId) as JsonRow | undefined);
  }

  getBlockManifest(blockId: string): MatchedBlockManifest | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_block_manifests WHERE block_id = ?"
    ).get(blockId) as JsonRow | undefined);
  }

  listBlockManifests(campaignId: string): MatchedBlockManifest[] {
    return (this.db.prepare(
      `SELECT record_json FROM benchmark_block_manifests
       WHERE benchmark_campaign_id = ? ORDER BY block_id`
    ).all(campaignId) as JsonRow[]).map(
      (row) => JSON.parse(row.record_json) as MatchedBlockManifest
    );
  }

  getArmPlan(blockId: string, arm: MatchedBlockArm): MatchedBlockArmPlan | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_arm_plans WHERE block_id = ? AND arm = ?"
    ).get(blockId, arm) as JsonRow | undefined);
  }

  listArmPlans(blockId: string): MatchedBlockArmPlan[] {
    return (this.db.prepare(
      "SELECT record_json FROM benchmark_arm_plans WHERE block_id = ? ORDER BY planned_ordinal"
    ).all(blockId) as JsonRow[]).map((row) => JSON.parse(row.record_json) as MatchedBlockArmPlan);
  }

  listPreflightRecords(blockId: string, arm: MatchedBlockArm): BenchmarkPreflightRecord[] {
    return (this.db.prepare(
      `SELECT record_json FROM benchmark_preflight_records
       WHERE block_id = ? AND arm = ?
       ORDER BY preflight_attempt_number, preflight_stage`
    ).all(blockId, arm) as JsonRow[]).map(
      (row) => JSON.parse(row.record_json) as BenchmarkPreflightRecord
    );
  }

  getFormalAttempt(blockId: string, arm: MatchedBlockArm): BenchmarkFormalAttempt | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_formal_attempts WHERE block_id = ? AND arm = ?"
    ).get(blockId, arm) as JsonRow | undefined);
  }

  listFormalAttempts(blockId: string): BenchmarkFormalAttempt[] {
    return (this.db.prepare(
      `SELECT record_json FROM benchmark_formal_attempts
       WHERE block_id = ? ORDER BY arm`
    ).all(blockId) as JsonRow[]).map(
      (row) => JSON.parse(row.record_json) as BenchmarkFormalAttempt
    );
  }

  listCampaignFormalAttempts(campaignId: string): BenchmarkFormalAttempt[] {
    return (this.db.prepare(
      `SELECT attempts.record_json
       FROM benchmark_formal_attempts AS attempts
       INNER JOIN benchmark_block_manifests AS blocks
         ON blocks.block_id = attempts.block_id
       WHERE blocks.benchmark_campaign_id = ?
       ORDER BY attempts.block_id, attempts.arm`
    ).all(campaignId) as JsonRow[]).map(
      (row) => JSON.parse(row.record_json) as BenchmarkFormalAttempt
    );
  }

  getBlockDisposition(blockId: string): BenchmarkBlockDispositionRecord | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_block_dispositions WHERE block_id = ?"
    ).get(blockId) as JsonRow | undefined);
  }

  getReplacementLineage(
    replacementBlockId: string
  ): BenchmarkReplacementLineageRecord | undefined {
    return parseRow(this.db.prepare(
      `SELECT record_json FROM benchmark_replacement_lineage
       WHERE replacement_block_id = ?`
    ).get(replacementBlockId) as JsonRow | undefined);
  }

  getPublicationPlan(campaignId: string): BenchmarkPublicationPlan | undefined {
    return parseRow(this.db.prepare(
      "SELECT record_json FROM benchmark_publication_plans WHERE benchmark_campaign_id = ?"
    ).get(campaignId) as JsonRow | undefined);
  }

  getPublicationDecision(campaignId: string): BenchmarkPublicationDecision | undefined {
    return parseRow(this.db.prepare(
      `SELECT record_json FROM benchmark_publication_decisions
       WHERE benchmark_campaign_id = ?`
    ).get(campaignId) as JsonRow | undefined);
  }

  listOwnedTableNames(): string[] {
    const rows = this.db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name LIKE 'benchmark_%'
       ORDER BY name`
    ).all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  assertOwnsOnlyBenchmarkTables(): void {
    const observed = (this.db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    ).all() as Array<{ name: string }>).map((row) => row.name).sort();
    const expected = [...BENCHMARK_TABLE_NAMES].sort();
    if (canonicalJson(observed) !== canonicalJson(expected)) {
      fail(
        "BENCHMARK_IMMUTABILITY_VIOLATION",
        "Benchmark campaign database table ownership is incomplete or contaminated."
      );
    }
  }
}
