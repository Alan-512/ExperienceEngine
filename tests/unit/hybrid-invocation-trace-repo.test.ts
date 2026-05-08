import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import { HybridInvocationTraceRepository } from "../../src/store/sqlite/repositories/hybrid-invocation-trace-repo.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-hybrid-trace-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

describe("HybridInvocationTraceRepository", () => {
  it("persists and re-reads structured hybrid invocation traces", () => {
    const runtimeDir = makeTempDir();
    const db = new DatabaseSync(join(runtimeDir, "experienceengine.db"));
    bootstrapDatabase(db);
    const repo = new HybridInvocationTraceRepository(db);

    repo.upsert({
      id: "trace_1",
      surface: "interaction",
      session_id: "session_1",
      scope_id: "scope_repo",
      worker_task: "explain_decision",
      route: "ESCALATE_SYNC_EXPLAIN",
      route_policy_version: "hybrid-phase1-v1",
      capsule_schema_version: "hybrid-capsule-v1",
      worker_profile_version: "hybrid-explain-v1",
      rollout_mode: "shadow",
      rollout_reason: "shadow",
      worker_ran: true,
      validation_status: "accepted",
      output_action: "none",
      created_at: "2026-03-30T00:00:00.000Z"
    });

    const traces = repo.listBySessionId("session_1");
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      surface: "interaction",
      route: "ESCALATE_SYNC_EXPLAIN",
      output_action: "none"
    });
  });
});
