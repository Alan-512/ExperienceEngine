import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { TraceRepository } from "../../src/store/sqlite/repositories/trace-repo.js";
import { redactSecrets, getBoundedSummary } from "../../src/utils/redaction.js";
import type { TraceCapsule } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-trace-repo-"));
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

const sampleCapsule = (overrides: Partial<TraceCapsule> = {}): TraceCapsule => {
  const id = overrides.id ?? "trace_id_123";
  return {
    id,
    episode_id: "ep_123",
    task_run_id: "tr_123",
    scope_id: "sc_123",
    session_id: "sess_123",
    task: {
      goal: "Implement trace capsules",
      user_constraints: ["No breaking changes"],
      user_non_goals: ["Unbounded logs"],
      acceptance_signals: ["Tests pass"],
      injected_expectations: ["Use schema.sql"],
      delivered_node_ids: ["node_456"]
    },
    events: [
      {
        id: `${id}_ev_1`,
        event_type: "prompt",
        timestamp: "2026-05-24T12:00:00.000Z",
        source: {
          host: "antigravity",
          source_hook: "before_prompt",
          adapter_version: "1.0.0"
        },
        payload: { prompt: "Please do work" }
      },
      {
        id: `${id}_ev_2`,
        event_type: "tool_call",
        timestamp: "2026-05-24T12:01:00.000Z",
        source: {
          host: "antigravity",
          source_hook: "on_tool_call",
          adapter_version: "1.0.0"
        },
        payload: { tool: "run_command", args: ["npm test"] }
      }
    ],
    evidence_refs: [
      {
        id: `${id}_ref_1`,
        ref_type: "file",
        path_or_uri: "src/store/sqlite/schema.sql",
        content_hash: "hash_xyz",
        summary: "SQLite schema file",
        is_redacted: false,
        size_bytes: 12000
      }
    ],
    outcome: {
      outcome_signal: "success",
      confidence: "high",
      failure_signature: undefined,
      summary: "Task worked seamlessly",
      verified_by: ["vitest"]
    },
    capture_metadata: {
      is_complete: true,
      completeness_score: 1.0,
      metadata_only: false,
      dropped_events_count: 0,
      redaction_applied: false,
      size_bytes: 500
    },
    host_profile: {
      host: "antigravity",
      profile_version: "1.0.0",
      adapter_version: "1.0.0",
      capabilities: {
        tool_calls: {
          state: "verified",
          provenance: "verified",
          updated_at: "2026-05-24T12:00:00.000Z"
        }
      },
      transcript_stability: "stable",
      tool_coverage: ["run_command"],
      observed_at: "2026-05-24T12:00:00.000Z"
    },
    created_at: "2026-05-24T12:00:00.000Z",
    updated_at: "2026-05-24T12:05:00.000Z",
    ...overrides
  };
};

describe("Trace Foundation & Utilities", () => {
  describe("Redaction and Bounded Summary", () => {
    it("redacts standard api keys and tokens", () => {
      const openaiKey = "sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12";
      expect(redactSecrets(openaiKey)).toBe("[REDACTED]");

      const anthropicKey = "sk-ant-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12345678";
      expect(redactSecrets(anthropicKey)).toBe("[REDACTED]");

      const configStr = "api_key = \"secret-value-12345\"";
      expect(redactSecrets(configStr)).toBe("api_key = [REDACTED]");

      const specialPwd = "password = \"p@$$w0rd!#\"";
      expect(redactSecrets(specialPwd)).toBe("password = [REDACTED]");
    });

    it("summarizes and hashes large contents", () => {
      const smallContent = "This is small";
      const resultSmall = getBoundedSummary(smallContent, 50);
      expect(resultSmall.summary).toBe("This is small");
      expect(resultSmall.isRedacted).toBe(false);

      const largeContent = "a".repeat(100);
      const resultLarge = getBoundedSummary(largeContent, 50);
      expect(resultLarge.summary).toContain("... [TRUNCATED, HASH:");
    });
  });

  describe("TraceRepository", () => {
    it("handles capsule upserts and round-trip queries", () => {
      const db = makeDb();
      const repo = new TraceRepository(db);
      const capsule = sampleCapsule();

      repo.upsert(capsule);

      const fetched = repo.getById(capsule.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(capsule.id);
      expect(fetched!.task.goal).toBe("Implement trace capsules");
      expect(fetched!.events.length).toBe(2);
      expect(fetched!.evidence_refs.length).toBe(1);
      expect(fetched!.host_profile.host).toBe("antigravity");

      // Test reverse lookups
      expect(repo.getByTaskRunId("tr_123")).toBeDefined();
      expect(repo.getByEpisodeId("ep_123")).toBeDefined();

      // Test upsert update
      const updated = sampleCapsule({
        task: { ...capsule.task, goal: "Goal has changed" }
      });
      repo.upsert(updated);
      expect(repo.getById(capsule.id)!.task.goal).toBe("Goal has changed");
    });

    it("cleans up old trace capsules by TTL", () => {
      const db = makeDb();
      const repo = new TraceRepository(db);
      
      const oldCapsule = sampleCapsule({
        id: "old_trace",
        created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      });
      const newCapsule = sampleCapsule({
        id: "new_trace",
        created_at: new Date().toISOString()
      });

      repo.upsert(oldCapsule);
      repo.upsert(newCapsule);

      expect(repo.count()).toBe(2);

      // Verify DB foreign key support is enabled
      const fkPragma = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
      expect(fkPragma.foreign_keys).toBe(1);

      // Verify events are in the database before deletion
      const oldEventsBefore = db.prepare("SELECT COUNT(*) AS count FROM trace_events WHERE trace_capsule_id = 'old_trace'").get() as { count: number };
      expect(oldEventsBefore.count).toBe(2);

      const cleaned = repo.cleanupOldTraces(30); // 30 days retention
      expect(cleaned).toBe(1);
      expect(repo.count()).toBe(1);
      expect(repo.getById("new_trace")).toBeDefined();
      expect(repo.getById("old_trace")).toBeUndefined();

      // Assert that linked events and evidence refs were successfully cascade deleted
      const oldEventsAfter = db.prepare("SELECT COUNT(*) AS count FROM trace_events WHERE trace_capsule_id = 'old_trace'").get() as { count: number };
      expect(oldEventsAfter.count).toBe(0);

      const oldRefsAfter = db.prepare("SELECT COUNT(*) AS count FROM trace_evidence_refs WHERE trace_capsule_id = 'old_trace'").get() as { count: number };
      expect(oldRefsAfter.count).toBe(0);
    });

    it("enforces event and evidence count limits", () => {
      const db = makeDb();
      const repo = new TraceRepository(db);
      const capsule = sampleCapsule();

      repo.upsert(capsule);
      expect(repo.getById(capsule.id)!.events.length).toBe(2);

      // Trim to max 1 event and 0 evidence refs
      repo.cleanupCapsuleLimits(capsule.id, 1, 0);

      const fetched = repo.getById(capsule.id)!;
      expect(fetched.events.length).toBe(1);
      expect(fetched.evidence_refs.length).toBe(0);
    });
  });

  describe("Schema Migration Idempotence", () => {
    it("can run bootstrapDatabase multiple times safely", () => {
      const db = makeDb();
      expect(() => bootstrapDatabase(db)).not.toThrow();
    });
  });
});
