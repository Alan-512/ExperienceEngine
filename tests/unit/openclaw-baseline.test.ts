import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectOpenClawBaselineSummary,
  renderOpenClawBaselineMarkdown,
  runOpenClawBaselineEvaluation
} from "../../src/evaluation/openclaw-baseline.js";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../../src/store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { InjectionRepository } from "../../src/store/sqlite/repositories/injection-repo.js";
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

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-openclaw-baseline-"));
  tempDirs.push(runtimeDir);
  const env = {
    ...process.env,
    EXPERIENCE_ENGINE_HOME: runtimeDir
  };
  const config = loadConfig(undefined, { env, homeDir: runtimeDir });
  const db = openDatabase(config);
  bootstrapDatabase(db);
  return { runtimeDir, env, db, config };
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
  distillation_mode_used: "rule",
  distillation_source: "rule",
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

const taskRun = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  id: "taskrun_1",
  host: "openclaw",
  scope_id: "scope_1",
  session_id: "session_1",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  prompt_excerpt: "Fix the failing auth test",
  context_summary: "Auth failure in current repo",
  started_at: "2026-03-16T08:00:00.000Z",
  ended_at: "2026-03-16T08:05:00.000Z",
  final_status: "success",
  failure_signature: "Auth spec assertion failed",
  created_at: "2026-03-16T08:00:00.000Z",
  updated_at: "2026-03-16T08:05:00.000Z",
  ...overrides
});

const outcome = (overrides: Partial<OutcomeRecord> = {}): OutcomeRecord => ({
  id: "outcome_1",
  task_run_id: "taskrun_1",
  outcome_signal: "success",
  failure_signature: "Auth spec assertion failed",
  summary: "Fix the failing auth test",
  created_at: "2026-03-16T08:05:00.000Z",
  ...overrides
});

const review = (overrides: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: "review_1",
  node_id: "node_1",
  task_run_id: "taskrun_1",
  event_type: "mark_helped",
  source: "user",
  created_at: "2026-03-16T08:06:00.000Z",
  ...overrides
});

