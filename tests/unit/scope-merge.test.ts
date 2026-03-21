import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";
import { InjectionRepository } from "../../src/store/sqlite/repositories/injection-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { ExperiencePackRepository } from "../../src/store/sqlite/repositories/pack-repo.js";
import { StatsRepository } from "../../src/store/sqlite/repositories/stats-repo.js";
import { mergeScopes } from "../../src/maintenance/scope-merge.js";
import type { ExperienceCandidate, ExperienceNode } from "../../src/types/domain.js";

const makeNode = (scope_id: string, id: string): ExperienceNode => ({
  id,
  node_type: "strategy",
  scope_id,
  task_type: "test_debug",
  trigger_pattern: "Fix auth test",
  compact_hint: "Run auth test first.",
  success_signal: "Auth test passes",
  evidence_summary: "Recovered auth test.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-03-20T00:00:00.000Z",
  updated_at: "2026-03-20T00:00:00.000Z"
});

const makeCandidate = (scope_id: string, id: string, sourceRecordId: string): ExperienceCandidate => ({
  id,
  source_record_id: sourceRecordId,
  scope_id,
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix auth test",
  compact_hint: "Run auth test first.",
  success_signal: "Auth test passes",
  evidence_summary: "Recovered auth test.",
  retrieval_text: "Fix auth test",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_signal: {
    task_summary: "Fix auth test",
    outcome_signal: "success",
    tool_events: [],
    evidence: [],
    retry_count: 0,
    correction_signals: [],
    tool_event_summary: []
  },
  lifecycle_state: "pending",
  retry_count: 0,
  created_at: "2026-03-20T00:00:00.000Z",
  updated_at: "2026-03-20T00:00:00.000Z"
});

describe("mergeScopes", () => {
  it("moves scope-owned records and merges scoped aggregates", () => {
    const dir = mkdtempSync(join(tmpdir(), "experienceengine-scope-merge-"));
    const config = loadConfig({ dataDir: dir, sqlitePath: join(dir, "experienceengine.db") });
    const db = openDatabase(config);
    bootstrapDatabase(db);

    const scopeRepo = new ScopeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    const taskRunRepo = new TaskRunRepository(db);
    const injectionRepo = new InjectionRepository(db);
    const nodeRepo = new NodeRepository(db);
    const candidateRepo = new CandidateRepository(db);
    const packRepo = new ExperiencePackRepository(db);
    const statsRepo = new StatsRepository(db);

    scopeRepo.upsert({
      scope_id: "scope_source",
      scope_type: "workspace",
      scope_name: "ExperienceEngine",
      root_path: "/mnt/d/project/ExperienceEngine",
      is_disabled: false,
      created_at: "2026-03-17T00:00:00.000Z",
      updated_at: "2026-03-17T00:00:00.000Z"
    });
    scopeRepo.upsert({
      scope_id: "scope_target",
      scope_type: "workspace",
      scope_name: "experienceengine",
      root_path: "/mnt/d/project/experienceengine",
      is_disabled: false,
      created_at: "2026-03-18T00:00:00.000Z",
      updated_at: "2026-03-18T00:00:00.000Z"
    });

    inputRepo.upsert({
      record_id: "input_source",
      scope_id: "scope_source",
      session_id: "session_source",
      task_type: "test_debug",
      task_summary: "Fix auth regression",
      outcome_signal: "success",
      evidence: ["fixed"],
      injected_node_ids: ["node_source"],
      created_at: "2026-03-20T00:00:00.000Z"
    });
    taskRunRepo.upsert({
      id: "taskrun_source",
      host: "codex",
      scope_id: "scope_source",
      session_id: "session_source",
      task_type: "test_debug",
      task_summary: "Fix auth regression",
      started_at: "2026-03-20T00:00:00.000Z",
      ended_at: "2026-03-20T00:01:00.000Z",
      final_status: "success",
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:01:00.000Z"
    });
    injectionRepo.upsert({
      injection_id: "inject_source",
      session_id: "session_source",
      scope_id: "scope_source",
      task_type: "test_debug",
      task_summary: "Fix auth regression",
      mode: "inject",
      delivery_mode: "live",
      delivered: true,
      injected_node_ids: ["node_source"],
      injection_count: 1,
      was_successful: true,
      harm_observed: false,
      created_at: "2026-03-20T00:00:00.000Z"
    });
    nodeRepo.upsert(makeNode("scope_source", "node_source"));
    candidateRepo.upsert(makeCandidate("scope_source", "candidate_source", "input_source"));

    packRepo.upsertActivation({
      scope_id: "scope_source",
      pack_id: "pack_auth",
      enabled: true,
      pinned_version: "v1",
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z"
    });
    packRepo.upsertActivation({
      scope_id: "scope_target",
      pack_id: "pack_auth",
      enabled: false,
      pinned_version: "v2",
      created_at: "2026-03-20T00:00:10.000Z",
      updated_at: "2026-03-20T00:00:10.000Z"
    });
    statsRepo.upsert({
      scope_id: "scope_source",
      task_type: "test_debug",
      total_tasks: 2,
      success_tasks: 1,
      failed_tasks: 1,
      unknown_tasks: 0,
      injected_tasks: 1,
      injected_success_tasks: 1,
      updated_at: "2026-03-20T00:00:00.000Z"
    });
    statsRepo.upsert({
      scope_id: "scope_target",
      task_type: "test_debug",
      total_tasks: 3,
      success_tasks: 2,
      failed_tasks: 1,
      unknown_tasks: 0,
      injected_tasks: 0,
      injected_success_tasks: 0,
      updated_at: "2026-03-20T00:00:10.000Z"
    });

    const report = mergeScopes({
      db,
      sourceScopeId: "scope_source",
      targetScopeId: "scope_target",
      now: () => "2026-03-20T01:00:00.000Z"
    });

    expect(report).toEqual({
      sourceScopeId: "scope_source",
      targetScopeId: "scope_target",
      moved: {
        inputRecords: 1,
        taskRuns: 1,
        injections: 1,
        nodes: 1,
        candidates: 1
      },
      merged: {
        packActivations: 1,
        taskStats: 1
      }
    });
    expect(scopeRepo.getById("scope_source")).toBeUndefined();
    expect(scopeRepo.getById("scope_target")).toMatchObject({
      root_path: "/mnt/d/project/experienceengine",
      updated_at: "2026-03-20T01:00:00.000Z"
    });
    expect(inputRepo.getLatestByScope("scope_target")?.record_id).toBe("input_source");
    expect(taskRunRepo.getLatestBySessionId("session_source")?.scope_id).toBe("scope_target");
    expect(nodeRepo.getById("node_source")?.scope_id).toBe("scope_target");
    expect(candidateRepo.getById("candidate_source")?.scope_id).toBe("scope_target");
    expect(packRepo.listActivations("scope_target")).toEqual([
      expect.objectContaining({
        pack_id: "pack_auth",
        enabled: true,
        pinned_version: "v2"
      })
    ]);
    expect(statsRepo.get("scope_target", "test_debug")).toMatchObject({
      total_tasks: 5,
      success_tasks: 3,
      failed_tasks: 2,
      injected_tasks: 1,
      injected_success_tasks: 1
    });

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
