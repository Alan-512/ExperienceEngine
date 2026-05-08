import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import type { ReviewEvent } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-review-event-repo-"));
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

const reviewEvent = (overrides: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: "review_auth_fix_helped",
  node_id: "node_auth_fix",
  task_run_id: "taskrun_auth_fix",
  event_type: "mark_helped",
  source: "user",
  created_at: "2026-03-17T09:06:00.000Z",
  ...overrides
});

describe("ReviewEventRepository", () => {
  it("persists explicit governance events", () => {
    const db = makeDb();
    const repo = new ReviewEventRepository(db);

    repo.upsert(reviewEvent());
    repo.upsert(
      reviewEvent({
        id: "review_auth_fix_harmed",
        event_type: "mark_harmed",
        source: "automatic"
      })
    );

    expect(repo.getById("review_auth_fix_helped")).toMatchObject({
      node_id: "node_auth_fix",
      event_type: "mark_helped",
      source: "user"
    });
    expect(repo.listByNodeId("node_auth_fix")).toHaveLength(2);
  });
});
