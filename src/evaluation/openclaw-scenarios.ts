import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../config/load-config.js";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { openDatabase, bootstrapDatabase } from "../store/sqlite/db.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { runOpenClawBaselineEvaluation, type OpenClawBaselineSummary } from "./openclaw-baseline.js";
import type {
  DistillationJob,
  ExperienceCandidate,
  ExperienceInputRecord,
  ExperienceNode,
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
  }>;
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
    successfulRecords: number;
    failedRecords: number;
    unknownRecords: number;
  };
  baseline?: OpenClawBaselineSummary;
};

export type OpenClawScenarioRunResult = {
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
  baselineJsonPath?: string;
  baselineMarkdownPath?: string;
  report: OpenClawScenarioReport;
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
    candidateRepo: CandidateRepository;
    jobRepo: DistillationJobRepository;
    nodeRepo: NodeRepository;
  },
  rawPath?: string
): OpenClawScenarioExecution => {
  const record = repos.inputRepo.getLatestBySessionId(sessionId);
  const candidates = record ? repos.candidateRepo.listBySourceRecordId(record.record_id) : [];
  const jobs = candidates.flatMap((candidate) => repos.jobRepo.listByCandidateId(candidate.id));
  const injectedNodes = record ? repos.nodeRepo.listByIds(record.injected_node_ids) : [];

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
      hint: node.compact_hint
    }))
  };
};

const aggregateScenarioResults = (
  scenarios: OpenClawScenarioExecution[]
): OpenClawScenarioReport["aggregate"] => ({
  total: scenarios.length,
  recordsMatched: scenarios.filter((scenario) => scenario.record).length,
  scenariosWithCandidates: scenarios.filter((scenario) => scenario.candidates.length > 0).length,
  scenariosWithDistilledCandidates: scenarios.filter((scenario) =>
    scenario.candidates.some((candidate) => candidate.lifecycle === "distilled")
  ).length,
  scenariosWithInjectedNodes: scenarios.filter((scenario) => scenario.injectedNodes.length > 0).length,
  successfulRecords: scenarios.filter((scenario) => scenario.record?.outcome === "success").length,
  failedRecords: scenarios.filter((scenario) => scenario.record?.outcome === "failure").length,
  unknownRecords: scenarios.filter((scenario) => scenario.record?.outcome === "unknown").length
});

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
    `- Successful records: ${report.aggregate.successfulRecords}`,
    `- Failed records: ${report.aggregate.failedRecords}`,
    `- Unknown records: ${report.aggregate.unknownRecords}`,
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
    candidateRepo: new CandidateRepository(db),
    jobRepo: new DistillationJobRepository(db),
    nodeRepo: new NodeRepository(db)
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

  const jsonPath = resolve(outputDir, "scenario-results.json");
  const markdownPath = resolve(outputDir, "scenario-results.md");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(markdownPath, renderOpenClawScenarioMarkdown(report));

  return {
    outputDir,
    jsonPath,
    markdownPath,
    baselineJsonPath,
    baselineMarkdownPath,
    report
  };
};
