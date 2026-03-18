import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../config/load-config.js";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { openDatabase, bootstrapDatabase } from "../store/sqlite/db.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { OutcomeRecordRepository } from "../store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import { runOpenClawBaselineEvaluation, type OpenClawBaselineSummary } from "./openclaw-baseline.js";
import {
  buildBenchmarkSummary,
  buildModeBenchmarkSummary,
  type BenchmarkSummary,
  type ModeBenchmarkSummary
} from "./benchmark-summary.js";
import {
  renderBenchmarkReportMarkdown,
  renderCaseStudyMarkdown,
  renderCaseStudyIndexMarkdown,
  renderEvidencePackageMarkdown,
  renderEvaluationBundleMarkdown,
  type BenchmarkReport,
  type CaseStudyIndexEntry,
  type CaseStudyReport,
  type EvidencePackage
} from "./benchmark-report.js";
import type {
  DistillationSource,
  DistillationJob,
  ExperienceCandidate,
  ExperienceInputRecord,
  ExperienceNode,
  FeedbackAttributionReason,
  ResolvedTaskType
} from "../types/domain.js";

export type OpenClawScenarioPackName = "high-confidence";

export type OpenClawScenarioDefinition = {
  id: string;
  title: string;
  expectedTaskType: ResolvedTaskType;
  prompt(repoRoot: string): string;
};

export type OpenClawScenarioInvocation = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type OpenClawScenarioExecution = {
  scenarioId: string;
  title: string;
  expectedTaskType: ResolvedTaskType;
  sessionId: string;
  rawPath?: string;
  cli: {
    exitCode: number;
    parsed: boolean;
    stderr?: string;
  };
  record?: {
    recordId: string;
    taskType: ResolvedTaskType;
    outcome: ExperienceInputRecord["outcome_signal"];
    injectedNodeIds: string[];
    createdAt: string;
    summary: string;
  };
  candidates: Array<{
    id: string;
    lifecycle: ExperienceCandidate["lifecycle_state"];
    nodeType: ExperienceCandidate["node_type"];
    retryCount: number;
    distilledNodeId?: string;
  }>;
  jobs: Array<{
    id: string;
    status: DistillationJob["status"];
    retryCount: number;
    candidateId: string;
  }>;
  injectedNodes: Array<{
    id: string;
    state: ExperienceNode["state"];
    hint: string;
    distillationSource?: DistillationSource;
  }>;
  runtime?: {
    taskRunId?: string;
    finalStatus?: string;
    deliveryMode?: "live" | "shadow" | "holdout";
    delivered?: boolean;
    automaticFeedback?: "helped" | "harmed" | "none";
    attributionReason?: FeedbackAttributionReason;
    outcomeIds: string[];
    reviewCount: number;
  };
};

export type OpenClawScenarioReport = {
  generatedAt: string;
  pack: OpenClawScenarioPackName;
  repoRoot: string;
  sqlitePath: string;
  captureDir: string;
  outputDir: string;
  dryRun: boolean;
  scenarios: OpenClawScenarioExecution[];
  aggregate: {
    total: number;
    recordsMatched: number;
    scenariosWithCandidates: number;
    scenariosWithDistilledCandidates: number;
    scenariosWithInjectedNodes: number;
    scenariosWithTaskRuns: number;
    scenariosWithOutcomes: number;
    scenariosWithReviews: number;
    successfulRecords: number;
    failedRecords: number;
    unknownRecords: number;
    injectedNodeSources: Record<DistillationSource, number>;
    effectiveness: {
      decisions: number;
      live: number;
      shadow: number;
      holdout: number;
      delivered: number;
      suppressed: number;
      automaticHelped: number;
      automaticHarmed: number;
    };
    attributionReasons: Record<FeedbackAttributionReason, number>;
    benchmark: BenchmarkSummary;
    modeComparison: {
      live: ModeBenchmarkSummary;
      shadow: ModeBenchmarkSummary;
      holdout: ModeBenchmarkSummary;
    };
  };
  baseline?: OpenClawBaselineSummary;
};

export type OpenClawScenarioRunResult = {
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
  baselineJsonPath?: string;
  baselineMarkdownPath?: string;
  summary?: OpenClawEvaluationSummary;
  summaryJsonPath?: string;
  summaryMarkdownPath?: string;
  historyJsonPath?: string;
  historyMarkdownPath?: string;
  benchmarkReportJsonPath?: string;
  benchmarkReportMarkdownPath?: string;
  bundleJsonPath?: string;
  bundleMarkdownPath?: string;
  caseStudyJsonPath?: string;
  caseStudyMarkdownPath?: string;
  caseStudyIndexJsonPath?: string;
  caseStudyIndexMarkdownPath?: string;
  evidencePackageJsonPath?: string;
  evidencePackageMarkdownPath?: string;
  report: OpenClawScenarioReport;
};

type OpenClawEvaluationTrend = {
  previousGeneratedAt: string;
  previousNetHelpfulRate: number;
  deltaNetHelpfulRate: number;
  previousVerdict: BenchmarkSummary["verdict"];
  previousSuggestedMode: BenchmarkSummary["suggestedMode"];
};

type OpenClawEvaluationSummary = {
  generatedAt: string;
  pack: OpenClawScenarioPackName;
  repoRoot: string;
  benchmark: BenchmarkSummary;
  modeComparison: OpenClawScenarioReport["aggregate"]["modeComparison"];
  effectiveness: OpenClawScenarioReport["aggregate"]["effectiveness"];
  trend?: OpenClawEvaluationTrend;
  baseline?: Pick<OpenClawBaselineSummary, "records" | "candidates" | "nodes" | "runtime" | "benchmark">;
};

