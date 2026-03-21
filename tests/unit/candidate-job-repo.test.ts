import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../../src/store/sqlite/repositories/distillation-job-repo.js";
import type { DistillationJob, ExperienceCandidate } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-candidate-job-repo-"));
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

const candidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_auth_fix",
  task_run_id: "taskrun_auth_fix",
  candidate_kind: "successful_fix",
  source_record_id: "input_auth_fix",
  scope_id: "scope_1",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix the failing auth vitest",
  applicability_notes: "Use when the same auth test remains the terminal check.",
  env_signature: undefined,
  compact_hint: "Use vitest as the terminal verification loop for the auth failure.",
  goal: "Keep the auth test in a tight reproduction loop.",
  recommended_steps: ["Run vitest before editing", "Rerun vitest after the smallest fix"],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "vitest passes for the auth spec",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "Terminal sequence: vitest passed.",
  retrieval_text: "Fix the failing auth vitest\nvitest passed",
  source_kind: "system_derived",
  experience_kind: "expectation_correction",
  confidence_signal: "supported_by_objective_success",
  validation_state: "pending_reuse_validation",
  correction_scope: "repo_local",
  correction_category: "verification_order",
  deviation_pattern: "verification happened too late",
  corrected_constraint: "Run the targeted verification before broad edits.",
  source_context_summary: "Auth test failure in the current workspace.",
  source_outcome_signal: "success",
  raw_summary: "Auth vitest failed once, then passed after a narrow edit.",
  failure_signature: "Auth spec assertion failed",
  source_signal: {
    task_summary: "Fix the failing auth vitest",
    context_summary: "Auth test failure in the current workspace.",
    outcome_signal: "success",
    tool_events: [
      {
        event_id: "tool_1",
        tool_name: "vitest",
        status: "success",
        output_summary: "Auth spec now passes.",
        started_at: "2026-03-15T10:00:00.000Z"
      }
    ],
    evidence: ["vitest: success: Auth spec now passes."],
    failure_signature: "Auth spec assertion failed",
    retry_count: 1,
    correction_signals: ["apply_patch"],
    tool_event_summary: ["failure: vitest failed: Auth spec assertion failed", "success: vitest succeeded"]
  },
  lifecycle_state: "pending",
  retry_count: 0,
  distilled_node_id: undefined,
  last_error: undefined,
  created_at: "2026-03-15T10:00:00.000Z",
  updated_at: "2026-03-15T10:00:00.000Z",
  distilled_at: undefined,
  discarded_at: undefined,
  last_failed_at: undefined,
  ...overrides
});

const distillationJob = (overrides: Partial<DistillationJob> = {}): DistillationJob => ({
  id: "job_auth_fix",
  candidate_id: "candidate_auth_fix",
  status: "pending",
  extractor_profile: "balanced",
  distillation_source: "rule",
  failure_bucket: undefined,
  retry_count: 0,
  last_error: undefined,
  created_at: "2026-03-15T10:00:00.000Z",
  updated_at: "2026-03-15T10:00:00.000Z",
  started_at: undefined,
  finished_at: undefined,
  discarded_at: undefined,
  ...overrides
});

describe("CandidateRepository", () => {
  it("persists first-class candidates with lifecycle state and raw signals", () => {
    const db = makeDb();
    const repo = new CandidateRepository(db);

    repo.upsert(candidate());

    const stored = repo.getById("candidate_auth_fix");

    expect(stored?.lifecycle_state).toBe("pending");
    expect(stored?.task_run_id).toBe("taskrun_auth_fix");
    expect(stored?.candidate_kind).toBe("successful_fix");
    expect(stored?.raw_summary).toBe("Auth vitest failed once, then passed after a narrow edit.");
    expect(stored?.failure_signature).toBe("Auth spec assertion failed");
    expect(stored?.source_record_id).toBe("input_auth_fix");
    expect(stored?.experience_kind).toBe("expectation_correction");
    expect(stored?.confidence_signal).toBe("supported_by_objective_success");
    expect(stored?.validation_state).toBe("pending_reuse_validation");
    expect(stored?.correction_scope).toBe("repo_local");
    expect(stored?.correction_category).toBe("verification_order");
    expect(stored?.deviation_pattern).toBe("verification happened too late");
    expect(stored?.corrected_constraint).toBe("Run the targeted verification before broad edits.");
    expect(stored?.source_signal.task_summary).toBe("Fix the failing auth vitest");
    expect(stored?.source_signal.tool_events[0]?.tool_name).toBe("vitest");
    expect(stored?.recommended_steps).toEqual([
      "Run vitest before editing",
      "Rerun vitest after the smallest fix"
    ]);
  });

  it("tracks distilled, failed, and discarded lifecycle states with retry metadata", () => {
    const db = makeDb();
    const repo = new CandidateRepository(db);

    repo.upsert(candidate());
    repo.upsert(
      candidate({
        lifecycle_state: "failed",
        retry_count: 1,
        last_error: "Model timeout",
        last_failed_at: "2026-03-15T10:05:00.000Z",
        updated_at: "2026-03-15T10:05:00.000Z"
      })
    );
    repo.upsert(
      candidate({
        id: "candidate_auth_fix_distilled",
        lifecycle_state: "distilled",
        distilled_node_id: "node_auth_fix",
        distilled_at: "2026-03-15T10:06:00.000Z",
        updated_at: "2026-03-15T10:06:00.000Z"
      })
    );
    repo.upsert(
      candidate({
        id: "candidate_auth_fix_discarded",
        lifecycle_state: "discarded",
        retry_count: 3,
        last_error: "Retry budget exhausted",
        discarded_at: "2026-03-15T10:07:00.000Z",
        updated_at: "2026-03-15T10:07:00.000Z"
      })
    );

    expect(repo.listByLifecycleState("failed")).toHaveLength(1);
    expect(repo.listByLifecycleState("distilled")[0]?.distilled_node_id).toBe("node_auth_fix");
    expect(repo.listByLifecycleState("discarded")[0]?.retry_count).toBe(3);
  });
});

describe("DistillationJobRepository", () => {
  it("persists distillation jobs and status transitions", () => {
    const db = makeDb();
    const repo = new DistillationJobRepository(db);

    repo.upsert(distillationJob());
    repo.upsert(
      distillationJob({
        status: "processing",
        started_at: "2026-03-15T10:01:00.000Z",
        updated_at: "2026-03-15T10:01:00.000Z"
      })
    );
    repo.upsert(
      distillationJob({
        id: "job_auth_fix_failed",
        status: "failed",
        failure_bucket: "endpoint_request_failed",
        retry_count: 1,
        last_error: "Model timeout",
        finished_at: "2026-03-15T10:02:00.000Z",
        updated_at: "2026-03-15T10:02:00.000Z"
      })
    );
    repo.upsert(
      distillationJob({
        id: "job_auth_fix_discarded",
        status: "discarded",
        retry_count: 3,
        last_error: "Retry budget exhausted",
        discarded_at: "2026-03-15T10:03:00.000Z",
        updated_at: "2026-03-15T10:03:00.000Z"
      })
    );

    expect(repo.getById("job_auth_fix")?.status).toBe("processing");
    expect(repo.getById("job_auth_fix")?.distillation_source).toBe("rule");
    expect(repo.listByStatus("failed")[0]?.last_error).toBe("Model timeout");
    expect(repo.listByStatus("failed")[0]?.failure_bucket).toBe("endpoint_request_failed");
    expect(repo.listByStatus("discarded")[0]?.retry_count).toBe(3);
  });
});
