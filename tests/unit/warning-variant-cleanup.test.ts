import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import {
  canonicalWarningHint,
  cleanupHistoricalWarningVariants
} from "../../src/maintenance/warning-variant-cleanup.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";
import { stableId } from "../../src/utils/ids.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-warning-cleanup-"));
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

const warningNode = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_default",
  node_type: "warning",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing vitest auth test in the current workspace.",
  compact_hint: canonicalWarningHint,
  success_signal: "A narrowed reproduction or a different evidence-backed fix path is identified.",
  evidence_summary: "Failure evidence captured from exec.",
  retrieval_text: "Fix the failing vitest auth test in the current workspace.\nDo not keep iterating on the current debug path without narrowing the failing signature first.",
  source_kind: "system_derived",
  origin_record_ids: [],
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
  created_at: "2026-03-12T02:00:00.000Z",
  updated_at: "2026-03-12T02:00:00.000Z",
  ...overrides
});

describe("cleanupHistoricalWarningVariants", () => {
  it("merges historical warning variants into the canonical warning node and retires duplicates", () => {
    const db = makeDb();
    const repo = new NodeRepository(db);
    const canonicalId = stableId("node", ["scope_1", "test_debug", "warning", canonicalWarningHint].join(":"));

    repo.upsert(
      warningNode({
        id: canonicalId,
        compact_hint: canonicalWarningHint,
        trigger_pattern:
          "Execution hints from prior similar tasks: - Reproduce first, then validate the fix with exec before moving on. [Thu 2026-03-12 09:24 GMT+8] Fix the failing vitest auth test. Start...",
        usage_count: 2,
        helped_count: 2,
        support_count: 4
      })
    );
    repo.upsert(
      warningNode({
        id: "node_befe50883ab5",
        compact_hint: "Do not keep iterating on read without narrowing the failing signature first.",
        evidence_summary: "Failure evidence captured from read.",
        usage_count: 0,
        helped_count: 0,
        support_count: 2,
        updated_at: "2026-03-12T02:32:58.817Z"
      })
    );
    repo.upsert(
      warningNode({
        id: "node_2c955ffb1982",
        compact_hint: "Do not keep iterating on process without narrowing the failing signature first.",
        trigger_pattern:
          "Execution hints from prior similar tasks: - Reproduce first, then validate the fix with exec before moving on. [Thu 2026-03-12 09:56 GMT+8] Fix the failing vitest auth test in the...",
        evidence_summary: "Failure evidence captured from process.",
        support_count: 1,
        updated_at: "2026-03-12T02:39:26.980Z"
      })
    );

    const summary = cleanupHistoricalWarningVariants(db, true);
    const rows = repo.listAll().filter((row) => row.node_type === "warning");
    const active = rows.find((row) => row.id === canonicalId);
    const retired = rows.filter((row) => row.id !== canonicalId);

    expect(summary).toEqual({
      canonicalizedGroups: 1,
      retiredVariants: 2,
      createdCanonicalNodes: 0
    });
    expect(active?.compact_hint).toBe(canonicalWarningHint);
    expect(active?.trigger_pattern).toBe("Fix the failing vitest auth test in the current workspace.");
    expect(active?.support_count).toBe(7);
    expect(active?.usage_count).toBe(2);
    expect(active?.helped_count).toBe(2);
    expect(active?.evidence_summary).toBe("Failure evidence captured from process.");
    expect(retired.every((row) => row.state === "retired")).toBe(true);
  });
});
