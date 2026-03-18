import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../config/load-config.js";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { openDatabase } from "../store/sqlite/db.js";
import type { DistillationSource } from "../types/domain.js";

type CountRow = { value: string | null; count: number };

export type OpenClawBaselineSummary = {
  generatedAt: string;
  adapter: "openclaw";
  lookbackHours?: number;
  sqlitePath: string;
  captureDir: string;
  config: {
    distillerProfile: string;
    distillationMaxRetries: number;
    distillationBatchSize: number;
    distillationAutoDrain: boolean;
  };
  records: {
    total: number;
    success: number;
    failure: number;
    unknown: number;
    injected: number;
    injectionCoverage: number;
  };
  candidates: {
    total: number;
    pending: number;
    distilled: number;
    failed: number;
    discarded: number;
    avgRetryCount: number;
    maxRetryCount: number;
    distillationSuccessRate: number;
    discardRate: number;
  };
  distillationJobs: {
    total: number;
    pending: number;
    processing: number;
    succeeded: number;
    failed: number;
    discarded: number;
  };
  nodes: {
    total: number;
    active: number;
    cooling: number;
    retired: number;
    candidateState: number;
    bySource: Record<DistillationSource, number>;
    withHelpedFeedback: number;
    withHarmedFeedback: number;
    totalHelpedCount: number;
    totalHarmedCount: number;
  };
  runtime: {
    taskRuns: number;
    outcomes: number;
    reviews: number;
  };
  latest: {
    recordId?: string;
    sessionId?: string;
    taskType?: string;
    outcome?: string;
    candidateId?: string;
    candidateLifecycle?: string;
    nodeId?: string;
    nodeState?: string;
    nodeDistillationSource?: DistillationSource;
    taskRunId?: string;
    taskRunFinalStatus?: string;
    outcomeId?: string;
    outcomeSignal?: string;
    reviewEventId?: string;
    reviewEventType?: string;
  };
};

type CollectOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  now?: () => string;
  lookbackHours?: number;
  outputDir?: string;
};

const ratio = (value: number, total: number): number =>
  total > 0 ? Number((value / total).toFixed(4)) : 0;

const buildTimeFilter = (column: string, lookbackHours?: number): string => {
  if (!lookbackHours) {
    return "";
  }

  return `WHERE ${column} >= datetime('now', '-${lookbackHours} hours')`;
};

const countRowsToMap = (rows: CountRow[]): Record<string, number> =>
  rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.value ?? "unknown"] = row.count;
    return acc;
  }, {});

