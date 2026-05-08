import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { AttributionRecordRepository } from "../../src/store/sqlite/repositories/attribution-record-repo.js";
import type { AttributionRecord } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-attribution-record-repo-"));
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

const attributionRecord = (overrides: Partial<AttributionRecord> = {}): AttributionRecord => ({
  id: "attr_auth_fix_node",
  injection_id: "inject_auth_fix",
  node_id: "node_auth_fix",
  intervention_strength: "soft_recommendation",
  injection_mode: "inject_conservative",
  delivery_mode: "live",
  delivered: true,
  outcome: "success",
  attribution_verdict: "weak_helped",
  confidence: "medium",
  evidence_refs: ["input_auth_fix", "taskrun_auth_fix"],
  source: "automatic",
  attribution_reason: "success_outcome",
  created_at: "2026-05-04T10:00:00.000Z",
  resolved_at: "2026-05-04T10:01:00.000Z",
  ...overrides
});

describe("AttributionRecordRepository", () => {
  it("persists attribution records and round-trips evidence references", () => {
    const repo = new AttributionRecordRepository(makeDb());

    repo.insert(attributionRecord());

    expect(repo.getById("attr_auth_fix_node")).toMatchObject({
      injection_id: "inject_auth_fix",
      node_id: "node_auth_fix",
      delivered: true,
      attribution_verdict: "weak_helped",
      evidence_refs: ["input_auth_fix", "taskrun_auth_fix"]
    });
    expect(repo.listByInjectionId("inject_auth_fix")).toHaveLength(1);
    expect(repo.listByNodeId("node_auth_fix")).toHaveLength(1);
    expect(repo.countByVerdict("weak_helped")).toBe(1);
  });

  it("keeps inserts idempotent by record id without mutating append-only evidence", () => {
    const repo = new AttributionRecordRepository(makeDb());

    repo.insert(attributionRecord());
    repo.insert(attributionRecord({ attribution_verdict: "strong_harmed", evidence_refs: ["mutated"] }));

    expect(repo.getById("attr_auth_fix_node")).toMatchObject({
      attribution_verdict: "weak_helped",
      evidence_refs: ["input_auth_fix", "taskrun_auth_fix"]
    });
    expect(repo.listByNodeId("node_auth_fix")).toHaveLength(1);
  });

  it("supports manual override records without injection context", () => {
    const repo = new AttributionRecordRepository(makeDb());

    repo.insert(
      attributionRecord({
        id: "attr_manual_node",
        injection_id: undefined,
        delivered: false,
        outcome: "unknown",
        attribution_verdict: "strong_harmed",
        confidence: "high",
        evidence_refs: ["manual:node_auth_fix"],
        user_override: "harmed",
        source: "manual_override",
        attribution_reason: "manual_override"
      })
    );

    expect(repo.getById("attr_manual_node")).toMatchObject({
      injection_id: undefined,
      user_override: "harmed",
      source: "manual_override"
    });
    expect(repo.countByVerdict("strong_harmed")).toBe(1);
  });
});
