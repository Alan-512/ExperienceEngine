import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { AttributionRecordRepository } from "../../src/store/sqlite/repositories/attribution-record-repo.js";
import { EpisodeRepository } from "../../src/store/sqlite/repositories/episode-repo.js";
import { InjectionRepository } from "../../src/store/sqlite/repositories/injection-repo.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { OutcomeRecordRepository } from "../../src/store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-episode-repo-"));
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

const seedFullEpisode = (db: ReturnType<typeof makeDb>, episodeId = "episode_auth_fix") => {
  const suffix = episodeId.replace(/^episode_/, "");
  const taskRunId = `taskrun_${suffix}`;
  const inputId = `input_${suffix}`;
  const outcomeId = `outcome_${suffix}`;
  const injectionId = `inject_${suffix}`;
  const attributionId = `attr_${suffix}`;
  const reviewId = `review_${suffix}`;
  new TaskRunRepository(db).upsert({
    id: taskRunId,
    episode_id: episodeId,
    host: "codex",
    scope_id: "scope_auth",
    session_id: "session_auth",
    task_type: "test_debug",
    task_summary: "Fix the failing auth vitest",
    started_at: "2026-05-04T10:00:00.000Z",
    ended_at: "2026-05-04T10:05:00.000Z",
    final_status: "success",
    created_at: "2026-05-04T10:00:00.000Z",
    updated_at: "2026-05-04T10:05:00.000Z"
  });
  new InputRecordRepository(db).upsert({
    record_id: inputId,
    episode_id: episodeId,
    scope_id: "scope_auth",
    session_id: "session_auth",
    task_type: "test_debug",
    task_summary: "Fix the failing auth vitest",
    outcome_signal: "success",
    evidence: ["vitest: success"],
    injected_node_ids: ["node_auth_fix"],
    created_at: "2026-05-04T10:05:00.000Z"
  });
  new OutcomeRecordRepository(db).upsert({
    id: outcomeId,
    episode_id: episodeId,
    task_run_id: taskRunId,
    outcome_signal: "success",
    summary: "Auth vitest passes.",
    created_at: "2026-05-04T10:05:01.000Z"
  });
  new InjectionRepository(db).upsert({
    injection_id: injectionId,
    episode_id: episodeId,
    session_id: "session_auth",
    scope_id: "scope_auth",
    task_type: "test_debug",
    task_summary: "Fix the failing auth vitest",
    mode: "inject",
    delivery_mode: "live",
    delivered: true,
    injected_node_ids: ["node_auth_fix"],
    injection_count: 1,
    was_successful: true,
    harm_observed: false,
    attribution_reason: "success_outcome",
    created_at: "2026-05-04T10:00:01.000Z",
    resolved_at: "2026-05-04T10:05:02.000Z"
  });
  new AttributionRecordRepository(db).insert({
    id: attributionId,
    injection_id: injectionId,
    node_id: "node_auth_fix",
    episode_id: episodeId,
    intervention_strength: "soft_recommendation",
    injection_mode: "inject",
    delivery_mode: "live",
    delivered: true,
    outcome: "success",
    attribution_verdict: "weak_helped",
    confidence: "medium",
    evidence_refs: [inputId, taskRunId, injectionId],
    source: "automatic",
    attribution_reason: "success_outcome",
    created_at: "2026-05-04T10:05:03.000Z"
  });
  new ReviewEventRepository(db).upsert({
    id: reviewId,
    episode_id: episodeId,
    node_id: "node_auth_fix",
    task_run_id: taskRunId,
    event_type: "mark_uncertain",
    source: "automatic",
    created_at: "2026-05-04T10:05:04.000Z"
  });
};

describe("EpisodeRepository", () => {
  it("reconstructs a full episode from existing tables", () => {
    const db = makeDb();
    seedFullEpisode(db);

    const projection = new EpisodeRepository(db).getByEpisodeId("episode_auth_fix");

    expect(projection).toMatchObject({
      episode_id: "episode_auth_fix",
      scope_id: "scope_auth",
      session_id: "session_auth",
      task_run: { id: "taskrun_auth_fix" },
      input_records: [expect.objectContaining({ record_id: "input_auth_fix" })],
      outcome_records: [expect.objectContaining({ id: "outcome_auth_fix" })],
      injection_events: [expect.objectContaining({ injection_id: "inject_auth_fix" })],
      attribution_records: [expect.objectContaining({ id: "attr_auth_fix" })],
      review_events: [expect.objectContaining({ id: "review_auth_fix" })]
    });
  });

  it("returns partial projections and ignores old rows without episode ids", () => {
    const db = makeDb();
    new InputRecordRepository(db).upsert({
      record_id: "input_old",
      scope_id: "scope_auth",
      session_id: "session_old",
      task_type: "test_debug",
      task_summary: "Old row without episode id",
      outcome_signal: "success",
      evidence: [],
      injected_node_ids: [],
      created_at: "2026-05-04T09:00:00.000Z"
    });
    new InjectionRepository(db).upsert({
      injection_id: "inject_partial",
      episode_id: "episode_partial",
      session_id: "session_partial",
      scope_id: "scope_auth",
      task_type: "test_debug",
      mode: "skip",
      delivery_mode: "live",
      delivered: false,
      injected_node_ids: [],
      injection_count: 0,
      was_successful: null,
      harm_observed: null,
      created_at: "2026-05-04T09:30:00.000Z"
    });

    const repo = new EpisodeRepository(db);

    expect(repo.getByEpisodeId("episode_partial")).toMatchObject({
      episode_id: "episode_partial",
      scope_id: "scope_auth",
      injection_events: [expect.objectContaining({ injection_id: "inject_partial" })],
      input_records: []
    });
    expect(repo.getByEpisodeId("missing_episode")).toBeUndefined();
    expect(repo.listRecentByScope("scope_auth", 10)).toEqual([]);
  });

  it("lists recent episode summaries by scope", () => {
    const db = makeDb();
    seedFullEpisode(db, "episode_first");
    seedFullEpisode(db, "episode_second");

    const summaries = new EpisodeRepository(db).listRecentByScope("scope_auth", 2);

    expect(summaries.map((summary) => summary.episode_id).sort()).toEqual(["episode_first", "episode_second"]);
    expect(summaries[0]).toMatchObject({
      scope_id: "scope_auth",
      session_id: "session_auth",
      outcome: "success"
    });
  });
});