const getCount = (db: DatabaseSync, table: string, whereClause = ""): number =>
  (db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${whereClause}`).get() as { count: number }).count;

const getDistribution = (
  db: DatabaseSync,
  table: string,
  valueColumn: string,
  whereClause = ""
): Record<string, number> =>
  countRowsToMap(
    db.prepare(
      `SELECT ${valueColumn} AS value, COUNT(*) AS count FROM ${table} ${whereClause} GROUP BY ${valueColumn}`
    ).all() as CountRow[]
  );

const getLatestSnapshot = (db: DatabaseSync): OpenClawBaselineSummary["latest"] => {
  const latestRecord = db
    .prepare(
      `SELECT record_id, session_id, task_type, outcome_signal
       FROM experience_input_records
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        record_id: string;
        session_id: string | null;
        task_type: string;
        outcome_signal: string;
      }
    | undefined;

  const latestCandidate = db
    .prepare(
      `SELECT id, lifecycle_state
       FROM experience_candidates
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: string;
        lifecycle_state: string;
      }
    | undefined;

  const latestNode = db
    .prepare(
      `SELECT id, state, distillation_source
       FROM experience_nodes
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: string;
        state: string;
        distillation_source: string | null;
      }
    | undefined;

  const latestTaskRun = db
    .prepare(
      `SELECT id, final_status
       FROM task_runs
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: string;
        final_status: string;
      }
    | undefined;

  const latestOutcome = db
    .prepare(
      `SELECT id, outcome_signal
       FROM outcome_records
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: string;
        outcome_signal: string;
      }
    | undefined;

  const latestReview = db
    .prepare(
      `SELECT id, event_type
       FROM review_events
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: string;
        event_type: string;
      }
    | undefined;

  return {
    recordId: latestRecord?.record_id,
    sessionId: latestRecord?.session_id ?? undefined,
    taskType: latestRecord?.task_type,
    outcome: latestRecord?.outcome_signal,
    candidateId: latestCandidate?.id,
    candidateLifecycle: latestCandidate?.lifecycle_state,
    nodeId: latestNode?.id,
    nodeState: latestNode?.state,
    nodeDistillationSource: (latestNode?.distillation_source as DistillationSource | null) ?? undefined,
    taskRunId: latestTaskRun?.id,
    taskRunFinalStatus: latestTaskRun?.final_status,
    outcomeId: latestOutcome?.id,
    outcomeSignal: latestOutcome?.outcome_signal,
    reviewEventId: latestReview?.id,
    reviewEventType: latestReview?.event_type
  };
};

export const collectOpenClawBaselineSummary = (
  db: DatabaseSync,
  config: ReturnType<typeof loadConfig>,
  options: { now?: () => string; lookbackHours?: number } = {}
): OpenClawBaselineSummary => {
  const recordFilter = buildTimeFilter("created_at", options.lookbackHours);
  const candidateFilter = buildTimeFilter("created_at", options.lookbackHours);
  const jobFilter = buildTimeFilter("created_at", options.lookbackHours);
  const nodeFilter = buildTimeFilter("created_at", options.lookbackHours);

  const recordTotal = getCount(db, "experience_input_records", recordFilter);
  const recordOutcomes = getDistribution(db, "experience_input_records", "outcome_signal", recordFilter);
  const injectedRecords = getCount(
    db,
    "experience_input_records",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} injected_node_ids_json != '[]'`
  );

  const candidateTotal = getCount(db, "experience_candidates", candidateFilter);
  const candidateLifecycles = getDistribution(
    db,
    "experience_candidates",
    "lifecycle_state",
    candidateFilter
  );
  const candidateRetryStats = db
    .prepare(
      `SELECT COALESCE(AVG(retry_count), 0) AS avg_retry_count, COALESCE(MAX(retry_count), 0) AS max_retry_count
       FROM experience_candidates ${candidateFilter}`
    )
    .get() as { avg_retry_count: number; max_retry_count: number };

  const jobTotal = getCount(db, "distillation_jobs", jobFilter);
  const jobStates = getDistribution(db, "distillation_jobs", "status", jobFilter);

  const nodeTotal = getCount(db, "experience_nodes", nodeFilter);
  const nodeStates = getDistribution(db, "experience_nodes", "state", nodeFilter);
  const nodeSources = getDistribution(db, "experience_nodes", "distillation_source", nodeFilter);
  const nodeFeedbackStats = db
    .prepare(
      `SELECT
        SUM(CASE WHEN helped_count > 0 THEN 1 ELSE 0 END) AS with_helped_feedback,
        SUM(CASE WHEN harmed_count > 0 THEN 1 ELSE 0 END) AS with_harmed_feedback,
        COALESCE(SUM(helped_count), 0) AS total_helped_count,
        COALESCE(SUM(harmed_count), 0) AS total_harmed_count
       FROM experience_nodes ${nodeFilter}`
    )
    .get() as {
      with_helped_feedback: number | null;
      with_harmed_feedback: number | null;
      total_helped_count: number | null;
      total_harmed_count: number | null;
    };
  const taskRunTotal = getCount(db, "task_runs", recordFilter);
  const outcomeTotal = getCount(db, "outcome_records", recordFilter);
  const reviewTotal = getCount(db, "review_events", recordFilter);

  return {
    generatedAt: options.now?.() ?? new Date().toISOString(),
    adapter: "openclaw",
    lookbackHours: options.lookbackHours,
    sqlitePath: config.sqlitePath,
    captureDir: config.captureDir,
    config: {
      distillerProfile: config.distillerProfile,
      distillationMaxRetries: config.distillationMaxRetries,
      distillationBatchSize: config.distillationBatchSize,
      distillationAutoDrain: config.distillationAutoDrain
    },
    records: {
      total: recordTotal,
      success: recordOutcomes.success ?? 0,
      failure: recordOutcomes.failure ?? 0,
      unknown: recordOutcomes.unknown ?? 0,
      injected: injectedRecords,
      injectionCoverage: ratio(injectedRecords, recordTotal)
    },
    candidates: {
      total: candidateTotal,
      pending: candidateLifecycles.pending ?? 0,
      distilled: candidateLifecycles.distilled ?? 0,
      failed: candidateLifecycles.failed ?? 0,
      discarded: candidateLifecycles.discarded ?? 0,
      avgRetryCount: Number(candidateRetryStats.avg_retry_count.toFixed(2)),
      maxRetryCount: candidateRetryStats.max_retry_count,
      distillationSuccessRate: ratio(candidateLifecycles.distilled ?? 0, candidateTotal),
      discardRate: ratio(candidateLifecycles.discarded ?? 0, candidateTotal)
    },
    distillationJobs: {
      total: jobTotal,
      pending: jobStates.pending ?? 0,
      processing: jobStates.processing ?? 0,
      succeeded: jobStates.succeeded ?? 0,
      failed: jobStates.failed ?? 0,
      discarded: jobStates.discarded ?? 0
    },
    nodes: {
      total: nodeTotal,
      active: nodeStates.active ?? 0,
      cooling: nodeStates.cooling ?? 0,
      retired: nodeStates.retired ?? 0,
      candidateState: nodeStates.candidate ?? 0,
      bySource: {
        explicit_provider: nodeSources.explicit_provider ?? 0,
        host_endpoint: nodeSources.host_endpoint ?? 0,
        host_mediated: nodeSources.host_mediated ?? 0,
        rule: nodeSources.rule ?? 0,
        disabled: nodeSources.disabled ?? 0
      },
      withHelpedFeedback: nodeFeedbackStats.with_helped_feedback ?? 0,
      withHarmedFeedback: nodeFeedbackStats.with_harmed_feedback ?? 0,
      totalHelpedCount: nodeFeedbackStats.total_helped_count ?? 0,
      totalHarmedCount: nodeFeedbackStats.total_harmed_count ?? 0
    },
    runtime: {
      taskRuns: taskRunTotal,
      outcomes: outcomeTotal,
      reviews: reviewTotal
    },
    latest: getLatestSnapshot(db)
  };
};

