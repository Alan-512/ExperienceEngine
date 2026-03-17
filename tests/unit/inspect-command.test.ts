import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInspectCommand } from "../../src/cli/commands/inspect.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../../src/store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { OutcomeRecordRepository } from "../../src/store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";
import { nowIso } from "../../src/utils/clock.js";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import type {
  DistillationJob,
  ExperienceCandidate,
  ExperienceInputRecord,
  ExperienceNode,
  OutcomeRecord,
  ReviewEvent,
  TaskRun
} from "../../src/types/domain.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-inspect-command-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_inspect",
  node_type: "strategy",
  scope_id: resolveScope("/repo").scope_id,
  task_type: "test_debug",
  trigger_pattern: "Fix the failing auth test",
  applicability_notes: "Stay in the same repo scope",
  env_signature: undefined,
  compact_hint: "Run the failing auth test before editing and verify after the fix.",
  goal: "Stabilize the auth test",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "The test passes",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "Previously solved the same auth test failure.",
  retrieval_text: "Fix the failing auth test\nRun the failing auth test before editing and verify after the fix.",
  source_kind: "system_derived",
  origin_record_ids: ["input_origin"],
  helped_record_ids: ["input_helped"],
  harmed_record_ids: ["input_harmed"],
  state: "active",
  usage_count: 2,
  helped_count: 1,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: "2026-03-12T00:00:00.000Z",
  updated_at: "2026-03-12T00:00:00.000Z",
  ...overrides
});

const makeRecord = (overrides: Partial<ExperienceInputRecord> = {}): ExperienceInputRecord => ({
  record_id: "input_1",
  scope_id: resolveScope("/repo").scope_id,
  session_id: "session_last",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  outcome_signal: "success",
  context_summary: "Auth test failure in the current repo",
  evidence: ["Bash: success: auth test now passes"],
  injected_node_ids: ["node_inspect"],
  created_at: nowIso(),
  ...overrides
});

const makeCandidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_inspect",
  source_record_id: "input_1",
  scope_id: resolveScope("/repo").scope_id,
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix the failing auth test",
  compact_hint: "Use vitest as the terminal verification loop.",
  goal: "Keep the auth test in a narrow loop.",
  success_signal: "vitest passes",
  evidence_summary: "Terminal sequence: vitest passed.",
  retrieval_text: "Fix the failing auth test\nvitest passed",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_context_summary: "Auth test failure in the current repo",
  source_signal: {
    task_summary: "Fix the failing auth test",
    context_summary: "Auth test failure in the current repo",
    outcome_signal: "success",
    tool_events: [],
    evidence: ["vitest: success: auth test now passes"],
    failure_signature: "Auth test assertion failed",
    retry_count: 1,
    correction_signals: ["apply_patch"],
    tool_event_summary: ["failure: vitest failed: Auth test assertion failed", "success: vitest succeeded"]
  },
  lifecycle_state: "pending",
  retry_count: 0,
  created_at: "2026-03-13T01:00:00.000Z",
  updated_at: "2026-03-13T01:00:00.000Z",
  ...overrides
});

const makeTaskRun = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  id: "taskrun_inspect",
  host: "codex",
  scope_id: resolveScope("/repo").scope_id,
  session_id: "session_last",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  prompt_excerpt: "Fix the auth test",
  context_summary: "Auth test failure in the current repo",
  started_at: "2026-03-13T01:00:00.000Z",
  ended_at: "2026-03-13T01:05:00.000Z",
  final_status: "success",
  failure_signature: "Auth test assertion failed",
  created_at: "2026-03-13T01:00:00.000Z",
  updated_at: "2026-03-13T01:05:00.000Z",
  ...overrides
});

const makeOutcomeRecord = (overrides: Partial<OutcomeRecord> = {}): OutcomeRecord => ({
  id: "outcome_inspect",
  task_run_id: "taskrun_inspect",
  outcome_signal: "success",
  failure_signature: "Auth test assertion failed",
  summary: "Fix the failing auth test",
  created_at: "2026-03-13T01:05:00.000Z",
  ...overrides
});

const makeReviewEvent = (overrides: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: "review_inspect",
  node_id: "node_inspect",
  task_run_id: "taskrun_inspect",
  event_type: "mark_helped",
  source: "user",
  created_at: "2026-03-13T01:06:00.000Z",
  ...overrides
});

const makeJob = (overrides: Partial<DistillationJob> = {}): DistillationJob => ({
  id: "job_inspect",
  candidate_id: "candidate_inspect",
  status: "pending",
  extractor_profile: "balanced",
  retry_count: 0,
  created_at: "2026-03-13T01:00:00.000Z",
  updated_at: "2026-03-13T01:00:00.000Z",
  ...overrides
});

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
  consoleTableSpy.mockClear();
});