type OpenClawEvaluationHistoryEntry = {
  generatedAt: string;
  pack: OpenClawScenarioPackName;
  repoRoot: string;
  verdict: BenchmarkSummary["verdict"];
  suggestedMode: BenchmarkSummary["suggestedMode"];
  netHelpfulRate: number;
  summaryJsonPath: string;
  summaryMarkdownPath: string;
  caseStudyJsonPath?: string;
  caseStudyMarkdownPath?: string;
  trend?: OpenClawEvaluationTrend;
};

type RunOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  outputDir?: string;
  pack?: OpenClawScenarioPackName;
  repoRoot?: string;
  dryRun?: boolean;
  invoker?: (args: string[]) => OpenClawScenarioInvocation;
  now?: () => string;
};

const sanitizeStamp = (value: string): string => value.replace(/[:.]/g, "-");

const mkdirIfMissing = (path: string): void => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
};

const defaultOutputDir = (): string =>
  resolve("artifacts", "evaluations", "openclaw", sanitizeStamp(new Date().toISOString()));

const defaultInvoker = (args: string[]): OpenClawScenarioInvocation => {
  const result = spawnSync("openclaw", args, {
    encoding: "utf8"
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
};

const scenarioPromptPreamble = (repoRoot: string): string =>
  `This is a read-only repository verification task. In the current workspace, first run \`cd ${repoRoot}\` and only then continue with the requested commands. Do not modify any files.`;

export const getOpenClawScenarioPack = (
  pack: OpenClawScenarioPackName,
  repoRoot: string
): OpenClawScenarioDefinition[] => {
  if (pack !== "high-confidence") {
    throw new Error(`Unsupported OpenClaw scenario pack: ${pack}`);
  }

  return [
    {
      id: "repo-root-sanity",
      title: "Repo root sanity",
      expectedTaskType: "general",
      prompt: () =>
        `${scenarioPromptPreamble(repoRoot)} Run \`pwd\` and \`test -f package.json && echo package-json-present\`. Report the repo root and whether package.json exists.`
    },
    {
      id: "test-debug-a",
      title: "Repeated test-debug verification A",
      expectedTaskType: "test_debug",
      prompt: () =>
        `This is a test debugging verification task. ${scenarioPromptPreamble(repoRoot)} Run \`pwd\` and \`pnpm test tests/unit/openclaw-baseline.test.ts\`. Report whether the test command passed.`
    },
    {
      id: "test-debug-b",
      title: "Repeated test-debug verification B",
      expectedTaskType: "test_debug",
      prompt: () =>
        `This is a test debugging verification task. ${scenarioPromptPreamble(repoRoot)} Run \`pwd\` and \`pnpm test tests/unit/openclaw-baseline.test.ts\`. Report whether the test command passed.`
    },
    {
      id: "build-debug-a",
      title: "Repeated build-debug verification A",
      expectedTaskType: "build_debug",
      prompt: () =>
        `This is a build debugging verification task. ${scenarioPromptPreamble(repoRoot)} Run \`pwd\` and \`pnpm typecheck\`. Report whether the typecheck command passed.`
    },
    {
      id: "build-debug-b",
      title: "Repeated build-debug verification B",
      expectedTaskType: "build_debug",
      prompt: () =>
        `This is a build debugging verification task. ${scenarioPromptPreamble(repoRoot)} Run \`pwd\` and \`pnpm typecheck\`. Report whether the typecheck command passed.`
    }
  ];
};

const buildSessionId = (pack: OpenClawScenarioPackName, scenarioId: string, stamp: string): string =>
  `ee-openclaw-${pack}-${scenarioId}-${stamp}`.replace(/[^a-zA-Z0-9-_]/g, "-");

const parseCliJson = (stdout: string): { parsed: boolean } => {
  try {
    JSON.parse(stdout);
    return { parsed: true };
  } catch {
    return { parsed: false };
  }
};

const collectScenarioExecution = (
  sessionId: string,
  scenario: OpenClawScenarioDefinition,
  invocation: OpenClawScenarioInvocation,
  repos: {
    inputRepo: InputRecordRepository;
    injectionRepo: InjectionRepository;
    candidateRepo: CandidateRepository;
    jobRepo: DistillationJobRepository;
    nodeRepo: NodeRepository;
    taskRunRepo: TaskRunRepository;
    outcomeRepo: OutcomeRecordRepository;
    reviewRepo: ReviewEventRepository;
  },
  rawPath?: string
): OpenClawScenarioExecution => {
  const injection = repos.injectionRepo.getLatestBySessionId(sessionId);
  const record = repos.inputRepo.getLatestBySessionId(sessionId);
  const candidates = record ? repos.candidateRepo.listBySourceRecordId(record.record_id) : [];
  const jobs = candidates.flatMap((candidate) => repos.jobRepo.listByCandidateId(candidate.id));
  const injectedNodes = record ? repos.nodeRepo.listByIds(record.injected_node_ids) : [];
  const taskRun = repos.taskRunRepo.getLatestBySessionId(sessionId);
  const outcomes = taskRun ? repos.outcomeRepo.listByTaskRunId(taskRun.id) : [];
  const reviews = injectedNodes.flatMap((node) =>
    repos.reviewRepo.listByNodeId(node.id).filter((event) => !taskRun || event.task_run_id === taskRun.id)
  );
  const automaticFeedback =
    reviews.some((event) => event.source === "automatic" && event.event_type === "mark_harmed")
      ? "harmed"
      : reviews.some((event) => event.source === "automatic" && event.event_type === "mark_helped")
        ? "helped"
        : "none";

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    expectedTaskType: scenario.expectedTaskType,
    sessionId,
    rawPath,
    cli: {
      exitCode: invocation.exitCode,
      parsed: parseCliJson(invocation.stdout).parsed,
      stderr: invocation.stderr || undefined
    },
    record: record
      ? {
          recordId: record.record_id,
          taskType: record.task_type,
          outcome: record.outcome_signal,
          injectedNodeIds: record.injected_node_ids,
          createdAt: record.created_at,
          summary: record.task_summary
        }
      : undefined,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      lifecycle: candidate.lifecycle_state,
      nodeType: candidate.node_type,
      retryCount: candidate.retry_count,
      distilledNodeId: candidate.distilled_node_id
    })),
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      retryCount: job.retry_count,
      candidateId: job.candidate_id
    })),
    injectedNodes: injectedNodes.map((node) => ({
      id: node.id,
      state: node.state,
      hint: node.compact_hint,
      distillationSource: node.distillation_source
    })),
    runtime: taskRun || outcomes.length > 0 || reviews.length > 0
      ? {
          taskRunId: taskRun?.id,
          finalStatus: taskRun?.final_status,
          deliveryMode: injection?.delivery_mode,
          delivered: injection?.delivered,
          automaticFeedback,
          attributionReason: injection?.attribution_reason,
          outcomeIds: outcomes.map((outcome) => outcome.id),
          reviewCount: reviews.length
        }
      : undefined
  };
};