export const renderOpenClawBaselineMarkdown = (
  summary: OpenClawBaselineSummary
): string => `# OpenClaw Baseline Snapshot

- Generated at: ${summary.generatedAt}
- Adapter: ${summary.adapter}
- SQLite: ${summary.sqlitePath}
- Capture dir: ${summary.captureDir}
- Lookback hours: ${summary.lookbackHours ?? "all-time"}

## Distillation Config

- Profile: ${summary.config.distillerProfile}
- Max retries: ${summary.config.distillationMaxRetries}
- Batch size: ${summary.config.distillationBatchSize}
- Auto drain: ${summary.config.distillationAutoDrain}

## Records

- Total: ${summary.records.total}
- Success: ${summary.records.success}
- Failure: ${summary.records.failure}
- Unknown: ${summary.records.unknown}
- Injected records: ${summary.records.injected}
- Injection coverage: ${summary.records.injectionCoverage}

## Candidates

- Total: ${summary.candidates.total}
- Pending: ${summary.candidates.pending}
- Distilled: ${summary.candidates.distilled}
- Failed: ${summary.candidates.failed}
- Discarded: ${summary.candidates.discarded}
- Avg retry count: ${summary.candidates.avgRetryCount}
- Max retry count: ${summary.candidates.maxRetryCount}
- Distillation success rate: ${summary.candidates.distillationSuccessRate}
- Discard rate: ${summary.candidates.discardRate}

## Distillation Jobs

- Total: ${summary.distillationJobs.total}
- Pending: ${summary.distillationJobs.pending}
- Processing: ${summary.distillationJobs.processing}
- Succeeded: ${summary.distillationJobs.succeeded}
- Failed: ${summary.distillationJobs.failed}
- Discarded: ${summary.distillationJobs.discarded}

## Nodes

- Total: ${summary.nodes.total}
- Active: ${summary.nodes.active}
- Cooling: ${summary.nodes.cooling}
- Retired: ${summary.nodes.retired}
- Candidate-state nodes: ${summary.nodes.candidateState}
- Nodes with helped feedback: ${summary.nodes.withHelpedFeedback}
- Nodes with harmed feedback: ${summary.nodes.withHarmedFeedback}
- Total helped count: ${summary.nodes.totalHelpedCount}
- Total harmed count: ${summary.nodes.totalHarmedCount}

## Node Sources

- explicit_provider: ${summary.nodes.bySource.explicit_provider}
- host_endpoint: ${summary.nodes.bySource.host_endpoint}
- host_mediated: ${summary.nodes.bySource.host_mediated}
- rule: ${summary.nodes.bySource.rule}
- disabled: ${summary.nodes.bySource.disabled}

## Runtime Records

- Task runs: ${summary.runtime.taskRuns}
- Outcome records: ${summary.runtime.outcomes}
- Review events: ${summary.runtime.reviews}

## Latest Activity

- Record id: ${summary.latest.recordId ?? "n/a"}
- Session id: ${summary.latest.sessionId ?? "n/a"}
- Task type: ${summary.latest.taskType ?? "n/a"}
- Outcome: ${summary.latest.outcome ?? "n/a"}
- Candidate id: ${summary.latest.candidateId ?? "n/a"}
- Candidate lifecycle: ${summary.latest.candidateLifecycle ?? "n/a"}
- Node id: ${summary.latest.nodeId ?? "n/a"}
- Node state: ${summary.latest.nodeState ?? "n/a"}
- Node distillation source: ${summary.latest.nodeDistillationSource ?? "n/a"}
- Task run id: ${summary.latest.taskRunId ?? "n/a"}
- Task run final status: ${summary.latest.taskRunFinalStatus ?? "n/a"}
- Outcome id: ${summary.latest.outcomeId ?? "n/a"}
- Outcome signal: ${summary.latest.outcomeSignal ?? "n/a"}
- Review event id: ${summary.latest.reviewEventId ?? "n/a"}
- Review event type: ${summary.latest.reviewEventType ?? "n/a"}
`;

