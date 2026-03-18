import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { ExperienceRuntimeService } from "../../src/runtime/service.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-runtime-service-"));
  tempDirs.push(dir);
  return dir;
};

beforeEach(() => {
  setEmbeddingProviderForTests({
    provider: "local",
    model: "Xenova/multilingual-e5-small",
    version: "local-e5-v1",
    dimensions: 3,
    async embedQuery() {
      return [1, 0, 0];
    },
    async embedPassage() {
      return [1, 0, 0];
    }
  });
});

const seedStrategyNode = (sqlitePath: string, cwd: string, id: string): void => {
  const db = openDatabase(loadConfig({ sqlitePath }));
  bootstrapDatabase(db);
  const nodeRepo = new NodeRepository(db);
  const scope = resolveScope(cwd);
  const timestamp = nowIso();
  nodeRepo.upsert({
    id,
    node_type: "strategy",
    scope_id: scope.scope_id,
    task_type: "test_debug",
    trigger_pattern: "Fix the failing vitest auth test",
    applicability_notes: "Use the same repo and test scope",
    env_signature: undefined,
    compact_hint: "Run the failing vitest auth test before editing and verify after the fix.",
    goal: "Stabilize the failing vitest auth test",
    recommended_steps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
    avoid_steps: [],
    fallback_steps: [],
    success_signal: "The targeted vitest test passes",
    stop_condition: undefined,
    escalation_condition: undefined,
    evidence_summary: "Recovered the same vitest auth test in a prior task.",
    retrieval_text:
      "Fix the failing vitest auth test\nRun the failing vitest auth test before editing and verify after the fix.",
    source_kind: "system_derived",
    origin_record_ids: ["input_origin"],
    helped_record_ids: [],
    harmed_record_ids: [],
    state: "active",
    usage_count: 0,
    helped_count: 0,
    harmed_count: 0,
    support_count: 1,
    last_used_at: undefined,
    last_helped_at: undefined,
    last_harmed_at: undefined,
    created_at: timestamp,
    updated_at: timestamp
  });
};

