import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { collectOpenClawBaselineSummary, renderOpenClawBaselineMarkdown } from "../../src/evaluation/openclaw-baseline.js";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../../src/store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type {
  DistillationJob,
  ExperienceCandidate,
  ExperienceInputRecord,
  ExperienceNode
} from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-openclaw-baseline-"));
  tempDirs.push(runtimeDir);
  const config = loadConfig({
    dataDir: runtimeDir,
    sqlitePath: join(runtimeDir, "experienceengine.db"),
    captureDir: join(runtimeDir, "captures")
  });
  const db = openDatabase(config);
  bootstrapDatabase(db);
  return { db, config };
};

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const record = (overrides: Partial<ExperienceInputRecord> = {}): ExperienceInputRecord => ({
  record_id: "record_1",
  scope_id: "scope_1",
  session_id: "session_1",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  outcome_signal: "success",
  context_summary: "Auth failure in current repo",
  evidence: ["vitest: auth spec passed"],
  injected_node_ids: ["node_1"],
  created_at: "2026-03-16T08:00:00.000Z",
  ...overrides
});

const candidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_1",
  source_record_id: "record_1",
  scope_id: "scope_1",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix the failing auth test",
  compact_hint: "Keep vitest as the terminal verification loop.",
  success_signal: "vitest auth spec passes",
  evidence_summary: "vitest passed",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_signal: {
    task_summary: "Fix the failing auth test",
    context_summary: "Auth failure in current repo",
    outcome_signal: "success",
    tool_events: [],
    evidence: ["vitest: auth spec passed"],
    failure_signature: "Auth spec assertion failed",
    retry_count: 1,
    correction_signals: ["apply_patch"],
    tool_event_summary: ["failure: vitest failed: Auth spec assertion failed", "success: vitest succeeded"]
  },
  lifecycle_state: "distilled",
  retry_count: 1,
  created_at: "2026-03-16T08:00:00.000Z",
  updated_at: "2026-03-16T08:05:00.000Z",
  distilled_node_id: "node_1",
  distilled_at: "2026-03-16T08:05:00.000Z",
  ...overrides
});

const job = (overrides: Partial<DistillationJob> = {}): DistillationJob => ({
  id: "job_1",
  candidate_id: "candidate_1",
  status: "succeeded",
  extractor_profile: "balanced",
  retry_count: 1,
  created_at: "2026-03-16T08:00:00.000Z",
  updated_at: "2026-03-16T08:05:00.000Z",
  started_at: "2026-03-16T08:01:00.000Z",
  finished_at: "2026-03-16T08:05:00.000Z",
  ...overrides
});

const node = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_1",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing auth test",
  compact_hint: "Keep vitest as the terminal verification loop.",
  success_signal: "vitest auth spec passes",
  evidence_summary: "vitest passed",
  source_kind: "system_derived",
  origin_record_ids: ["record_1"],
  helped_record_ids: ["record_1"],
  harmed_record_ids: [],
  state: "active",
  usage_count: 1,
  helped_count: 1,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-03-16T08:05:00.000Z",
  updated_at: "2026-03-16T08:05:00.000Z",
  ...overrides
});

describe("OpenClaw baseline evaluation", () => {
  it("summarizes current persisted learning state", () => {
    const { db, config } = makeDb();
    new InputRecordRepository(db).upsert(record());
    new CandidateRepository(db).upsert(candidate());
    new DistillationJobRepository(db).upsert(job());
    new NodeRepository(db).upsert(node());

    const summary = collectOpenClawBaselineSummary(db, config, {
      now: () => "2026-03-16T09:00:00.000Z"
    });

    expect(summary.records.total).toBe(1);
    expect(summary.records.injectionCoverage).toBe(1);
    expect(summary.candidates.distilled).toBe(1);
    expect(summary.candidates.distillationSuccessRate).toBe(1);
    expect(summary.distillationJobs.succeeded).toBe(1);
    expect(summary.nodes.active).toBe(1);
    expect(summary.nodes.totalHelpedCount).toBe(1);
    expect(summary.latest.recordId).toBe("record_1");
    expect(summary.latest.candidateId).toBe("candidate_1");
    expect(summary.latest.nodeId).toBe("node_1");
  });

  it("renders markdown snapshots for operators", () => {
    const { db, config } = makeDb();
    new InputRecordRepository(db).upsert(record());
    const summary = collectOpenClawBaselineSummary(db, config, {
      now: () => "2026-03-16T09:00:00.000Z"
    });

    const markdown = renderOpenClawBaselineMarkdown(summary);

    expect(markdown).toContain("# OpenClaw Baseline Snapshot");
    expect(markdown).toContain("- Total: 1");
    expect(markdown).toContain("- Adapter: openclaw");
  });
});
