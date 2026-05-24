import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";
import { projectTraceCapsule } from "../../src/input/projector.js";
import type { TraceCapsule, ExperienceInputRecord, TaskRun } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-projection-repo-"));
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

const sampleTraceCapsule = (): TraceCapsule => ({
  id: "trace_projection_1",
  episode_id: "ep_1",
  task_run_id: "tr_1",
  scope_id: "sc_1",
  session_id: "sess_1",
  task: {
    goal: "Fix buggy vitest and ensure all green checks",
    user_constraints: ["No breaking changes"],
    injected_expectations: ["Check database.ts"],
    delivered_node_ids: ["node_rule_99"]
  },
  events: [
    {
      id: "ev_tool_call_1",
      event_type: "tool_call",
      timestamp: "2026-05-24T12:00:00.000Z",
      source: { host: "antigravity", adapter_version: "1.0.0" },
      payload: { id: "call_abc", name: "run_command", args: ["pnpm test"] }
    },
    {
      id: "ev_tool_result_1",
      event_type: "tool_result",
      timestamp: "2026-05-24T12:00:10.000Z",
      source: { host: "antigravity", adapter_version: "1.0.0" },
      payload: { id: "call_abc", status: "success", result: "All tests passed!" }
    },
    {
      id: "ev_tool_call_2",
      event_type: "tool_call",
      timestamp: "2026-05-24T12:01:00.000Z",
      source: { host: "antigravity", adapter_version: "1.0.0" },
      payload: { id: "call_def", name: "view_file", args: ["package.json"] }
    },
    {
      id: "ev_tool_failure_2",
      event_type: "tool_failure",
      timestamp: "2026-05-24T12:01:05.000Z",
      source: { host: "antigravity", adapter_version: "1.0.0" },
      payload: { id: "call_def", error: "File not found", exit_code: 1 }
    }
  ],
  evidence_refs: [],
  outcome: {
    outcome_signal: "success",
    confidence: "high",
    summary: "Fix finished successfully"
  },
  capture_metadata: {
    is_complete: true,
    completeness_score: 1.0,
    metadata_only: false,
    dropped_events_count: 0,
    redaction_applied: false,
    size_bytes: 400
  },
  host_profile: {
    host: "antigravity",
    profile_version: "1.0.0",
    adapter_version: "1.0.0",
    capabilities: {},
    transcript_stability: "stable",
    tool_coverage: [],
    observed_at: "2026-05-24T12:00:00.000Z"
  },
  created_at: "2026-05-24T12:00:00.000Z",
  updated_at: "2026-05-24T12:05:00.000Z"
});

