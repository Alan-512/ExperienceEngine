import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runOpenClawScenarioEvaluation } from "../../src/evaluation/openclaw-scenarios.js";
import { loadConfig } from "../../src/config/load-config.js";
import { openDatabase, bootstrapDatabase } from "../../src/store/sqlite/db.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../../src/store/sqlite/repositories/distillation-job-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { OutcomeRecordRepository } from "../../src/store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";
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

const createRuntime = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-openclaw-scenarios-"));
  tempDirs.push(runtimeDir);
  const env = {
    ...process.env,
    EXPERIENCE_ENGINE_HOME: runtimeDir
  };
  const config = loadConfig(undefined, { env });
  const db = openDatabase(config);
  bootstrapDatabase(db);
  return { runtimeDir, env, db };
};

const record = (sessionId: string, overrides: Partial<ExperienceInputRecord> = {}): ExperienceInputRecord => ({
  record_id: `record-${sessionId}`,
  scope_id: "scope_repo",
  session_id: sessionId,
  task_type: "test_debug",
  task_summary: "Run the repo verification task",
  outcome_signal: "success",
  context_summary: undefined,
  evidence: ["exec: success"],
  injected_node_ids: ["node-1"],
  created_at: "2026-03-16T10:00:00.000Z",
  ...overrides
});

const candidate = (sourceRecordId: string, overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: `candidate-${sourceRecordId}`,
  source_record_id: sourceRecordId,
  scope_id: "scope_repo",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "test debug verification",
  applicability_notes: "repo local",
  env_signature: "local",
  compact_hint: "Re-run the same verification command in the repo root.",
  goal: "confirm repo state",
  recommended_steps: ["cd repo", "run pnpm test"],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "test passes",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "verified test path",
  retrieval_text: "repo test verification",
  source_kind: "system_derived",
  source_context_summary: undefined,
  source_outcome_signal: "success",
  source_signal: {
    task_summary: "Run the repo verification task",
    outcome_signal: "success",
    tool_events: [],
    evidence: ["exec: success"],
    failure_signature: undefined,
    retry_count: 0,
    correction_signals: [],
    tool_event_summary: []
  },
  lifecycle_state: "distilled",
  retry_count: 0,
  distilled_node_id: "node-1",
  last_error: undefined,
  created_at: "2026-03-16T10:00:00.000Z",
  updated_at: "2026-03-16T10:00:00.000Z",
  distilled_at: "2026-03-16T10:00:05.000Z",
  discarded_at: undefined,
  last_failed_at: undefined,
  ...overrides
});

const job = (candidateId: string, overrides: Partial<DistillationJob> = {}): DistillationJob => ({
  id: `job-${candidateId}`,
  candidate_id: candidateId,
  status: "succeeded",
  extractor_profile: "balanced",
  retry_count: 0,
  last_error: undefined,
  created_at: "2026-03-16T10:00:00.000Z",
  updated_at: "2026-03-16T10:00:05.000Z",
  started_at: "2026-03-16T10:00:01.000Z",
  finished_at: "2026-03-16T10:00:05.000Z",
  discarded_at: undefined,
  ...overrides
});

const node = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node-1",
  node_type: "strategy",
  scope_id: "scope_repo",
  task_type: "test_debug",
  trigger_pattern: "test debug verification",
  applicability_notes: "repo local",
  env_signature: "local",
  compact_hint: "Re-run the same verification command in the repo root.",
  goal: "confirm repo state",
  recommended_steps: ["cd repo", "run pnpm test"],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "test passes",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "verified test path",
  retrieval_text: "repo test verification",
  embedding: [1, 2, 3],
  source_kind: "system_derived",
  origin_record_ids: ["record-ee-openclaw-high-confidence-test-debug-a-2026-03-16T10-00-00-000Z"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 1,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  last_used_at: "2026-03-16T10:00:06.000Z",
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: "2026-03-16T10:00:00.000Z",
  updated_at: "2026-03-16T10:00:06.000Z",
  ...overrides
});

