import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { ExperienceRuntimeService } from "../../src/runtime/service.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-runtime-service-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
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
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        distillationAutoDrain: false
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
    const candidateRow = db.prepare("SELECT lifecycle_state, retry_count FROM experience_candidates LIMIT 1").get() as {
      lifecycle_state: string;
      retry_count: number;
    };
    const jobRow = db.prepare("SELECT status, extractor_profile FROM distillation_jobs LIMIT 1").get() as {
      status: string;
      extractor_profile: string;
    };
    const nodeCountBeforeDrain = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };

    expect(candidateRow.lifecycle_state).toBe("pending");
    expect(candidateRow.retry_count).toBe(0);
    expect(jobRow.status).toBe("pending");
    expect(jobRow.extractor_profile).toBe("balanced");
    expect(nodeCountBeforeDrain.count).toBe(0);

    await service.drainDistillationQueue();

    const distilledCandidate = db.prepare(
      "SELECT lifecycle_state, distilled_node_id FROM experience_candidates LIMIT 1"
    ).get() as {
      lifecycle_state: string;
      distilled_node_id: string | null;
    };
    const completedJob = db.prepare("SELECT status FROM distillation_jobs LIMIT 1").get() as { status: string };
    const nodeCountAfterDrain = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };

    expect(distilledCandidate.lifecycle_state).toBe("distilled");
    expect(distilledCandidate.distilled_node_id).toBeTruthy();
    expect(completedJob.status).toBe("succeeded");
    expect(nodeCountAfterDrain.count).toBe(1);
  });
});