describe("Trace Projection and Repository Compatibility", () => {
  describe("TraceProjector", () => {
    it("pairs tool calls and results, maps statuses, and resolves task properties", () => {
      const capsule = sampleTraceCapsule();
      const input = projectTraceCapsule(capsule);

      expect(input.scope_id).toBe("sc_1");
      expect(input.task_summary).toBe("Fix buggy vitest and ensure all green checks");
      expect(input.task_type).toBe("test_debug");
      expect(input.outcome_signal).toBe("success");
      expect(input.injected_node_ids).toEqual(["node_rule_99"]);

      expect(input.tool_events.length).toBe(2);
      
      const event1 = input.tool_events.find((e) => e.event_id === "call_abc")!;
      expect(event1).toBeDefined();
      expect(event1.tool_name).toBe("run_command");
      expect(event1.status).toBe("success");
      expect(event1.input_summary).toBe("[\"pnpm test\"]");
      expect(event1.output_summary).toBe("All tests passed!");

      const event2 = input.tool_events.find((e) => e.event_id === "call_def")!;
      expect(event2).toBeDefined();
      expect(event2.tool_name).toBe("view_file");
      expect(event2.status).toBe("failure");
      expect(event2.exit_code).toBe(1);
      expect(event2.error_signature).toBe("File not found");
    });

    it("deduplicates redundant tool failure results safely", () => {
      const capsule = sampleTraceCapsule();
      // Add a redundant unmatched failure for call_def
      capsule.events.push({
        id: "ev_redundant_failure",
        event_type: "tool_failure",
        timestamp: "2026-05-24T12:01:06.000Z",
        source: { host: "antigravity", adapter_version: "1.0.0" },
        payload: { tool_call_id: "call_def", error: "Duplicate error description" }
      });

      const input = projectTraceCapsule(capsule);
      // Since it shares call_def, the unmatched failure gets matched or handled uniquely but does not duplicate tool calls
      const callDefs = input.tool_events.filter((e) => e.event_id === "call_def");
      expect(callDefs.length).toBe(1); // Properly deduplicated
    });

    it("falls back to legacy outcome resolution if signal is unknown", () => {
      const capsule = sampleTraceCapsule();
      capsule.outcome.outcome_signal = "unknown";
      capsule.outcome.summary = "Oh no, unable to fix the error";

      const input = projectTraceCapsule(capsule);
      expect(input.outcome_signal).toBe("failure"); // Resolved from final summary via resolvers
    });
  });

  describe("Repository Backward Compatibility", () => {
    it("allows reading and writing legacy records without trace metadata", () => {
      const db = makeDb();
      const inputRepo = new InputRecordRepository(db);
      const runRepo = new TaskRunRepository(db);

      const legacyInputRecord: ExperienceInputRecord = {
        record_id: "rec_legacy_1",
        scope_id: "sc_legacy",
        task_type: "bug_fix",
        task_summary: "Legacy fix",
        outcome_signal: "success",
        evidence: [],
        injected_node_ids: [],
        created_at: new Date().toISOString()
      };

      const legacyTaskRun: TaskRun = {
        id: "run_legacy_1",
        host: "antigravity",
        scope_id: "sc_legacy",
        task_type: "bug_fix",
        task_summary: "Legacy task run",
        started_at: new Date().toISOString(),
        final_status: "success",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      expect(() => inputRepo.upsert(legacyInputRecord)).not.toThrow();
      expect(() => runRepo.upsert(legacyTaskRun)).not.toThrow();

      const fetchedInput = inputRepo.getLatest()!;
      expect(fetchedInput).toBeDefined();
      expect(fetchedInput.record_id).toBe("rec_legacy_1");
      expect(fetchedInput.trace_capsule_id).toBeUndefined();
      expect(fetchedInput.trace_completeness).toBeUndefined();

      const fetchedRun = runRepo.getById("run_legacy_1")!;
      expect(fetchedRun).toBeDefined();
      expect(fetchedRun.id).toBe("run_legacy_1");
      expect(fetchedRun.trace_capsule_id).toBeUndefined();
      expect(fetchedRun.trace_completeness).toBeUndefined();
    });

    it("saves and retrieves trace metadata fields in records and task runs correctly", () => {
      const db = makeDb();
      const inputRepo = new InputRecordRepository(db);
      const runRepo = new TaskRunRepository(db);

      const traceRecord: ExperienceInputRecord = {
        record_id: "rec_trace_1",
        scope_id: "sc_trace",
        task_type: "bug_fix",
        task_summary: "Trace-backed fix",
        outcome_signal: "success",
        evidence: [],
        injected_node_ids: [],
        trace_capsule_id: "capsule_foo",
        trace_completeness: 0.95,
        created_at: new Date().toISOString()
      };

      const traceTaskRun: TaskRun = {
        id: "run_trace_1",
        host: "antigravity",
        scope_id: "sc_trace",
        task_type: "bug_fix",
        task_summary: "Trace-backed run",
        started_at: new Date().toISOString(),
        final_status: "success",
        trace_capsule_id: "capsule_bar",
        trace_completeness: 0.85,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      inputRepo.upsert(traceRecord);
      runRepo.upsert(traceTaskRun);

      const fetchedInput = inputRepo.getLatest()!;
      expect(fetchedInput.trace_capsule_id).toBe("capsule_foo");
      expect(fetchedInput.trace_completeness).toBe(0.95);

      const fetchedRun = runRepo.getById("run_trace_1")!;
      expect(fetchedRun.trace_capsule_id).toBe("capsule_bar");
      expect(fetchedRun.trace_completeness).toBe(0.85);
    });
  });
});
