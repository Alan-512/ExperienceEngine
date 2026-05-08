import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";
import type { TaskRun } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-task-run-repo-"));
  tempDirs.push(runtimeDir);
  const db = openDatabase(
    loadConfig({
      dataDir: runtimeDir,
      sqlitePath: join(runtimeDir, "experienceengine.db"),
      captureDir: join(runtimeDir, "captures")
    })
  );
  bootstrapDatabase(db);
  return db;
};

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const taskRun = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  id: "taskrun_auth_fix",
  host: "codex",
  scope_id: "scope_auth",
  session_id: "session_auth",
  task_type: "test_debug",
  task_summary: "Fix the failing auth vitest",
  prompt_excerpt: "Fix the auth spec and keep changes narrow.",
  context_summary: "Codex replay of a failing auth spec.",
  started_at: "2026-03-17T09:00:00.000Z",
  ended_at: "2026-03-17T09:05:00.000Z",
  final_status: "success",
  failure_signature: "Auth assertion mismatch",
  created_at: "2026-03-17T09:00:00.000Z",
  updated_at: "2026-03-17T09:05:00.000Z",
  ...overrides
});

describe("TaskRunRepository", () => {
  it("persists and reads task runs", () => {
    const db = makeDb();
    const repo = new TaskRunRepository(db);

    repo.upsert(taskRun());

    expect(repo.getById("taskrun_auth_fix")).toMatchObject({
      host: "codex",
      session_id: "session_auth",
      task_type: "test_debug",
      final_status: "success",
      failure_signature: "Auth assertion mismatch"
    });
    expect(repo.getLatestBySessionId("session_auth")?.id).toBe("taskrun_auth_fix");
  });

  it("persists learning capture status and reason", () => {
    const db = makeDb();
    const repo = new TaskRunRepository(db);

    repo.upsert(
      taskRun({
        learning_status: "rejected",
        learning_reason: "task stayed in expression-layer refinement"
      })
    );

    expect(repo.getById("taskrun_auth_fix")).toMatchObject({
      learning_status: "rejected",
      learning_reason: "task stayed in expression-layer refinement"
    });
  });
});