afterEach(() => {
  clearEmbeddingProviderForTests();
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("ExperienceRuntimeService finalize transaction", () => {
  it("rolls back persisted state if finalize fails after writes begin", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures")
      })
    );

    await service.beforePromptBuild({
      sessionId: "txn-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });
    await service.persistToolResult({
      sessionId: "txn-session",
      toolName: "pnpm test",
      outputSummary: "auth tests passed",
      status: "success"
    });

    const originalPersistCandidates = (service as unknown as { persistCandidates: (input: unknown, originRecordId: string) => void })
      .persistCandidates;
    (service as unknown as { persistCandidates: (input: unknown, originRecordId: string) => void }).persistCandidates =
      () => {
        throw new Error("persist candidate failure");
      };

    await expect(
      service.finalizeTask({
        sessionId: "txn-session",
        cwd: "/repo",
        userMessage: "Fix the failing vitest auth test",
        taskSummary: "Fix the failing vitest auth test"
      })
    ).rejects.toThrow("persist candidate failure");

    (service as unknown as { persistCandidates: (input: unknown, originRecordId: string) => void }).persistCandidates =
      originalPersistCandidates;

    const db = new DatabaseSync(sqlitePath);
    const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };
    const statsCount = db.prepare("SELECT COUNT(*) AS count FROM scope_task_stats").get() as { count: number };
    const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };

    expect(inputCount.count).toBe(0);
    expect(statsCount.count).toBe(0);
    expect(nodeCount.count).toBe(0);
  });

  it("persists candidates and distillation jobs before promoting nodes asynchronously", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_scorecard");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        distillationAutoDrain: false,
        distillationAllowPassthrough: true
      })
    );

    await service.beforePromptBuild({
      sessionId: "candidate-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });
    await service.persistToolResult({
      sessionId: "candidate-session",
      toolName: "vitest",
      outputSummary: "Auth tests failed",
      status: "failure"
    });
    await service.persistToolResult({
      sessionId: "candidate-session",
      toolName: "vitest",
      outputSummary: "Auth tests passed",
      status: "success"
    });

    await service.finalizeTask({
      sessionId: "candidate-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    const db = new DatabaseSync(sqlitePath);
    const taskRunRow = db.prepare(
      "SELECT session_id, task_type, final_status, failure_signature FROM task_runs LIMIT 1"
    ).get() as {
      session_id: string | null;
      task_type: string;
      final_status: string;
      failure_signature: string | null;
    };
    const outcomeRow = db.prepare(
      "SELECT outcome_signal, failure_signature, summary FROM outcome_records LIMIT 1"
    ).get() as {
      outcome_signal: string;
      failure_signature: string | null;
      summary: string;
    };
    const candidateRow = db.prepare(
      "SELECT lifecycle_state, retry_count, task_run_id, candidate_kind, raw_summary, failure_signature FROM experience_candidates LIMIT 1"
    ).get() as {
      lifecycle_state: string;
      retry_count: number;
      task_run_id: string | null;
      candidate_kind: string | null;
      raw_summary: string | null;
      failure_signature: string | null;
    };
    const jobRow = db.prepare("SELECT status, extractor_profile FROM distillation_jobs LIMIT 1").get() as {
      status: string;
      extractor_profile: string;
    };
    const reviewRows = db
      .prepare("SELECT event_type, source, task_run_id FROM review_events ORDER BY created_at ASC")
      .all() as Array<{
      event_type: string;
      source: string;
      task_run_id: string | null;
    }>;
    const injectionRow = db.prepare(
      "SELECT session_id, task_summary, mode, scorecard_json, was_successful, harm_observed, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      session_id: string | null;
      task_summary: string;
      mode: string;
      scorecard_json: string | null;
      was_successful: number | null;
      harm_observed: number | null;
      attribution_reason: string | null;
    };
    const nodeCountBeforeDrain = db
      .prepare("SELECT COUNT(*) AS count FROM experience_nodes WHERE id != 'node_runtime_scorecard'")
      .get() as { count: number };

    expect(taskRunRow.session_id).toBe("candidate-session");
    expect(taskRunRow.task_type).toBe("test_debug");
    expect(taskRunRow.final_status).toBe("success");
    expect(taskRunRow.failure_signature).toBeTruthy();
    expect(outcomeRow.outcome_signal).toBe("success");
    expect(outcomeRow.failure_signature).toBeTruthy();
    expect(outcomeRow.summary).toContain("Fix the failing vitest auth test");
    expect(candidateRow.lifecycle_state).toBe("pending");
    expect(candidateRow.retry_count).toBe(0);
    expect(candidateRow.task_run_id).toBeTruthy();
    expect(candidateRow.candidate_kind).toBe("successful_fix");
    expect(candidateRow.raw_summary).toContain("Auth tests");
    expect(candidateRow.failure_signature).toBeTruthy();
    expect(jobRow.status).toBe("pending");
    expect(jobRow.extractor_profile).toBe("balanced");
    expect(reviewRows).toEqual([
      expect.objectContaining({
        event_type: "mark_helped",
        source: "automatic"
      })
    ]);
    expect(reviewRows[0]?.task_run_id).toBeTruthy();
    expect(injectionRow.session_id).toBe("candidate-session");
    expect(injectionRow.task_summary).toContain("Fix the failing vitest auth test");
    expect(injectionRow.mode).toBe("inject");
    expect(JSON.parse(injectionRow.scorecard_json ?? "{}")).toMatchObject({
      riskLevel: "low",
      nodes: [
        expect.objectContaining({
          riskLevel: "low",
          helped: 0,
          harmed: 0
        })
      ]
    });
    expect(injectionRow.was_successful).toBe(1);
    expect(injectionRow.harm_observed).toBe(0);
    expect(injectionRow.attribution_reason).toBe("success_outcome");
    expect(nodeCountBeforeDrain.count).toBe(0);

    await service.drainDistillationQueue();

    const distilledCandidate = db.prepare(
      "SELECT lifecycle_state, distilled_node_id FROM experience_candidates LIMIT 1"
    ).get() as {
      lifecycle_state: string;
      distilled_node_id: string | null;
    };
    const completedJob = db.prepare("SELECT status FROM distillation_jobs LIMIT 1").get() as { status: string };
    const nodeCountAfterDrain = db
      .prepare("SELECT COUNT(*) AS count FROM experience_nodes WHERE id != 'node_runtime_scorecard'")
      .get() as { count: number };

    expect(distilledCandidate.lifecycle_state).toBe("distilled");
    expect(distilledCandidate.distilled_node_id).toBeTruthy();
    expect(completedJob.status).toBe("succeeded");
    expect(nodeCountAfterDrain.count).toBe(1);
  });

  it("suppresses delivery in shadow mode but persists the evaluated intervention", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_shadow");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        evaluationMode: "shadow"
      })
    );

    const prompt = await service.beforePromptBuild({
      sessionId: "shadow-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    expect(prompt.mode).toBe("skip");
    expect(prompt.text).toBeUndefined();
    expect(prompt.notice).toBeUndefined();
    expect(prompt.scorecard?.mode).toBe("inject");

    await service.finalizeTask({
      sessionId: "shadow-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    const db = new DatabaseSync(sqlitePath);
    const injectionRow = db.prepare(
      "SELECT mode, delivery_mode, delivered, injected_node_ids_json, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      mode: string;
      delivery_mode: string;
      delivered: number;
      injected_node_ids_json: string;
      attribution_reason: string | null;
    };
    const latestRecord = db.prepare(
      "SELECT injected_node_ids_json FROM experience_input_records LIMIT 1"
    ).get() as { injected_node_ids_json: string };
    const reviewCount = db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as { count: number };

    expect(injectionRow.mode).toBe("inject");
    expect(injectionRow.delivery_mode).toBe("shadow");
    expect(injectionRow.delivered).toBe(0);
    expect(injectionRow.attribution_reason).toBe("suppressed_delivery");
    expect(JSON.parse(injectionRow.injected_node_ids_json)).toEqual(["node_runtime_shadow"]);
    expect(JSON.parse(latestRecord.injected_node_ids_json)).toEqual([]);
    expect(reviewCount.count).toBe(0);
  });

  it("suppresses delivery in holdout mode when the holdout bucket wins", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_holdout");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        evaluationMode: "holdout",
        holdoutRate: 1
      })
    );

    const prompt = await service.beforePromptBuild({
      sessionId: "holdout-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    expect(prompt.mode).toBe("skip");
    expect(prompt.text).toBeUndefined();
    expect(prompt.notice).toBeUndefined();
    expect(prompt.scorecard?.mode).toBe("inject");

    await service.finalizeTask({
      sessionId: "holdout-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    const db = new DatabaseSync(sqlitePath);
    const injectionRow = db.prepare(
      "SELECT delivery_mode, delivered, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      delivery_mode: string;
      delivered: number;
      attribution_reason: string | null;
    };
    const latestRecord = db.prepare(
      "SELECT injected_node_ids_json FROM experience_input_records LIMIT 1"
    ).get() as { injected_node_ids_json: string };
    const reviewCount = db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as { count: number };

    expect(injectionRow.delivery_mode).toBe("holdout");
    expect(injectionRow.delivered).toBe(0);
    expect(injectionRow.attribution_reason).toBe("suppressed_delivery");
    expect(JSON.parse(latestRecord.injected_node_ids_json)).toEqual([]);
    expect(reviewCount.count).toBe(0);
  });

  it("persists relevant failure attribution when injected guidance appears harmful", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_harm");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        distillationAutoDrain: false
      })
    );

    await service.beforePromptBuild({
      sessionId: "harm-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });
    await service.persistToolResult({
      sessionId: "harm-session",
      toolName: "vitest",
      outputSummary: "Fix the failing vitest auth test still fails with the same assertion",
      errorSignature: "Fix the failing vitest auth test still fails with the same assertion",
      status: "failure"
    });

    await service.finalizeTask({
      sessionId: "harm-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    const db = new DatabaseSync(sqlitePath);
    const injectionRow = db.prepare(
      "SELECT was_successful, harm_observed, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      was_successful: number | null;
      harm_observed: number | null;
      attribution_reason: string | null;
    };
    const reviewRows = db
      .prepare("SELECT event_type, source FROM review_events ORDER BY created_at ASC")
      .all() as Array<{ event_type: string; source: string }>;

    expect(injectionRow.was_successful).toBe(0);
    expect(injectionRow.harm_observed).toBe(1);
    expect(injectionRow.attribution_reason).toBe("relevant_failure");
    expect(reviewRows).toEqual([
      expect.objectContaining({
        event_type: "mark_harmed",
        source: "automatic"
      })
    ]);
  });
});
