import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import type { ReviewEvent } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeDb = (): DatabaseSync => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-delivery-state-"));
  tempDirs.push(runtimeDir);
  return new DatabaseSync(join(runtimeDir, "experienceengine.db"));
};

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("delivery-state governance persistence", () => {
  it("backfills delivery_state from legacy lifecycle state", () => {
    const db = makeDb();

    db.exec(`
      CREATE TABLE experience_nodes (
        id TEXT PRIMARY KEY,
        node_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        trigger_pattern TEXT NOT NULL,
        applicability_notes TEXT,
        env_signature TEXT,
        compact_hint TEXT NOT NULL,
        goal TEXT,
        recommended_steps_json TEXT,
        avoid_steps_json TEXT,
        fallback_steps_json TEXT,
        success_signal TEXT NOT NULL,
        stop_condition TEXT,
        escalation_condition TEXT,
        evidence_summary TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        state TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        helped_count INTEGER NOT NULL DEFAULT 0,
        harmed_count INTEGER NOT NULL DEFAULT 0,
        support_count INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT,
        last_helped_at TEXT,
        last_harmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const insert = db.prepare(`
      INSERT INTO experience_nodes (
        id, node_type, scope_id, task_type, trigger_pattern, compact_hint, success_signal, evidence_summary,
        source_kind, state, created_at, updated_at
      ) VALUES (?, 'warning', 'scope_1', 'test_debug', 'trigger', 'hint', 'success', 'evidence', 'system_derived', ?, '2026-04-11T00:00:00.000Z', '2026-04-11T00:00:00.000Z')
    `);
    insert.run("candidate-node", "candidate");
    insert.run("priority-node", "priority_candidate");
    insert.run("active-node", "active");
    insert.run("cooling-node", "cooling");
    insert.run("retired-node", "retired");

    bootstrapDatabase(db);

    const rows = db
      .prepare("SELECT id, delivery_state FROM experience_nodes ORDER BY id")
      .all() as Array<{ id: string; delivery_state?: string }>;

    expect(rows).toEqual([
      { id: "active-node", delivery_state: "eligible" },
      { id: "candidate-node", delivery_state: "shadow_only" },
      { id: "cooling-node", delivery_state: "conservative_only" },
      { id: "priority-node", delivery_state: "conservative_only" },
      { id: "retired-node", delivery_state: "quarantined" }
    ]);
  });

  it("accepts new review event types for uncertain and quarantine flows", () => {
    const db = makeDb();
    bootstrapDatabase(db);
    const repo = new ReviewEventRepository(db);

    const uncertainEvent: ReviewEvent = {
      id: "review_uncertain",
      node_id: "node_1",
      event_type: "mark_uncertain",
      source: "automatic",
      created_at: "2026-04-11T00:00:00.000Z"
    };
    const quarantineEvent: ReviewEvent = {
      id: "review_quarantine",
      node_id: "node_1",
      event_type: "quarantine",
      source: "automatic",
      created_at: "2026-04-11T00:00:01.000Z"
    };

    repo.upsert(uncertainEvent);
    repo.upsert(quarantineEvent);

    expect(repo.countBySourceAndType("automatic", "mark_uncertain")).toBe(1);
    expect(repo.countBySourceAndType("automatic", "quarantine")).toBe(1);
  });
});
