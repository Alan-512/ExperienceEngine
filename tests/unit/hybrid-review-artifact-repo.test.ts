import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import { HybridReviewArtifactRepository } from "../../src/store/sqlite/repositories/hybrid-review-artifact-repo.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-hybrid-artifact-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

describe("HybridReviewArtifactRepository", () => {
  it("persists and re-reads a phase-1 postmortem review artifact", () => {
    const runtimeDir = makeTempDir();
    const db = new DatabaseSync(join(runtimeDir, "experienceengine.db"));
    bootstrapDatabase(db);
    const repo = new HybridReviewArtifactRepository(db);

    repo.upsert({
      id: "artifact_1",
      task_run_id: "taskrun_1",
      scope_id: "scope_repo",
      worker_task: "postmortem_review",
      approval_class: "review_artifact",
      schema_version: "hybrid-capsule-v1",
      route_policy_version: "hybrid-phase1-v1",
      worker_profile_version: "hybrid-postmortem-v1",
      recommendation: "capture",
      summary: "The run produced a reusable correction after the first path failed.",
      payload: { reviewNotes: ["keep as non-authoritative"] },
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:00:00.000Z"
    });

    expect(repo.getByTaskRunId("taskrun_1")).toMatchObject({
      task_run_id: "taskrun_1",
      worker_task: "postmortem_review",
      approval_class: "review_artifact",
      recommendation: "capture"
    });
    expect(repo.count()).toBe(1);
  });
});
