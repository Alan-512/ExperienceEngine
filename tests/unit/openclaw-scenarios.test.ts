import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runOpenClawScenarioEvaluation } from "../../src/evaluation/openclaw-scenarios.js";
import { loadConfig } from "../../src/config/load-config.js";
import { openDatabase, bootstrapDatabase } from "../../src/store/sqlite/db.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { InjectionRepository } from "../../src/store/sqlite/repositories/injection-repo.js";
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
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const createRuntime = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-openclaw-scenarios-"));
  tempDirs.push(runtimeDir);
  const env: NodeJS.ProcessEnv = {
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
  distillation_mode_used: "rule",
  distillation_source: "rule",
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
    removeTempDirForTests(tempDirs.pop()!);
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

  it("applies a hard timeout to the default OpenClaw invoker", () => {
    const { env, runtimeDir } = createRuntime();
    const binDir = join(runtimeDir, "bin");
    const fakeOpenClaw = join(binDir, process.platform === "win32" ? "openclaw.cmd" : "openclaw");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      fakeOpenClaw,
      process.platform === "win32"
        ? "@echo off\r\nnode -e \"setTimeout(() => console.log('{\\\"ok\\\":true}'), 2000)\"\r\n"
        : "#!/usr/bin/env bash\nsleep 2\nprintf '{\"ok\":true}\\n'\n",
      "utf8"
    );
    if (process.platform !== "win32") {
      chmodSync(fakeOpenClaw, 0o755);
    }

    const result = runOpenClawScenarioEvaluation({
      env: {
        ...env,
        PATH: `${binDir}${process.platform === "win32" ? ";" : ":"}${env.PATH ?? ""}`
      },
      homeDir: runtimeDir,
      pack: "high-confidence",
      repoRoot: "/mnt/d/project/experienceengine",
      outputDir: join(runtimeDir, "artifacts"),
      now: () => "2026-03-16T10:00:00.000Z",
      invokerTimeoutMs: 10
    });

    expect(result.report.scenarios[0]?.cli.exitCode).toBe(124);
    expect(result.report.scenarios[0]?.cli.parsed).toBe(false);
    expect(result.report.scenarios[0]?.cli.stderr).toContain("timed out after 10ms");
  });

  it("joins session ids back to records, candidates, jobs, and injected nodes", () => {
    const { env, runtimeDir, db } = createRuntime();
    const inputRepo = new InputRecordRepository(db);
    const candidateRepo = new CandidateRepository(db);
    const injectionRepo = new InjectionRepository(db);
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
    injectionRepo.upsert({
      injection_id: `inject-${sessionId}`,
      session_id: sessionId,
      scope_id: "scope_repo",
      task_type: "test_debug",
      task_summary: "Repeated test debug verification",
      mode: "inject",
      delivery_mode: "shadow",
      delivered: false,
      injected_node_ids: ["node-1"],
      injection_count: 1,
      created_at: "2026-03-16T10:00:01.000Z",
      resolved_at: "2026-03-16T10:00:05.000Z",
      was_successful: true,
      harm_observed: false,
      attribution_reason: "suppressed_delivery"
    });
    candidateRepo.upsert(candidate(sourceRecord.record_id));
    jobRepo.upsert(job(`candidate-${sourceRecord.record_id}`));
    nodeRepo.upsert(node());
    taskRunRepo.upsert(persistedTaskRun);
    outcomeRepo.upsert(outcome(persistedTaskRun.id));
    reviewRepo.upsert(review(persistedTaskRun.id, { source: "automatic" }));

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
    expect(matched?.injectedNodes[0]?.distillationSource).toBe("rule");
    expect(matched?.runtime?.taskRunId).toBe(persistedTaskRun.id);
    expect(matched?.runtime?.deliveryMode).toBe("shadow");
    expect(matched?.runtime?.delivered).toBe(false);
    expect(matched?.runtime?.automaticFeedback).toBe("helped");
    expect(matched?.runtime?.outcomeIds).toEqual([`outcome-${persistedTaskRun.id}`]);
    expect(matched?.runtime?.reviewCount).toBe(1);
    expect(result.report.aggregate.recordsMatched).toBe(1);
    expect(result.report.aggregate.scenariosWithCandidates).toBe(1);
    expect(result.report.aggregate.scenariosWithTaskRuns).toBe(1);
    expect(result.report.aggregate.scenariosWithOutcomes).toBe(1);
    expect(result.report.aggregate.scenariosWithReviews).toBe(1);
    expect(result.report.aggregate.injectedNodeSources.rule).toBe(1);
    expect(result.report.aggregate.effectiveness).toMatchObject({
      decisions: 1,
      live: 0,
      shadow: 1,
      holdout: 0,
      delivered: 0,
      suppressed: 1,
      automaticHelped: 1,
      automaticHarmed: 0
    });
    expect(result.report.aggregate.benchmark).toMatchObject({
      deliveryRate: 0,
      suppressionRate: 1,
      helpfulRate: 1,
      harmfulRate: 0,
      netHelpfulRate: 1,
      verdict: "warming_up",
      suggestedMode: "shadow"
    });
    expect(result.report.aggregate.modeComparison.shadow).toMatchObject({
      decisions: 1,
      delivered: 0,
      suppressed: 1,
      automaticHelped: 1,
      automaticHarmed: 0,
      netHelpfulRate: 1,
      verdict: "warming_up"
    });
    expect(result.report.aggregate.attributionReasons).toMatchObject({
      success_outcome: 0,
      relevant_failure: 0,
      environmental_failure: 0,
      exploratory_failure: 0,
      no_relevant_failure: 0,
      suppressed_delivery: 1,
      unknown_outcome: 0
    });
    expect(result.baselineJsonPath).toBeTruthy();
    expect(result.summaryJsonPath).toBeTruthy();
    expect(result.summaryMarkdownPath).toBeTruthy();
    expect(result.historyJsonPath).toBeTruthy();
    expect(result.historyMarkdownPath).toBeTruthy();
    expect(result.benchmarkReportJsonPath).toBeTruthy();
    expect(result.benchmarkReportMarkdownPath).toBeTruthy();
    expect(result.bundleJsonPath).toBeTruthy();
    expect(result.bundleMarkdownPath).toBeTruthy();
    expect(result.caseStudyJsonPath).toBeTruthy();
    expect(result.caseStudyMarkdownPath).toBeTruthy();
    expect(result.caseStudyIndexJsonPath).toBeTruthy();
    expect(result.caseStudyIndexMarkdownPath).toBeTruthy();
    expect(result.evidencePackageJsonPath).toBeTruthy();
    expect(result.evidencePackageMarkdownPath).toBeTruthy();
    expect(existsSync(result.summaryJsonPath!)).toBe(true);
    expect(existsSync(result.summaryMarkdownPath!)).toBe(true);
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
    expect(readFileSync(result.summaryMarkdownPath!, "utf8")).toContain("# OpenClaw Evaluation Summary");
    expect(readFileSync(result.summaryMarkdownPath!, "utf8")).toContain("- Suggested mode: shadow");
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain("# OpenClaw Evaluation History");
    expect(readFileSync(result.benchmarkReportMarkdownPath!, "utf8")).toContain("# ExperienceEngine Benchmark Report");
    expect(readFileSync(result.benchmarkReportMarkdownPath!, "utf8")).toContain("- Recommended next mode: shadow");
    expect(readFileSync(result.bundleMarkdownPath!, "utf8")).toContain("# ExperienceEngine Evaluation Bundle");
    expect(readFileSync(result.bundleMarkdownPath!, "utf8")).toContain("- Kind: openclaw-scenarios");
    expect(readFileSync(result.caseStudyMarkdownPath!, "utf8")).toContain("# ExperienceEngine Case Study");
    expect(readFileSync(result.caseStudyMarkdownPath!, "utf8")).toContain("## Recommendation");
    expect(readFileSync(result.caseStudyIndexMarkdownPath!, "utf8")).toContain("# ExperienceEngine Case Study Index");
    expect(readFileSync(result.caseStudyIndexMarkdownPath!, "utf8")).toContain("- Kind: openclaw-scenarios");
    expect(readFileSync(result.evidencePackageMarkdownPath!, "utf8")).toContain("# ExperienceEngine Evidence Package");
    expect(readFileSync(result.evidencePackageMarkdownPath!, "utf8")).toContain("## Included Artifacts");
    expect(JSON.parse(readFileSync(result.historyJsonPath!, "utf8"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedAt: "2026-03-16T10:00:00.000Z",
          caseStudyJsonPath: result.caseStudyJsonPath,
          caseStudyMarkdownPath: result.caseStudyMarkdownPath,
          suggestedMode: "shadow",
          verdict: "warming_up"
        })
      ])
    );
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain(`- Case study JSON: ${result.caseStudyJsonPath}`);
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain(`- Case study Markdown: ${result.caseStudyMarkdownPath}`);
  });

  it("compares the latest evaluation against the previous archived summary", () => {
    const { env, runtimeDir, db } = createRuntime();
    const inputRepo = new InputRecordRepository(db);
    const candidateRepo = new CandidateRepository(db);
    const injectionRepo = new InjectionRepository(db);
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
    injectionRepo.upsert({
      injection_id: `inject-${sessionId}`,
      session_id: sessionId,
      scope_id: "scope_repo",
      task_type: "test_debug",
      task_summary: "Repeated test debug verification",
      mode: "inject",
      delivery_mode: "live",
      delivered: true,
      injected_node_ids: ["node-1"],
      injection_count: 1,
      created_at: "2026-03-16T10:00:01.000Z",
      resolved_at: "2026-03-16T10:00:05.000Z",
      was_successful: true,
      harm_observed: false,
      attribution_reason: "success_outcome"
    });
    candidateRepo.upsert(candidate(sourceRecord.record_id));
    jobRepo.upsert(job(`candidate-${sourceRecord.record_id}`));
    nodeRepo.upsert(node());
    taskRunRepo.upsert(persistedTaskRun);
    outcomeRepo.upsert(outcome(persistedTaskRun.id));
    reviewRepo.upsert(review(persistedTaskRun.id, { source: "automatic" }));

    const outputDir = join(runtimeDir, "artifacts", "run-2");
    const historyJsonPath = join(runtimeDir, "artifacts", "evaluation-history.json");
    mkdirSync(join(runtimeDir, "artifacts"), { recursive: true });
    writeFileSync(
      historyJsonPath,
      JSON.stringify(
        [
          {
            generatedAt: "2026-03-15T10:00:00.000Z",
            pack: "high-confidence",
            repoRoot: "/mnt/d/project/experienceengine",
            verdict: "failing",
            suggestedMode: "holdout",
            netHelpfulRate: -0.5,
            summaryJsonPath: "/tmp/prev-summary.json",
            summaryMarkdownPath: "/tmp/prev-summary.md"
          }
        ],
        null,
        2
      )
    );

    const result = runOpenClawScenarioEvaluation({
      env,
      homeDir: runtimeDir,
      pack: "high-confidence",
      repoRoot: "/mnt/d/project/experienceengine",
      outputDir,
      now: () => "2026-03-16T10:00:00.000Z",
      invoker: () => ({
        exitCode: 0,
        stdout: "{\"ok\":true}",
        stderr: ""
      })
    });

    const summary = JSON.parse(readFileSync(result.summaryJsonPath!, "utf8"));
    expect(summary.trend).toMatchObject({
      previousGeneratedAt: "2026-03-15T10:00:00.000Z",
      previousNetHelpfulRate: -0.5,
      deltaNetHelpfulRate: 1.5,
      previousVerdict: "failing",
      previousSuggestedMode: "holdout"
    });
    expect(readFileSync(result.summaryMarkdownPath!, "utf8")).toContain("## Trend vs Previous Run");
    expect(readFileSync(result.summaryMarkdownPath!, "utf8")).toContain("- Net helpful rate delta: 1.5");
    expect(JSON.parse(readFileSync(result.benchmarkReportJsonPath!, "utf8"))).toMatchObject({
      benchmark: expect.objectContaining({
        suggestedMode: "shadow",
        verdict: "warming_up"
      }),
      trend: expect.objectContaining({
        deltaNetHelpfulRate: 1.5
      })
    });
    expect(JSON.parse(readFileSync(result.bundleJsonPath!, "utf8"))).toMatchObject({
      kind: "openclaw-scenarios",
      benchmark: expect.objectContaining({
        suggestedMode: "shadow"
      }),
      trend: expect.objectContaining({
        deltaNetHelpfulRate: 1.5
      })
    });
    expect(JSON.parse(readFileSync(result.caseStudyJsonPath!, "utf8"))).toMatchObject({
      kind: "openclaw-scenarios",
      benchmark: expect.objectContaining({
        suggestedMode: "shadow"
      }),
      recommendation: expect.objectContaining({
        suggestedMode: "shadow"
      })
    });
    expect(JSON.parse(readFileSync(result.caseStudyIndexJsonPath!, "utf8"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "openclaw-scenarios",
          caseStudyJsonPath: result.caseStudyJsonPath,
          caseStudyMarkdownPath: result.caseStudyMarkdownPath
        })
      ])
    );
    expect(JSON.parse(readFileSync(result.evidencePackageJsonPath!, "utf8"))).toMatchObject({
      kind: "openclaw-scenarios",
      recommendation: expect.objectContaining({
        suggestedMode: "shadow"
      }),
      artifacts: expect.objectContaining({
        caseStudyJson: result.caseStudyJsonPath,
        caseStudyIndexJson: result.caseStudyIndexJsonPath
      })
    });

    const history = JSON.parse(readFileSync(result.historyJsonPath!, "utf8"));
    expect(history.at(-1)).toMatchObject({
      generatedAt: "2026-03-16T10:00:00.000Z",
      caseStudyJsonPath: result.caseStudyJsonPath,
      caseStudyMarkdownPath: result.caseStudyMarkdownPath,
      verdict: "warming_up",
      suggestedMode: "shadow",
      trend: expect.objectContaining({
        previousGeneratedAt: "2026-03-15T10:00:00.000Z",
        deltaNetHelpfulRate: 1.5
      })
    });
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain("- Trend vs previous: net delta=1.5 verdict=failing->warming_up mode=holdout->shadow");
    expect(readFileSync(result.historyMarkdownPath!, "utf8")).toContain(`- Case study JSON: ${result.caseStudyJsonPath}`);
  });
});