const aggregateScenarioResults = (
  scenarios: OpenClawScenarioExecution[]
): OpenClawScenarioReport["aggregate"] => {
  const injectedNodeSources: Record<DistillationSource, number> = {
    explicit_provider: 0,
    host_endpoint: 0,
    host_mediated: 0,
    rule: 0,
    disabled: 0
  };
  const effectiveness = {
    decisions: 0,
    live: 0,
    shadow: 0,
    holdout: 0,
    delivered: 0,
    suppressed: 0,
    automaticHelped: 0,
    automaticHarmed: 0
  };
  const attributionReasons: Record<FeedbackAttributionReason, number> = {
    success_outcome: 0,
    relevant_failure: 0,
    environmental_failure: 0,
    exploratory_failure: 0,
    no_relevant_failure: 0,
    suppressed_delivery: 0,
    unknown_outcome: 0
  };
  const modeEffectiveness = {
    live: {
      decisions: 0,
      live: 0,
      shadow: 0,
      holdout: 0,
      delivered: 0,
      suppressed: 0,
      automaticHelped: 0,
      automaticHarmed: 0
    },
    shadow: {
      decisions: 0,
      live: 0,
      shadow: 0,
      holdout: 0,
      delivered: 0,
      suppressed: 0,
      automaticHelped: 0,
      automaticHarmed: 0
    },
    holdout: {
      decisions: 0,
      live: 0,
      shadow: 0,
      holdout: 0,
      delivered: 0,
      suppressed: 0,
      automaticHelped: 0,
      automaticHarmed: 0
    }
  };

  for (const scenario of scenarios) {
    for (const node of scenario.injectedNodes) {
      injectedNodeSources[node.distillationSource ?? "disabled"] += 1;
    }
    if (scenario.runtime?.deliveryMode) {
      effectiveness.decisions += 1;
      effectiveness[scenario.runtime.deliveryMode] += 1;
      modeEffectiveness[scenario.runtime.deliveryMode].decisions += 1;
      modeEffectiveness[scenario.runtime.deliveryMode][scenario.runtime.deliveryMode] += 1;
    }
    if (scenario.runtime?.delivered === true) {
      effectiveness.delivered += 1;
      if (scenario.runtime?.deliveryMode) {
        modeEffectiveness[scenario.runtime.deliveryMode].delivered += 1;
      }
    } else if (scenario.runtime?.delivered === false) {
      effectiveness.suppressed += 1;
      if (scenario.runtime?.deliveryMode) {
        modeEffectiveness[scenario.runtime.deliveryMode].suppressed += 1;
      }
    }
    if (scenario.runtime?.automaticFeedback === "helped") {
      effectiveness.automaticHelped += 1;
      if (scenario.runtime?.deliveryMode) {
        modeEffectiveness[scenario.runtime.deliveryMode].automaticHelped += 1;
      }
    } else if (scenario.runtime?.automaticFeedback === "harmed") {
      effectiveness.automaticHarmed += 1;
      if (scenario.runtime?.deliveryMode) {
        modeEffectiveness[scenario.runtime.deliveryMode].automaticHarmed += 1;
      }
    }
    if (scenario.runtime?.attributionReason) {
      attributionReasons[scenario.runtime.attributionReason] += 1;
    }
  }

  return {
    total: scenarios.length,
    recordsMatched: scenarios.filter((scenario) => scenario.record).length,
    scenariosWithCandidates: scenarios.filter((scenario) => scenario.candidates.length > 0).length,
    scenariosWithDistilledCandidates: scenarios.filter((scenario) =>
      scenario.candidates.some((candidate) => candidate.lifecycle === "distilled")
    ).length,
    scenariosWithInjectedNodes: scenarios.filter((scenario) => scenario.injectedNodes.length > 0).length,
    scenariosWithTaskRuns: scenarios.filter((scenario) => Boolean(scenario.runtime?.taskRunId)).length,
    scenariosWithOutcomes: scenarios.filter((scenario) => (scenario.runtime?.outcomeIds.length ?? 0) > 0).length,
    scenariosWithReviews: scenarios.filter((scenario) => (scenario.runtime?.reviewCount ?? 0) > 0).length,
    successfulRecords: scenarios.filter((scenario) => scenario.record?.outcome === "success").length,
    failedRecords: scenarios.filter((scenario) => scenario.record?.outcome === "failure").length,
    unknownRecords: scenarios.filter((scenario) => scenario.record?.outcome === "unknown").length,
    injectedNodeSources,
    effectiveness,
    attributionReasons,
    benchmark: buildBenchmarkSummary(effectiveness),
    modeComparison: {
      live: buildModeBenchmarkSummary(modeEffectiveness.live),
      shadow: buildModeBenchmarkSummary(modeEffectiveness.shadow),
      holdout: buildModeBenchmarkSummary(modeEffectiveness.holdout)
    }
  };
};

