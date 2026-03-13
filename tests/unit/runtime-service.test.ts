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
});