describe("OpenClaw baseline evaluation", () => {
  it("summarizes current persisted learning state", () => {
    const { db, config } = makeDb();
    new InputRecordRepository(db).upsert(record());
    new CandidateRepository(db).upsert(candidate());
    new DistillationJobRepository(db).upsert(job());
    new NodeRepository(db).upsert(node());
    new TaskRunRepository(db).upsert(taskRun());
    new OutcomeRecordRepository(db).upsert(outcome());
    new ReviewEventRepository(db).upsert(review({ source: "automatic" }));
    new InjectionRepository(db).upsert({
      injection_id: "inject_1",
      session_id: "session_1",
      scope_id: "scope_1",
      task_type: "test_debug",
      task_summary: "Fix the failing auth test",
      mode: "inject",
      delivery_mode: "live",
      delivered: true,
      injected_node_ids: ["node_1"],
      injection_count: 1,
      scorecard: {
        scopeId: "scope_1",
        sessionId: "session_1",
        taskType: "test_debug",
        taskSummary: "Fix the failing auth test",
        mode: "inject",
        riskLevel: "low",
        recommendation: "Apply the strongest bug-fix hint.",
        reasons: ["A mature same-family candidate matched strongly."],
        topCandidates: [
          {
            id: "node_1",
            retrievalScore: 0.71,
            policyAdjustment: 0.24,
            totalScore: 0.95,
            taskFamilyMatch: true,
            policyReasons: ["real_dev_alignment:0.0600", "meta_origin_penalty:0.0000"],
            retrievalReasons: ["family:exact"]
          }
        ],
        nodes: [],
        createdAt: "2026-03-16T08:01:00.000Z"
      },
      created_at: "2026-03-16T08:01:00.000Z",
      resolved_at: "2026-03-16T08:05:00.000Z",
      was_successful: true,
      harm_observed: false,
      attribution_reason: "success_outcome"
    });

    const summary = collectOpenClawBaselineSummary(db, config, {
      now: () => "2026-03-16T09:00:00.000Z"
    });

    expect(summary.records.total).toBe(1);
    expect(summary.records.injectionCoverage).toBe(1);
    expect(summary.candidates.distilled).toBe(1);
    expect(summary.candidates.distillationSuccessRate).toBe(1);
    expect(summary.distillationJobs.succeeded).toBe(1);
    expect(summary.nodes.active).toBe(1);
    expect(summary.nodes.bySource.rule).toBe(1);
    expect(summary.nodes.totalHelpedCount).toBe(1);
    expect(summary.effectiveness).toMatchObject({
      decisions: 1,
      live: 1,
      shadow: 0,
      holdout: 0,
      delivered: 1,
      suppressed: 0,
      automaticHelped: 1,
      automaticHarmed: 0
    });
    expect(summary.governance).toMatchObject({
      harmfulOrMisfiredHints: 0,
      metaDominantSelections: 0,
      realDevAlignedSelections: 1
    });
    expect(summary.benchmark).toMatchObject({
      deliveryRate: 1,
      suppressionRate: 0,
      helpfulRate: 1,
      harmfulRate: 0,
      netHelpfulRate: 1,
      verdict: "warming_up",
      suggestedMode: "shadow"
    });
    expect(summary.modeComparison.live).toMatchObject({
      decisions: 1,
      delivered: 1,
      suppressed: 0,
      automaticHelped: 1,
      automaticHarmed: 0,
      netHelpfulRate: 1,
      verdict: "warming_up"
    });
    expect(summary.modeComparison.shadow).toMatchObject({
      decisions: 0,
      delivered: 0,
      suppressed: 0,
      netHelpfulRate: 0,
      verdict: "warming_up"
    });
    expect(summary.attributionReasons).toMatchObject({
      success_outcome: 1,
      relevant_failure: 0,
      environmental_failure: 0,
      exploratory_failure: 0,
      no_relevant_failure: 0,
      suppressed_delivery: 0,
      unknown_outcome: 0
    });
    expect(summary.runtime.taskRuns).toBe(1);
    expect(summary.runtime.outcomes).toBe(1);
    expect(summary.runtime.reviews).toBe(1);
    expect(summary.latest.recordId).toBe("record_1");
    expect(summary.latest.candidateId).toBe("candidate_1");
    expect(summary.latest.nodeId).toBe("node_1");
    expect(summary.latest.nodeDistillationSource).toBe("rule");
    expect(summary.latest.taskRunId).toBe("taskrun_1");
    expect(summary.latest.outcomeId).toBe("outcome_1");
    expect(summary.latest.reviewEventId).toBe("review_1");
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
    expect(markdown).toContain("## Node Sources");
    expect(markdown).toContain("## Effectiveness");
    expect(markdown).toContain("## Benchmark Summary");
    expect(markdown).toContain("- Verdict: warming_up");
    expect(markdown).toContain("- Suggested mode: shadow");
    expect(markdown).toContain("## Governance");
    expect(markdown).toContain("- Harmful or misfired hints: 0");
    expect(markdown).toContain("## Mode Comparison");
    expect(markdown).toContain("- live: decisions=0 delivered=0 suppressed=0 helpful=0 harmed=0 net=0 verdict=warming_up");
    expect(markdown).toContain("## Attribution Reasons");
    expect(markdown).toContain("## Runtime Records");
  });

  it("archives baseline summaries and compares them against the previous run", () => {
    const { runtimeDir, env, db } = makeDb();
    new InputRecordRepository(db).upsert(record());
    new CandidateRepository(db).upsert(candidate());
    new DistillationJobRepository(db).upsert(job());
    new NodeRepository(db).upsert(node());
    new TaskRunRepository(db).upsert(taskRun());
    new OutcomeRecordRepository(db).upsert(outcome());
    new ReviewEventRepository(db).upsert(review({ source: "automatic" }));
    new InjectionRepository(db).upsert({
      injection_id: "inject_1",
      session_id: "session_1",
      scope_id: "scope_1",
      task_type: "test_debug",
      task_summary: "Fix the failing auth test",
      mode: "inject",
      delivery_mode: "live",
      delivered: true,
      injected_node_ids: ["node_1"],
      injection_count: 1,
      created_at: "2026-03-16T08:01:00.000Z",
      resolved_at: "2026-03-16T08:05:00.000Z",
      was_successful: true,
      harm_observed: false,
      attribution_reason: "success_outcome"
    });

    const outputDir = join(runtimeDir, "artifacts", "baseline-run");
    const historyJsonPath = join(runtimeDir, "artifacts", "baseline-history.json");
    mkdirSync(join(runtimeDir, "artifacts"), { recursive: true });
    writeFileSync(
      historyJsonPath,
      JSON.stringify(
        [
          {
            generatedAt: "2026-03-15T09:00:00.000Z",
            verdict: "failing",
            suggestedMode: "holdout",
            netHelpfulRate: -0.25,
            summaryJsonPath: "/tmp/baseline-prev.json",
            summaryMarkdownPath: "/tmp/baseline-prev.md"
          }
        ],
        null,
        2
      )
    );

    const result = runOpenClawBaselineEvaluation({
      env,
      homeDir: runtimeDir,
      outputDir,
      now: () => "2026-03-16T09:00:00.000Z"
    });

    expect(existsSync(result.historyJsonPath!)).toBe(true);
    expect(existsSync(result.historyMarkdownPath!)).toBe(true);
    expect(existsSync(result.benchmarkReportJsonPath!)).toBe(true);
    expect(existsSync(result.benchmarkReportMarkdownPath!)).toBe(true);
    expect(existsSync(result.bundleJsonPath!)).toBe(true);
    expect(existsSync(result.bundleMarkdownPath!)).toBe(true);
    expect(existsSync(result.caseStudyJsonPath!)).toBe(true);
    expect(existsSync(result.caseStudyMarkdownPath!)).toBe(true);
    expect(existsSync(result.caseStudyIndexJsonPath!)).toBe(true);
    expect(existsSync(result.caseStudyIndexMarkdownPath!)).toBe(true);
    expect(existsSync(result.evidencePackageJsonPath!)).toBe(true);
    expect(existsSync(result.evidencePackageMarkdownPath!)).toBe(true);
    expect(result.summary.trend).toMatchObject({
      previousGeneratedAt: "2026-03-15T09:00:00.000Z",
      previousNetHelpfulRate: -0.25,
      deltaNetHelpfulRate: 1.25,
      previousVerdict: "failing",
      previousSuggestedMode: "holdout"
    });
    expect(readFileSync(result.markdownPath, "utf8")).toContain("## Trend vs Previous Run");
    expect(readFileSync(result.markdownPath, "utf8")).toContain("- Net helpful rate delta: 1.25");
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain(
      "- Trend vs previous: net delta=1.25 verdict=failing->warming_up mode=holdout->shadow"
    );
    const history = JSON.parse(readFileSync(result.historyJsonPath!, "utf8"));
    expect(history.at(-1)).toMatchObject({
      caseStudyJsonPath: result.caseStudyJsonPath,
      caseStudyMarkdownPath: result.caseStudyMarkdownPath
    });
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain(`- Case study JSON: ${result.caseStudyJsonPath}`);
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain(`- Case study Markdown: ${result.caseStudyMarkdownPath}`);
    expect(readFileSync(result.benchmarkReportMarkdownPath!, "utf8")).toContain("# ExperienceEngine Benchmark Report");
    expect(readFileSync(result.benchmarkReportMarkdownPath!, "utf8")).toContain("- Recommended next mode: shadow");
    expect(readFileSync(result.bundleMarkdownPath!, "utf8")).toContain("# ExperienceEngine Evaluation Bundle");
    expect(readFileSync(result.bundleMarkdownPath!, "utf8")).toContain("- Kind: openclaw-baseline");
    expect(readFileSync(result.caseStudyMarkdownPath!, "utf8")).toContain("# ExperienceEngine Case Study");
    expect(readFileSync(result.caseStudyMarkdownPath!, "utf8")).toContain("## Recommendation");
    expect(readFileSync(result.caseStudyIndexMarkdownPath!, "utf8")).toContain("# ExperienceEngine Case Study Index");
    expect(readFileSync(result.caseStudyIndexMarkdownPath!, "utf8")).toContain("- Kind: openclaw-baseline");
    expect(readFileSync(result.evidencePackageMarkdownPath!, "utf8")).toContain("# ExperienceEngine Evidence Package");
    expect(readFileSync(result.evidencePackageMarkdownPath!, "utf8")).toContain("## Included Artifacts");
    expect(JSON.parse(readFileSync(result.caseStudyIndexJsonPath!, "utf8"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "openclaw-baseline",
          caseStudyJsonPath: result.caseStudyJsonPath,
          caseStudyMarkdownPath: result.caseStudyMarkdownPath
        })
      ])
    );
    expect(JSON.parse(readFileSync(result.evidencePackageJsonPath!, "utf8"))).toMatchObject({
      kind: "openclaw-baseline",
      recommendation: expect.objectContaining({
        suggestedMode: "shadow"
      }),
      artifacts: expect.objectContaining({
        caseStudyJson: result.caseStudyJsonPath,
        caseStudyIndexJson: result.caseStudyIndexJsonPath
      })
    });
  });

  it("ignores malformed historical scorecards when deriving governance counters", () => {
    const { db, config } = makeDb();
    new InputRecordRepository(db).upsert(record());
    new InjectionRepository(db).upsert({
      injection_id: "inject_1",
      session_id: "session_1",
      scope_id: "scope_1",
      task_type: "test_debug",
      task_summary: "Fix the failing auth test",
      mode: "inject",
      delivery_mode: "live",
      delivered: true,
      injected_node_ids: ["node_1"],
      injection_count: 1,
      created_at: "2026-03-16T08:01:00.000Z",
      resolved_at: "2026-03-16T08:05:00.000Z",
      was_successful: true,
      harm_observed: false,
      attribution_reason: "success_outcome",
      scorecard: {
        scopeId: "scope_1",
        sessionId: "session_1",
        taskType: "test_debug",
        taskSummary: "Fix the failing auth test",
        mode: "inject",
        riskLevel: "low",
        recommendation: "Apply the strongest bug-fix hint.",
        reasons: ["A mature same-family candidate matched strongly."],
        topCandidates: [
          {
            id: "node_1",
            retrievalScore: 0.71,
            policyAdjustment: 0.24,
            totalScore: 0.95,
            taskFamilyMatch: true,
            policyReasons: ["real_dev_alignment:0.0600"],
            retrievalReasons: ["family:exact"]
          }
        ],
        nodes: [],
        createdAt: "2026-03-16T08:01:00.000Z"
      }
    });
    db.prepare("UPDATE injection_events SET scorecard_json = ? WHERE injection_id = ?").run("{not-json", "inject_1");

    const summary = collectOpenClawBaselineSummary(db, config, {
      now: () => "2026-03-16T09:00:00.000Z"
    });

    expect(summary.effectiveness.decisions).toBe(1);
    expect(summary.governance).toMatchObject({
      harmfulOrMisfiredHints: 0,
      metaDominantSelections: 0,
      realDevAlignedSelections: 0
    });
  });
});