export const renderOpenClawScenarioMarkdown = (report: OpenClawScenarioReport): string => {
  const lines = [
    "# OpenClaw High-Confidence Scenario Report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Pack: ${report.pack}`,
    `- Repo root: ${report.repoRoot}`,
    `- SQLite: ${report.sqlitePath}`,
    `- Capture dir: ${report.captureDir}`,
    `- Dry run: ${report.dryRun}`,
    "",
    "## Aggregate",
    "",
    `- Total scenarios: ${report.aggregate.total}`,
    `- Matched records: ${report.aggregate.recordsMatched}`,
    `- Scenarios with candidates: ${report.aggregate.scenariosWithCandidates}`,
    `- Scenarios with distilled candidates: ${report.aggregate.scenariosWithDistilledCandidates}`,
    `- Scenarios with injected nodes: ${report.aggregate.scenariosWithInjectedNodes}`,
    `- Scenarios with task runs: ${report.aggregate.scenariosWithTaskRuns}`,
    `- Scenarios with outcomes: ${report.aggregate.scenariosWithOutcomes}`,
    `- Scenarios with reviews: ${report.aggregate.scenariosWithReviews}`,
    `- Successful records: ${report.aggregate.successfulRecords}`,
    `- Failed records: ${report.aggregate.failedRecords}`,
    `- Unknown records: ${report.aggregate.unknownRecords}`,
    `- Decisions: ${report.aggregate.effectiveness.decisions}`,
    `- Live decisions: ${report.aggregate.effectiveness.live}`,
    `- Shadow decisions: ${report.aggregate.effectiveness.shadow}`,
    `- Holdout decisions: ${report.aggregate.effectiveness.holdout}`,
    `- Delivered: ${report.aggregate.effectiveness.delivered}`,
    `- Suppressed: ${report.aggregate.effectiveness.suppressed}`,
    `- Automatic helped: ${report.aggregate.effectiveness.automaticHelped}`,
    `- Automatic harmed: ${report.aggregate.effectiveness.automaticHarmed}`,
    "",
    "## Benchmark Summary",
    "",
    `- Delivery rate: ${report.aggregate.benchmark.deliveryRate}`,
    `- Suppression rate: ${report.aggregate.benchmark.suppressionRate}`,
    `- Helpful rate: ${report.aggregate.benchmark.helpfulRate}`,
    `- Harmful rate: ${report.aggregate.benchmark.harmfulRate}`,
    `- Net helpful rate: ${report.aggregate.benchmark.netHelpfulRate}`,
    `- Verdict: ${report.aggregate.benchmark.verdict}`,
    `- Suggested mode: ${report.aggregate.benchmark.suggestedMode}`,
    `- Recommendation: ${report.aggregate.benchmark.recommendation}`,
    "",
    "## Mode Comparison",
    "",
    `- live: decisions=${report.aggregate.modeComparison.live.decisions} delivered=${report.aggregate.modeComparison.live.delivered} suppressed=${report.aggregate.modeComparison.live.suppressed} helpful=${report.aggregate.modeComparison.live.automaticHelped} harmed=${report.aggregate.modeComparison.live.automaticHarmed} net=${report.aggregate.modeComparison.live.netHelpfulRate} verdict=${report.aggregate.modeComparison.live.verdict}`,
    `- shadow: decisions=${report.aggregate.modeComparison.shadow.decisions} delivered=${report.aggregate.modeComparison.shadow.delivered} suppressed=${report.aggregate.modeComparison.shadow.suppressed} helpful=${report.aggregate.modeComparison.shadow.automaticHelped} harmed=${report.aggregate.modeComparison.shadow.automaticHarmed} net=${report.aggregate.modeComparison.shadow.netHelpfulRate} verdict=${report.aggregate.modeComparison.shadow.verdict}`,
    `- holdout: decisions=${report.aggregate.modeComparison.holdout.decisions} delivered=${report.aggregate.modeComparison.holdout.delivered} suppressed=${report.aggregate.modeComparison.holdout.suppressed} helpful=${report.aggregate.modeComparison.holdout.automaticHelped} harmed=${report.aggregate.modeComparison.holdout.automaticHarmed} net=${report.aggregate.modeComparison.holdout.netHelpfulRate} verdict=${report.aggregate.modeComparison.holdout.verdict}`,
    "",
    "## Injected Node Sources",
    "",
    `- explicit_provider: ${report.aggregate.injectedNodeSources.explicit_provider}`,
    `- host_endpoint: ${report.aggregate.injectedNodeSources.host_endpoint}`,
    `- host_mediated: ${report.aggregate.injectedNodeSources.host_mediated}`,
    `- rule: ${report.aggregate.injectedNodeSources.rule}`,
    `- disabled: ${report.aggregate.injectedNodeSources.disabled}`,
    "",
    "## Attribution Reasons",
    "",
    `- success_outcome: ${report.aggregate.attributionReasons.success_outcome}`,
    `- relevant_failure: ${report.aggregate.attributionReasons.relevant_failure}`,
    `- environmental_failure: ${report.aggregate.attributionReasons.environmental_failure}`,
    `- exploratory_failure: ${report.aggregate.attributionReasons.exploratory_failure}`,
    `- no_relevant_failure: ${report.aggregate.attributionReasons.no_relevant_failure}`,
    `- suppressed_delivery: ${report.aggregate.attributionReasons.suppressed_delivery}`,
    `- unknown_outcome: ${report.aggregate.attributionReasons.unknown_outcome}`,
    "",
    "## Scenarios",
    ""
  ];

  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.title}`);
    lines.push(`- Scenario id: ${scenario.scenarioId}`);
    lines.push(`- Session id: ${scenario.sessionId}`);
    lines.push(`- Expected task type: ${scenario.expectedTaskType}`);
    lines.push(`- CLI exit code: ${scenario.cli.exitCode}`);
    lines.push(`- CLI parsed JSON: ${scenario.cli.parsed}`);
    if (scenario.rawPath) {
      lines.push(`- Raw output: ${scenario.rawPath}`);
    }
    if (scenario.record) {
      lines.push(`- Record outcome: ${scenario.record.outcome}`);
      lines.push(`- Record task type: ${scenario.record.taskType}`);
      lines.push(`- Injected nodes: ${scenario.record.injectedNodeIds.length}`);
      lines.push(`- Candidate count: ${scenario.candidates.length}`);
      lines.push(`- Distillation jobs: ${scenario.jobs.length}`);
    } else {
      lines.push("- Record outcome: n/a");
      lines.push("- Candidate count: 0");
      lines.push("- Distillation jobs: 0");
    }
    lines.push(`- Task run id: ${scenario.runtime?.taskRunId ?? "n/a"}`);
    lines.push(`- Outcome records: ${scenario.runtime?.outcomeIds.length ?? 0}`);
    lines.push(`- Review events: ${scenario.runtime?.reviewCount ?? 0}`);
    lines.push("");
  }

  if (report.baseline) {
    lines.push("## Baseline Snapshot");
    lines.push("");
    lines.push(`- Records total: ${report.baseline.records.total}`);
    lines.push(`- Records injected: ${report.baseline.records.injected}`);
    lines.push(`- Candidates total: ${report.baseline.candidates.total}`);
    lines.push(`- Distillation jobs total: ${report.baseline.distillationJobs.total}`);
    lines.push(`- Nodes total: ${report.baseline.nodes.total}`);
    lines.push("");
  }

  return lines.join("\n");
};

const buildEvaluationSummary = (report: OpenClawScenarioReport): OpenClawEvaluationSummary => ({
  generatedAt: report.generatedAt,
  pack: report.pack,
  repoRoot: report.repoRoot,
  benchmark: report.aggregate.benchmark,
  modeComparison: report.aggregate.modeComparison,
  effectiveness: report.aggregate.effectiveness,
  baseline: report.baseline
    ? {
        records: report.baseline.records,
        candidates: report.baseline.candidates,
        nodes: report.baseline.nodes,
        runtime: report.baseline.runtime,
        benchmark: report.baseline.benchmark
      }
    : undefined
});

const renderOpenClawEvaluationSummaryMarkdown = (summary: OpenClawEvaluationSummary): string => {
  const lines = [
    "# OpenClaw Evaluation Summary",
    "",
    `- Generated at: ${summary.generatedAt}`,
    `- Pack: ${summary.pack}`,
    `- Repo root: ${summary.repoRoot}`,
    "",
    "## Recommendation",
    "",
    `- Verdict: ${summary.benchmark.verdict}`,
    `- Suggested mode: ${summary.benchmark.suggestedMode}`,
    `- Recommendation: ${summary.benchmark.recommendation}`,
    "",
    "## Benchmark",
    "",
    `- Delivery rate: ${summary.benchmark.deliveryRate}`,
    `- Suppression rate: ${summary.benchmark.suppressionRate}`,
    `- Helpful rate: ${summary.benchmark.helpfulRate}`,
    `- Harmful rate: ${summary.benchmark.harmfulRate}`,
    `- Net helpful rate: ${summary.benchmark.netHelpfulRate}`,
    "",
    "## Mode Comparison",
    "",
    `- live: decisions=${summary.modeComparison.live.decisions} delivered=${summary.modeComparison.live.delivered} suppressed=${summary.modeComparison.live.suppressed} helpful=${summary.modeComparison.live.automaticHelped} harmed=${summary.modeComparison.live.automaticHarmed} net=${summary.modeComparison.live.netHelpfulRate} verdict=${summary.modeComparison.live.verdict}`,
    `- shadow: decisions=${summary.modeComparison.shadow.decisions} delivered=${summary.modeComparison.shadow.delivered} suppressed=${summary.modeComparison.shadow.suppressed} helpful=${summary.modeComparison.shadow.automaticHelped} harmed=${summary.modeComparison.shadow.automaticHarmed} net=${summary.modeComparison.shadow.netHelpfulRate} verdict=${summary.modeComparison.shadow.verdict}`,
    `- holdout: decisions=${summary.modeComparison.holdout.decisions} delivered=${summary.modeComparison.holdout.delivered} suppressed=${summary.modeComparison.holdout.suppressed} helpful=${summary.modeComparison.holdout.automaticHelped} harmed=${summary.modeComparison.holdout.automaticHarmed} net=${summary.modeComparison.holdout.netHelpfulRate} verdict=${summary.modeComparison.holdout.verdict}`
  ];

  if (summary.trend) {
    lines.push("");
    lines.push("## Trend vs Previous Run");
    lines.push("");
    lines.push(`- Previous generated at: ${summary.trend.previousGeneratedAt}`);
    lines.push(`- Previous net helpful rate: ${summary.trend.previousNetHelpfulRate}`);
    lines.push(`- Net helpful rate delta: ${summary.trend.deltaNetHelpfulRate}`);
    lines.push(`- Verdict: ${summary.trend.previousVerdict} -> ${summary.benchmark.verdict}`);
    lines.push(`- Suggested mode: ${summary.trend.previousSuggestedMode} -> ${summary.benchmark.suggestedMode}`);
  }

  if (summary.baseline) {
    lines.push("");
    lines.push("## Baseline Snapshot");
    lines.push("");
    lines.push(`- Records total: ${summary.baseline.records.total}`);
    lines.push(`- Candidates total: ${summary.baseline.candidates.total}`);
    lines.push(`- Nodes total: ${summary.baseline.nodes.total}`);
    lines.push(`- Task runs: ${summary.baseline.runtime.taskRuns}`);
    lines.push(`- Baseline verdict: ${summary.baseline.benchmark.verdict}`);
    lines.push(`- Baseline suggested mode: ${summary.baseline.benchmark.suggestedMode}`);
  }

  return lines.join("\n");
};

const renderOpenClawEvaluationHistoryMarkdown = (entries: OpenClawEvaluationHistoryEntry[]): string => {
  const lines = ["# OpenClaw Evaluation History", ""];

  if (!entries.length) {
    lines.push("- No evaluation summaries archived yet.");
    return lines.join("\n");
  }

  for (const entry of [...entries].reverse()) {
    lines.push(`## ${entry.generatedAt}`);
    lines.push(`- Pack: ${entry.pack}`);
    lines.push(`- Repo root: ${entry.repoRoot}`);
    lines.push(`- Verdict: ${entry.verdict}`);
    lines.push(`- Suggested mode: ${entry.suggestedMode}`);
    lines.push(`- Net helpful rate: ${entry.netHelpfulRate}`);
    if (entry.trend) {
      lines.push(
        `- Trend vs previous: net delta=${entry.trend.deltaNetHelpfulRate}`
        + ` verdict=${entry.trend.previousVerdict}->${entry.verdict}`
        + ` mode=${entry.trend.previousSuggestedMode}->${entry.suggestedMode}`
      );
    }
    lines.push(`- Summary JSON: ${entry.summaryJsonPath}`);
    lines.push(`- Summary Markdown: ${entry.summaryMarkdownPath}`);
    if (entry.caseStudyJsonPath) {
      lines.push(`- Case study JSON: ${entry.caseStudyJsonPath}`);
    }
    if (entry.caseStudyMarkdownPath) {
      lines.push(`- Case study Markdown: ${entry.caseStudyMarkdownPath}`);
    }
    lines.push("");
  }

  return lines.join("\n");
};