const taskRun = (sessionId: string, overrides: Partial<TaskRun> = {}): TaskRun => ({
  id: `taskrun-${sessionId}`,
  host: "openclaw",
  scope_id: "scope_repo",
  session_id: sessionId,
  task_type: "test_debug",
  task_summary: "Repeated test debug verification",
  prompt_excerpt: "Run the repo verification task",
  context_summary: "repo validation",
  started_at: "2026-03-16T10:00:00.000Z",
  ended_at: "2026-03-16T10:00:05.000Z",
  final_status: "success",
  failure_signature: undefined,
  created_at: "2026-03-16T10:00:00.000Z",
  updated_at: "2026-03-16T10:00:05.000Z",
  ...overrides
});

const outcome = (taskRunId: string, overrides: Partial<OutcomeRecord> = {}): OutcomeRecord => ({
  id: `outcome-${taskRunId}`,
  task_run_id: taskRunId,
  outcome_signal: "success",
  failure_signature: undefined,
  summary: "Repeated test debug verification",
  created_at: "2026-03-16T10:00:05.000Z",
  ...overrides
});

const review = (taskRunId: string, overrides: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: `review-${taskRunId}`,
  node_id: "node-1",
  task_run_id: taskRunId,
  event_type: "mark_helped",
  source: "user",
  created_at: "2026-03-16T10:00:06.000Z",
  ...overrides
});

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("runOpenClawScenarioEvaluation", () => {
  it("supports dry-run planning without invoking OpenClaw", () => {
    const { env, runtimeDir } = createRuntime();

    const result = runOpenClawScenarioEvaluation({
      env,
      homeDir: runtimeDir,
      pack: "high-confidence",
      repoRoot: "/mnt/d/project/experienceengine",
      dryRun: true,
      now: () => "2026-03-16T10:00:00.000Z"
    });

    expect(result.report.dryRun).toBe(true);
    expect(result.report.scenarios).toHaveLength(5);
    expect(result.report.aggregate.recordsMatched).toBe(0);
  });

  it("joins session ids back to records, candidates, jobs, and injected nodes", () => {
    const { env, runtimeDir, db } = createRuntime();
    const inputRepo = new InputRecordRepository(db);
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    const taskRunRepo = new TaskRunRepository(db);
    const outcomeRepo = new OutcomeRecordRepository(db);
    const reviewRepo = new ReviewEventRepository(db);

    const sessionId = "ee-openclaw-high-confidence-test-debug-a-2026-03-16T10-00-00-000Z";
    const sourceRecord = record(sessionId, {
      task_type: "test_debug",
      task_summary: "Repeated test debug verification"
    });
    const persistedTaskRun = taskRun(sessionId);
    inputRepo.upsert(sourceRecord);
    candidateRepo.upsert(candidate(sourceRecord.record_id));
    jobRepo.upsert(job(`candidate-${sourceRecord.record_id}`));
    nodeRepo.upsert(node());
    taskRunRepo.upsert(persistedTaskRun);
    outcomeRepo.upsert(outcome(persistedTaskRun.id));
    reviewRepo.upsert(review(persistedTaskRun.id));

    const result = runOpenClawScenarioEvaluation({
      env,
      homeDir: runtimeDir,
      pack: "high-confidence",
      repoRoot: "/mnt/d/project/experienceengine",
      outputDir: join(runtimeDir, "artifacts"),
      now: () => "2026-03-16T10:00:00.000Z",
      invoker: () => ({
        exitCode: 0,
        stdout: "{\"ok\":true}",
        stderr: ""
      })
    });

    expect(result.report.scenarios).toHaveLength(5);
    const matched = result.report.scenarios.find((scenario) => scenario.sessionId === sessionId);
    expect(matched?.record?.recordId).toBe(sourceRecord.record_id);
    expect(matched?.candidates).toHaveLength(1);
    expect(matched?.jobs).toHaveLength(1);
    expect(matched?.injectedNodes[0]?.id).toBe("node-1");
    expect(matched?.runtime?.taskRunId).toBe(persistedTaskRun.id);
    expect(matched?.runtime?.outcomeIds).toEqual([`outcome-${persistedTaskRun.id}`]);
    expect(matched?.runtime?.reviewCount).toBe(1);
    expect(result.report.aggregate.recordsMatched).toBe(1);
    expect(result.report.aggregate.scenariosWithCandidates).toBe(1);
    expect(result.report.aggregate.scenariosWithTaskRuns).toBe(1);
    expect(result.report.aggregate.scenariosWithOutcomes).toBe(1);
    expect(result.report.aggregate.scenariosWithReviews).toBe(1);
    expect(result.baselineJsonPath).toBeTruthy();
  });
});