export const writeOpenClawBaselineArtifacts = (
  summary: OpenClawBaselineSummary,
  outputDir: string
): { jsonPath: string; markdownPath: string } => {
  const targetDir = resolve(outputDir);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const jsonPath = join(targetDir, "summary.json");
  const markdownPath = join(targetDir, "summary.md");
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, `${renderOpenClawBaselineMarkdown(summary)}\n`, "utf8");

  return { jsonPath, markdownPath };
};

export const runOpenClawBaselineEvaluation = (
  options: CollectOptions = {}
): {
  summary: OpenClawBaselineSummary;
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
} => {
  const env = options.env ?? process.env;
  const paths = resolveExperienceEnginePaths({ adapter: "openclaw", env, homeDir: options.homeDir });
  const config = loadConfig(
    {
      dataDir: paths.dataDir,
      sqlitePath: paths.sqlitePath,
      captureDir: paths.captureDir
    },
    { env, homeDir: options.homeDir }
  );
  const db = openDatabase(config);

  try {
    const summary = collectOpenClawBaselineSummary(db, config, {
      now: options.now,
      lookbackHours: options.lookbackHours
    });
    const timestamp = summary.generatedAt.replaceAll(":", "-");
    const outputDir = resolve(
      options.outputDir ?? join(process.cwd(), "artifacts", "evaluations", "openclaw", timestamp)
    );
    const { jsonPath, markdownPath } = writeOpenClawBaselineArtifacts(summary, outputDir);
    return { summary, outputDir, jsonPath, markdownPath };
  } finally {
    db.close();
  }
};