export const runOpenClawScenarioEvaluation = (options: RunOptions = {}): OpenClawScenarioRunResult => {
  const env = options.env ?? process.env;
  const pack = options.pack ?? "high-confidence";
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const outputDir = options.outputDir ? resolve(options.outputDir) : defaultOutputDir();
  const rawDir = resolve(outputDir, "raw");
  const invoker = options.invoker ?? defaultInvoker;
  const generatedAt = options.now?.() ?? new Date().toISOString();
  const runStamp = sanitizeStamp(generatedAt);

  mkdirIfMissing(outputDir);
  mkdirIfMissing(rawDir);

  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    homeDir: options.homeDir,
    env
  });
  const config = loadConfig(
    {
      dataDir: paths.dataDir,
      sqlitePath: paths.sqlitePath,
      captureDir: paths.captureDir
    },
    {
      env,
      homeDir: options.homeDir
    }
  );
  const db = openDatabase(config);
  bootstrapDatabase(db);

  const repos = {
    inputRepo: new InputRecordRepository(db),
    injectionRepo: new InjectionRepository(db),
    candidateRepo: new CandidateRepository(db),
    jobRepo: new DistillationJobRepository(db),
    nodeRepo: new NodeRepository(db),
    taskRunRepo: new TaskRunRepository(db),
    outcomeRepo: new OutcomeRecordRepository(db),
    reviewRepo: new ReviewEventRepository(db)
  };

  const scenarios = getOpenClawScenarioPack(pack, repoRoot);
  const results: OpenClawScenarioExecution[] = [];

  for (const scenario of scenarios) {
    const sessionId = buildSessionId(pack, scenario.id, runStamp);

    if (options.dryRun) {
      results.push({
        scenarioId: scenario.id,
        title: scenario.title,
        expectedTaskType: scenario.expectedTaskType,
        sessionId,
        cli: {
          exitCode: 0,
          parsed: false
        },
        candidates: [],
        jobs: [],
        injectedNodes: []
      });
      continue;
    }

    const invocation = invoker([
      "agent",
      "--session-id",
      sessionId,
      "--message",
      scenario.prompt(repoRoot),
      "--thinking",
      "minimal",
      "--timeout",
      "180",
      "--json"
    ]);

    const rawPath = resolve(rawDir, `${scenario.id}.json`);
    writeFileSync(
      rawPath,
      JSON.stringify(
        {
          sessionId,
          args: ["agent", "--session-id", sessionId, "--message", scenario.prompt(repoRoot)],
          exitCode: invocation.exitCode,
          stdout: invocation.stdout,
          stderr: invocation.stderr
        },
        null,
        2
      )
    );

    results.push(collectScenarioExecution(sessionId, scenario, invocation, repos, rawPath));
  }

  const report: OpenClawScenarioReport = {
    generatedAt,
    pack,
    repoRoot,
    sqlitePath: config.sqlitePath,
    captureDir: paths.captureDir,
    outputDir,
    dryRun: options.dryRun ?? false,
    scenarios: results,
    aggregate: aggregateScenarioResults(results)
  };

  let baselineJsonPath: string | undefined;
  let baselineMarkdownPath: string | undefined;
  let summaryJsonPath: string | undefined;
  let summaryMarkdownPath: string | undefined;
  let historyJsonPath: string | undefined;
  let historyMarkdownPath: string | undefined;
  let benchmarkReportJsonPath: string | undefined;
  let benchmarkReportMarkdownPath: string | undefined;
  let bundleJsonPath: string | undefined;
  let bundleMarkdownPath: string | undefined;
  let caseStudyJsonPath: string | undefined;
  let caseStudyMarkdownPath: string | undefined;
  let caseStudyIndexJsonPath: string | undefined;
  let caseStudyIndexMarkdownPath: string | undefined;
  let evidencePackageJsonPath: string | undefined;
  let evidencePackageMarkdownPath: string | undefined;
  if (!options.dryRun) {
    const baselineDir = resolve(outputDir, "baseline");
    const baseline = runOpenClawBaselineEvaluation({
      env,
      homeDir: options.homeDir,
      outputDir: baselineDir
    });
    report.baseline = baseline.summary;
    baselineJsonPath = baseline.jsonPath;
    baselineMarkdownPath = baseline.markdownPath;
  }

  const evaluationSummary = buildEvaluationSummary(report);

  const jsonPath = resolve(outputDir, "scenario-results.json");
  const markdownPath = resolve(outputDir, "scenario-results.md");
  summaryJsonPath = resolve(outputDir, "evaluation-summary.json");
  summaryMarkdownPath = resolve(outputDir, "evaluation-summary.md");

  const historyDir = dirname(outputDir);
  historyJsonPath = resolve(historyDir, "evaluation-history.json");
  historyMarkdownPath = resolve(historyDir, "evaluation-history.md");
  const existingHistory = existsSync(historyJsonPath)
    ? (JSON.parse(readFileSync(historyJsonPath, "utf8")) as OpenClawEvaluationHistoryEntry[])
    : [];
  const previousHistoryEntry = existingHistory.at(-1);
  if (previousHistoryEntry) {
    evaluationSummary.trend = {
      previousGeneratedAt: previousHistoryEntry.generatedAt,
      previousNetHelpfulRate: previousHistoryEntry.netHelpfulRate,
      deltaNetHelpfulRate: Number(
        (evaluationSummary.benchmark.netHelpfulRate - previousHistoryEntry.netHelpfulRate).toFixed(4)
      ),
      previousVerdict: previousHistoryEntry.verdict,
      previousSuggestedMode: previousHistoryEntry.suggestedMode
    };
  }
  const benchmarkReport: BenchmarkReport = {
    generatedAt,
    kind: "openclaw-scenarios",
    repoRoot,
    recommendedNextMode: evaluationSummary.benchmark.suggestedMode,
    benchmark: evaluationSummary.benchmark,
    trend: evaluationSummary.trend,
    modeComparison: evaluationSummary.modeComparison,
    artifacts: {
      scenarioJson: jsonPath,
      scenarioMarkdown: markdownPath,
      summaryJson: summaryJsonPath,
      summaryMarkdown: summaryMarkdownPath,
      historyJson: historyJsonPath,
      historyMarkdown: historyMarkdownPath,
      baselineJson: baselineJsonPath ?? "",
      baselineMarkdown: baselineMarkdownPath ?? ""
    }
  };
  const caseStudyReport: CaseStudyReport = {
    generatedAt: benchmarkReport.generatedAt,
    kind: benchmarkReport.kind,
    repoRoot: benchmarkReport.repoRoot,
    benchmark: benchmarkReport.benchmark,
    trend: benchmarkReport.trend,
    modeComparison: benchmarkReport.modeComparison,
    recommendation: {
      suggestedMode: benchmarkReport.benchmark.suggestedMode,
      verdict: benchmarkReport.benchmark.verdict,
      recommendation: benchmarkReport.benchmark.recommendation
    },
    artifacts: benchmarkReport.artifacts
  };
  benchmarkReportJsonPath = resolve(outputDir, "benchmark-report.json");
  benchmarkReportMarkdownPath = resolve(outputDir, "benchmark-report.md");
  bundleJsonPath = resolve(outputDir, "evaluation-bundle.json");
  bundleMarkdownPath = resolve(outputDir, "evaluation-bundle.md");
  caseStudyJsonPath = resolve(outputDir, "case-study.json");
  caseStudyMarkdownPath = resolve(outputDir, "case-study.md");
  caseStudyIndexJsonPath = resolve(historyDir, "scenario-case-studies.json");
  caseStudyIndexMarkdownPath = resolve(historyDir, "scenario-case-studies.md");
  evidencePackageJsonPath = resolve(outputDir, "evidence-package.json");
  evidencePackageMarkdownPath = resolve(outputDir, "evidence-package.md");
  const nextHistoryEntry: OpenClawEvaluationHistoryEntry = {
    generatedAt,
    pack,
    repoRoot,
    verdict: evaluationSummary.benchmark.verdict,
    suggestedMode: evaluationSummary.benchmark.suggestedMode,
    netHelpfulRate: evaluationSummary.benchmark.netHelpfulRate,
    summaryJsonPath,
    summaryMarkdownPath,
    caseStudyJsonPath,
    caseStudyMarkdownPath,
    trend: evaluationSummary.trend
  };
  const nextHistory = [...existingHistory, nextHistoryEntry];
  const caseStudyIndex = nextHistory
    .filter((entry): entry is OpenClawEvaluationHistoryEntry & { caseStudyJsonPath: string; caseStudyMarkdownPath: string } =>
      Boolean(entry.caseStudyJsonPath && entry.caseStudyMarkdownPath)
    )
    .map<CaseStudyIndexEntry>((entry) => ({
      generatedAt: entry.generatedAt,
      kind: "openclaw-scenarios",
      repoRoot: entry.repoRoot,
      verdict: entry.verdict,
      suggestedMode: entry.suggestedMode,
      netHelpfulRate: entry.netHelpfulRate,
      caseStudyJsonPath: entry.caseStudyJsonPath,
      caseStudyMarkdownPath: entry.caseStudyMarkdownPath
    }));
  const evidencePackage: EvidencePackage = {
    generatedAt,
    kind: "openclaw-scenarios",
    repoRoot,
    benchmark: evaluationSummary.benchmark,
    trend: evaluationSummary.trend,
    recommendation: {
      suggestedMode: evaluationSummary.benchmark.suggestedMode,
      verdict: evaluationSummary.benchmark.verdict,
      recommendation: evaluationSummary.benchmark.recommendation
    },
    artifacts: {
      scenarioJson: jsonPath,
      scenarioMarkdown: markdownPath,
      summaryJson: summaryJsonPath,
      summaryMarkdown: summaryMarkdownPath,
      historyJson: historyJsonPath,
      historyMarkdown: historyMarkdownPath,
      benchmarkReportJson: benchmarkReportJsonPath,
      benchmarkReportMarkdown: benchmarkReportMarkdownPath,
      evaluationBundleJson: bundleJsonPath,
      evaluationBundleMarkdown: bundleMarkdownPath,
      caseStudyJson: caseStudyJsonPath,
      caseStudyMarkdown: caseStudyMarkdownPath,
      caseStudyIndexJson: caseStudyIndexJsonPath,
      caseStudyIndexMarkdown: caseStudyIndexMarkdownPath,
      baselineJson: baselineJsonPath ?? "",
      baselineMarkdown: baselineMarkdownPath ?? ""
    }
  };
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(markdownPath, renderOpenClawScenarioMarkdown(report));
  writeFileSync(summaryJsonPath, JSON.stringify(evaluationSummary, null, 2));
  writeFileSync(summaryMarkdownPath, renderOpenClawEvaluationSummaryMarkdown(evaluationSummary));
  writeFileSync(historyJsonPath, JSON.stringify(nextHistory, null, 2));
  writeFileSync(historyMarkdownPath, renderOpenClawEvaluationHistoryMarkdown(nextHistory));
  writeFileSync(caseStudyIndexJsonPath, JSON.stringify(caseStudyIndex, null, 2));
  writeFileSync(caseStudyIndexMarkdownPath, renderCaseStudyIndexMarkdown(caseStudyIndex));
  writeFileSync(benchmarkReportJsonPath, JSON.stringify(benchmarkReport, null, 2));
  writeFileSync(benchmarkReportMarkdownPath, renderBenchmarkReportMarkdown(benchmarkReport));
  writeFileSync(bundleJsonPath, JSON.stringify(benchmarkReport, null, 2));
  writeFileSync(bundleMarkdownPath, renderEvaluationBundleMarkdown({
    ...benchmarkReport,
    artifacts: {
      ...benchmarkReport.artifacts,
      evaluationBundleJson: bundleJsonPath,
      evaluationBundleMarkdown: bundleMarkdownPath
    }
  }));
  writeFileSync(caseStudyJsonPath, JSON.stringify(caseStudyReport, null, 2));
  writeFileSync(caseStudyMarkdownPath, renderCaseStudyMarkdown({
    ...caseStudyReport,
    artifacts: {
      ...caseStudyReport.artifacts,
      evaluationBundleJson: bundleJsonPath,
      evaluationBundleMarkdown: bundleMarkdownPath,
      caseStudyJson: caseStudyJsonPath,
      caseStudyMarkdown: caseStudyMarkdownPath
    }
  }));
  writeFileSync(evidencePackageJsonPath, JSON.stringify(evidencePackage, null, 2));
  writeFileSync(evidencePackageMarkdownPath, renderEvidencePackageMarkdown(evidencePackage));

  return {
    outputDir,
    jsonPath,
    markdownPath,
    baselineJsonPath,
    baselineMarkdownPath,
    summary: evaluationSummary,
    summaryJsonPath,
    summaryMarkdownPath,
    historyJsonPath,
    historyMarkdownPath,
    benchmarkReportJsonPath,
    benchmarkReportMarkdownPath,
    bundleJsonPath,
    bundleMarkdownPath,
    caseStudyJsonPath,
    caseStudyMarkdownPath,
    caseStudyIndexJsonPath,
    caseStudyIndexMarkdownPath,
    evidencePackageJsonPath,
    evidencePackageMarkdownPath,
    report
  };
};