describe("inspect command", () => {
  it("prints the most recent intervention summary with injected hints", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    nodeRepo.upsert(makeNode());
    inputRepo.upsert(makeRecord());

    runInspectCommand("--last");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Session: session_last"],
        [`Scope: ${resolveScope("/repo").scope_id}`],
        ["Task type: test_debug"],
        ["Intervention: inject"],
        ["Injected nodes:"],
        ["- node_inspect strategy active system_derived"],
        ["Hints:"],
        ["- Run the failing auth test before editing and verify after the fix."],
        ["Evidence:"],
        ["- Bash: success: auth test now passes"],
        ["Outcome: success"]
      ])
    );
  });

  it("prints active nodes as a reviewable table", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(
      makeNode({
        id: "node_retired",
        state: "retired",
        compact_hint: "This retired hint should not appear in active view."
      })
    );

    runInspectCommand("active");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "node_inspect",
        type: "strategy",
        source: "system_derived",
        task: "test_debug",
        state: "active",
        helped: 1,
        harmed: 0,
        hint: "Run the failing auth test before editing and verify after the fix."
      })
    ]);
  });

  it("prints recent history as a compact review table", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const inputRepo = new InputRecordRepository(db);
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_1",
        session_id: "session_recent_1",
        injected_node_ids: ["node_inspect"],
        created_at: "2026-03-13T01:00:00.000Z"
      })
    );
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_2",
        session_id: "session_recent_2",
        injected_node_ids: [],
        outcome_signal: "failure",
        created_at: "2026-03-13T00:00:00.000Z"
      })
    );

    runInspectCommand("recent");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        session: "session_recent_1",
        task: "test_debug",
        intervention: "inject",
        outcome: "success"
      }),
      expect.objectContaining({
        session: "session_recent_2",
        task: "test_debug",
        intervention: "skip",
        outcome: "failure"
      })
    ]);
  });

  it("filters recent history to injected turns and respects a custom limit", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const inputRepo = new InputRecordRepository(db);
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_a",
        session_id: "session_recent_a",
        injected_node_ids: ["node_inspect"],
        created_at: "2026-03-13T03:00:00.000Z"
      })
    );
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_b",
        session_id: "session_recent_b",
        injected_node_ids: [],
        created_at: "2026-03-13T02:00:00.000Z"
      })
    );
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_c",
        session_id: "session_recent_c",
        injected_node_ids: ["node_inspect"],
        created_at: "2026-03-13T01:00:00.000Z"
      })
    );

    runInspectCommand("recent", "injected", "1");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        session: "session_recent_a",
        intervention: "inject"
      })
    ]);
  });

  it("prints a single node detail view", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(
      makeNode({
        recommended_steps: ["Run the failing test", "Apply the minimal fix"]
      })
    );

    runInspectCommand("node:node_inspect");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Node: node_inspect"],
        ["Type: strategy"],
        ["Source: system_derived"],
        ["Task type: test_debug"],
        ["State: active"],
        [`Scope: ${resolveScope("/repo").scope_id}`],
        ["Helped: 1"],
        ["Harmed: 0"],
        ["Used: 2"],
        ["Hint: Run the failing auth test before editing and verify after the fix."],
        ["Goal: Stabilize the auth test"],
        ["Applicability: Stay in the same repo scope"],
        ["Success signal: The test passes"],
        ["Evidence: Previously solved the same auth test failure."],
        ["Origin records: input_origin"],
        ["Helped records: input_helped"],
        ["Harmed records: input_harmed"],
        ["Recommended steps:"],
        ["- Run the failing test"],
        ["- Apply the minimal fix"]
      ])
    );
  });

  it("filters nodes by state", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(
      makeNode({
        id: "node_cooling",
        state: "cooling",
        compact_hint: "Cooling node hint"
      })
    );

    runInspectCommand("state", "cooling");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "node_cooling",
        source: "system_derived",
        state: "cooling",
        hint: "Cooling node hint"
      })
    ]);
  });

  it("filters nodes by type", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(
      makeNode({
        id: "node_warning",
        node_type: "warning",
        compact_hint: "Warning node hint"
      })
    );

    runInspectCommand("type", "warning");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "node_warning",
        type: "warning",
        source: "system_derived",
        hint: "Warning node hint"
      })
    ]);
  });

  it("prints learning pipeline summary", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    new CandidateRepository(db).upsert(makeCandidate());
    new DistillationJobRepository(db).upsert(makeJob({ status: "failed", retry_count: 1, last_error: "timeout" }));
    new NodeRepository(db).upsert(makeNode({ state: "active" }));
    new TaskRunRepository(db).upsert(makeTaskRun());
    new OutcomeRecordRepository(db).upsert(makeOutcomeRecord());
    new ReviewEventRepository(db).upsert(makeReviewEvent());

    runInspectCommand("learning");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([["Candidate lifecycle:"], ["Distillation jobs:"], ["Formal nodes:"], ["Runtime records:"]])
    );
    expect(consoleTableSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ pending: 1, distilled: 0, failed: 0, discarded: 0 })],
        [expect.objectContaining({ pending: 0, processing: 0, succeeded: 0, failed: 1, discarded: 0 })],
        [expect.objectContaining({ active: 1, cooling: 0, retired: 0 })],
        [expect.objectContaining({ taskRuns: 1, outcomes: 1, reviews: 1 })]
      ])
    );
  });

  it("lists managed backups", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const service = new ExperienceStateArtifactService({
      now: () => "2026-03-13T06:30:00.000Z",
      idFactory: (() => {
        let count = 0;
        return () => `token-${++count}`;
      })()
    });
    const plan = service.planOperation({ operation: "backup" });
    service.executePlannedOperation({
      planId: plan.planId,
      confirmationToken: plan.confirmationToken
    });

    runInspectCommand("backups");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^backup-/),
        kind: "backup",
        sqlite: true,
        settings: false
      })
    ]);
  });
});
