import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeRepo = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-node-repo-"));
  tempDirs.push(runtimeDir);
  const db = openDatabase(
    loadConfig({
      dataDir: runtimeDir,
      sqlitePath: join(runtimeDir, "experienceengine.db"),
      captureDir: join(runtimeDir, "captures")
    })
  );
  bootstrapDatabase(db);
  return new NodeRepository(db);
};

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const node = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_warning",
  node_type: "warning",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern:
    "Execution hints from prior similar tasks: - Reproduce first, then validate the fix with exec before moving on. [Thu 2026-03-12 09:24 GMT+8] Fix the failing vitest auth test. Start...",
  compact_hint: "Do not keep iterating on the current debug path without narrowing the failing signature first.",
  success_signal: "A narrowed reproduction or a different evidence-backed fix path is identified.",
  evidence_summary: "Failure evidence captured from exec.",
  retrieval_text:
    "Execution hints from prior similar tasks: - Reproduce first, then validate the fix with exec before moving on. [Thu 2026-03-12 09:24 GMT+8] Fix the failing vitest auth test. Start...\nDo not keep iterating on the current debug path without narrowing the failing signature first.",
  embedding: [0.1, -0.2, 0.3],
  source_kind: "system_derived",
  experience_kind: "expectation_correction",
  confidence_signal: "confirmed_by_user",
  validation_state: "validated_by_reuse",
  correction_scope: "repo_local",
  correction_category: "implementation_boundary",
  deviation_pattern: "implementation solves the wrong layer of the problem",
  corrected_constraint: "Fix the provider routing layer before touching UI code.",
  origin_record_ids: ["input_origin"],
  helped_record_ids: ["input_helped"],
  harmed_record_ids: ["input_harmed"],
  state: "active",
  usage_count: 3,
  helped_count: 2,
  harmed_count: 1,
  support_count: 4,
  created_at: "2026-03-12T02:00:00.000Z",
  updated_at: "2026-03-12T02:00:00.000Z",
  last_used_at: "2026-03-12T02:00:00.000Z",
  last_helped_at: "2026-03-12T01:59:00.000Z",
  last_harmed_at: "2026-03-12T01:58:00.000Z",
  ...overrides
});

describe("NodeRepository", () => {
  it("refreshes candidate-derived metadata while preserving counters and timestamps", () => {
    const repo = makeRepo();

    repo.upsert(node({}));
    repo.upsert(
      node({
        trigger_pattern: "Fix the failing vitest auth test in the current workspace.",
        evidence_summary: "Failure evidence captured from read.",
        updated_at: "2026-03-12T02:05:00.000Z"
      })
    );

    const stored = repo.getById("node_warning");

    expect(stored?.trigger_pattern).toBe("Fix the failing vitest auth test in the current workspace.");
    expect(stored?.evidence_summary).toBe("Failure evidence captured from read.");
    expect(stored?.retrieval_text).toContain("Do not keep iterating on the current debug path");
    expect(stored?.embedding).toEqual([0.1, -0.2, 0.3]);
    expect(stored?.usage_count).toBe(3);
    expect(stored?.helped_count).toBe(2);
    expect(stored?.harmed_count).toBe(1);
    expect(stored?.experience_kind).toBe("expectation_correction");
    expect(stored?.confidence_signal).toBe("confirmed_by_user");
    expect(stored?.validation_state).toBe("validated_by_reuse");
    expect(stored?.correction_scope).toBe("repo_local");
    expect(stored?.correction_category).toBe("implementation_boundary");
    expect(stored?.deviation_pattern).toBe("implementation solves the wrong layer of the problem");
    expect(stored?.corrected_constraint).toBe("Fix the provider routing layer before touching UI code.");
    expect(stored?.promotion_signal).toBeUndefined();
    expect(stored?.promotion_reason).toBeUndefined();
    expect(stored?.merge_decision).toBeUndefined();
    expect(stored?.merge_reason).toBeUndefined();
    expect(stored?.priority_promotion_applied).toBe(false);
    expect(stored?.origin_record_ids).toEqual(["input_origin"]);
    expect(stored?.helped_record_ids).toEqual(["input_helped"]);
    expect(stored?.harmed_record_ids).toEqual(["input_harmed"]);
    expect(stored?.last_used_at).toBe("2026-03-12T02:00:00.000Z");
    expect(stored?.last_helped_at).toBe("2026-03-12T01:59:00.000Z");
    expect(stored?.last_harmed_at).toBe("2026-03-12T01:58:00.000Z");
  });

  it("round-trips priority candidate state and promotion metadata", () => {
    const repo = makeRepo();

    repo.upsert(
      node({
        id: "node_priority",
        state: "priority_candidate",
        promotion_signal: "high_value",
        promotion_reason: "The experience captures a reusable verification loop with explicit avoidance guidance.",
        merge_decision: "ADD",
        merge_reason: "The lesson is new enough to deserve its own reusable node.",
        priority_promotion_applied: true
      })
    );

    const stored = repo.getById("node_priority");
    expect(stored?.state).toBe("priority_candidate");
    expect(stored?.promotion_signal).toBe("high_value");
    expect(stored?.promotion_reason).toContain("reusable verification loop");
    expect(stored?.merge_decision).toBe("ADD");
    expect(stored?.merge_reason).toContain("new enough");
    expect(stored?.priority_promotion_applied).toBe(true);
  });
});
