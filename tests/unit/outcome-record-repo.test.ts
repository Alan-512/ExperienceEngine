import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { OutcomeRecordRepository } from "../../src/store/sqlite/repositories/outcome-record-repo.js";
import type { OutcomeRecord } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-outcome-record-repo-"));
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
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const outcomeRecord = (overrides: Partial<OutcomeRecord> = {}): OutcomeRecord => ({
  id: "outcome_auth_fix",
  task_run_id: "taskrun_auth_fix",
  outcome_signal: "success",
  failure_signature: "Auth assertion mismatch",
  summary: "Auth vitest passes after the narrow fix.",
  created_at: "2026-03-17T09:05:00.000Z",
  ...overrides
});

describe("OutcomeRecordRepository", () => {
  it("persists and lists outcome records by task run", () => {
    const db = makeDb();
    const repo = new OutcomeRecordRepository(db);

    repo.upsert(outcomeRecord());

    expect(repo.getById("outcome_auth_fix")).toMatchObject({
      task_run_id: "taskrun_auth_fix",
      outcome_signal: "success",
      summary: "Auth vitest passes after the narrow fix."
    });
    expect(repo.listByTaskRunId("taskrun_auth_fix")).toHaveLength(1);
  });
});
