import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../config/load-config.js";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import {
  deriveGovernanceSignals,
  isPotentialMisfire,
  parseInjectionScorecard
} from "../experience-management/governance-observability.js";
import { openDatabase } from "../store/sqlite/db.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import type { DistillationSource, FeedbackAttributionReason } from "../types/domain.js";
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
  governance: {
    harmfulOrMisfiredHints: number;
    harmfulOrMisfiredRate: number;
    metaDominantSelections: number;
    metaDominantRate: number;
    realDevAlignedSelections: number;
    realDevAlignedRate: number;
  };
  benchmark: BenchmarkSummary;
  trend?: OpenClawBaselineTrend;
  modeComparison: {
    live: ModeBenchmarkSummary;
    shadow: ModeBenchmarkSummary;
    holdout: ModeBenchmarkSummary;
  };
  attributionReasons: Record<FeedbackAttributionReason, number>;
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

export type OpenClawBaselineTrend = {
  previousGeneratedAt: string;
  previousNetHelpfulRate: number;
  deltaNetHelpfulRate: number;
  previousVerdict: BenchmarkSummary["verdict"];
  previousSuggestedMode: BenchmarkSummary["suggestedMode"];
};

type OpenClawBaselineHistoryEntry = {
  generatedAt: string;
  verdict: BenchmarkSummary["verdict"];
  suggestedMode: BenchmarkSummary["suggestedMode"];
  netHelpfulRate: number;
  summaryJsonPath: string;
  summaryMarkdownPath: string;
  caseStudyJsonPath?: string;
  caseStudyMarkdownPath?: string;
  trend?: OpenClawBaselineTrend;
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
  const injectionRepo = new InjectionRepository(db);

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
  const injectionTotal = getCount(db, "injection_events", recordFilter);
  const liveDecisions = getCount(
    db,
    "injection_events",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} delivery_mode = 'live'`
  );
  const shadowDecisions = getCount(
    db,
    "injection_events",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} delivery_mode = 'shadow'`
  );
  const holdoutDecisions = getCount(
    db,
    "injection_events",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} delivery_mode = 'holdout'`
  );
  const deliveredDecisions = getCount(
    db,
    "injection_events",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} delivered = 1`
  );
  const suppressedDecisions = getCount(
    db,
    "injection_events",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} delivered = 0`
  );
  const automaticHelped = getCount(
    db,
    "review_events",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} source = 'automatic' AND event_type = 'mark_helped'`
  );
  const automaticHarmed = getCount(
    db,
    "review_events",
    `${recordFilter ? `${recordFilter} AND` : "WHERE"} source = 'automatic' AND event_type = 'mark_harmed'`
  );
  const modeComparison = {
    live: buildModeBenchmarkSummary({
      decisions: liveDecisions,
      live: liveDecisions,
      shadow: 0,
      holdout: 0,
      delivered: injectionRepo.countByDeliveryModeAndDelivered("live", true),
      suppressed: injectionRepo.countByDeliveryModeAndDelivered("live", false),
      automaticHelped: injectionRepo.countAutomaticFeedbackByDeliveryMode("live", "mark_helped"),
      automaticHarmed: injectionRepo.countAutomaticFeedbackByDeliveryMode("live", "mark_harmed")
    }),
    shadow: buildModeBenchmarkSummary({
      decisions: shadowDecisions,
      live: 0,
      shadow: shadowDecisions,
      holdout: 0,
      delivered: injectionRepo.countByDeliveryModeAndDelivered("shadow", true),
      suppressed: injectionRepo.countByDeliveryModeAndDelivered("shadow", false),
      automaticHelped: injectionRepo.countAutomaticFeedbackByDeliveryMode("shadow", "mark_helped"),
      automaticHarmed: injectionRepo.countAutomaticFeedbackByDeliveryMode("shadow", "mark_harmed")
    }),
    holdout: buildModeBenchmarkSummary({
      decisions: holdoutDecisions,
      live: 0,
      shadow: 0,
      holdout: holdoutDecisions,
      delivered: injectionRepo.countByDeliveryModeAndDelivered("holdout", true),
      suppressed: injectionRepo.countByDeliveryModeAndDelivered("holdout", false),
      automaticHelped: injectionRepo.countAutomaticFeedbackByDeliveryMode("holdout", "mark_helped"),
      automaticHarmed: injectionRepo.countAutomaticFeedbackByDeliveryMode("holdout", "mark_harmed")
    })
  };
  const governanceRows = db.prepare(
    `SELECT scorecard_json, harm_observed, attribution_reason
     FROM injection_events ${recordFilter}`
  ).all() as Array<{
    scorecard_json: string | null;
    harm_observed: number | null;
    attribution_reason: FeedbackAttributionReason | null;
  }>;
  const harmfulOrMisfiredHints = governanceRows.filter((row) =>
    isPotentialMisfire({
      harm_observed: row.harm_observed == null ? null : Boolean(row.harm_observed),
      attribution_reason: row.attribution_reason ?? undefined
    })
  ).length;
  const governanceSignals = governanceRows.map((row) =>
    deriveGovernanceSignals(parseInjectionScorecard(row.scorecard_json))
  );
  const metaDominantSelections = governanceSignals.filter((signal) => signal.metaDominant).length;
  const realDevAlignedSelections = governanceSignals.filter((signal) => signal.realDevAligned).length;
  const attributionReasons: FeedbackAttributionReason[] = [
    "success_outcome",
    "relevant_failure",
    "environmental_failure",
    "exploratory_failure",
    "no_relevant_failure",
    "suppressed_delivery",
    "unknown_outcome"
  ];

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
        rule: nodeSources.rule ?? 0,
        disabled: nodeSources.disabled ?? 0
      },
      withHelpedFeedback: nodeFeedbackStats.with_helped_feedback ?? 0,
      withHarmedFeedback: nodeFeedbackStats.with_harmed_feedback ?? 0,
      totalHelpedCount: nodeFeedbackStats.total_helped_count ?? 0,
      totalHarmedCount: nodeFeedbackStats.total_harmed_count ?? 0
    },
    effectiveness: {
      decisions: injectionTotal,
      live: liveDecisions,
      shadow: shadowDecisions,
      holdout: holdoutDecisions,
      delivered: deliveredDecisions,
      suppressed: suppressedDecisions,
      automaticHelped,
      automaticHarmed
    },
    governance: {
      harmfulOrMisfiredHints,
      harmfulOrMisfiredRate: ratio(harmfulOrMisfiredHints, injectionTotal),
      metaDominantSelections,
      metaDominantRate: ratio(metaDominantSelections, injectionTotal),
      realDevAlignedSelections,
      realDevAlignedRate: ratio(realDevAlignedSelections, injectionTotal)
    },
    benchmark: buildBenchmarkSummary({
      decisions: injectionTotal,
      live: liveDecisions,
      shadow: shadowDecisions,
      holdout: holdoutDecisions,
      delivered: deliveredDecisions,
      suppressed: suppressedDecisions,
      automaticHelped,
      automaticHarmed
    }),
    modeComparison,
    attributionReasons: Object.fromEntries(
      attributionReasons.map((reason) => [
        reason,
        getCount(
          db,
          "injection_events",
          `${recordFilter ? `${recordFilter} AND` : "WHERE"} attribution_reason = '${reason}'`
        )
      ])
    ) as Record<FeedbackAttributionReason, number>,
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
- rule: ${summary.nodes.bySource.rule}
- disabled: ${summary.nodes.bySource.disabled}

## Effectiveness

- Decisions: ${summary.effectiveness.decisions}
- Live: ${summary.effectiveness.live}
- Shadow: ${summary.effectiveness.shadow}
- Holdout: ${summary.effectiveness.holdout}
- Delivered: ${summary.effectiveness.delivered}
- Suppressed: ${summary.effectiveness.suppressed}
- Automatic helped: ${summary.effectiveness.automaticHelped}
- Automatic harmed: ${summary.effectiveness.automaticHarmed}

## Governance

- Harmful or misfired hints: ${summary.governance.harmfulOrMisfiredHints}
- Harmful or misfired rate: ${summary.governance.harmfulOrMisfiredRate}
- Meta-dominant selections: ${summary.governance.metaDominantSelections}
- Meta-dominant rate: ${summary.governance.metaDominantRate}
- Real-dev-aligned selections: ${summary.governance.realDevAlignedSelections}
- Real-dev-aligned rate: ${summary.governance.realDevAlignedRate}

## Benchmark Summary

- Delivery rate: ${summary.benchmark.deliveryRate}
- Suppression rate: ${summary.benchmark.suppressionRate}
- Helpful rate: ${summary.benchmark.helpfulRate}
- Harmful rate: ${summary.benchmark.harmfulRate}
- Net helpful rate: ${summary.benchmark.netHelpfulRate}
- Verdict: ${summary.benchmark.verdict}
- Suggested mode: ${summary.benchmark.suggestedMode}
- Recommendation: ${summary.benchmark.recommendation}

${summary.trend
  ? `## Trend vs Previous Run

- Previous generated at: ${summary.trend.previousGeneratedAt}
- Previous net helpful rate: ${summary.trend.previousNetHelpfulRate}
- Net helpful rate delta: ${summary.trend.deltaNetHelpfulRate}
- Verdict: ${summary.trend.previousVerdict} -> ${summary.benchmark.verdict}
- Suggested mode: ${summary.trend.previousSuggestedMode} -> ${summary.benchmark.suggestedMode}

`
  : ""}## Mode Comparison

- live: decisions=${summary.modeComparison.live.decisions} delivered=${summary.modeComparison.live.delivered} suppressed=${summary.modeComparison.live.suppressed} helpful=${summary.modeComparison.live.automaticHelped} harmed=${summary.modeComparison.live.automaticHarmed} net=${summary.modeComparison.live.netHelpfulRate} verdict=${summary.modeComparison.live.verdict}
- shadow: decisions=${summary.modeComparison.shadow.decisions} delivered=${summary.modeComparison.shadow.delivered} suppressed=${summary.modeComparison.shadow.suppressed} helpful=${summary.modeComparison.shadow.automaticHelped} harmed=${summary.modeComparison.shadow.automaticHarmed} net=${summary.modeComparison.shadow.netHelpfulRate} verdict=${summary.modeComparison.shadow.verdict}
- holdout: decisions=${summary.modeComparison.holdout.decisions} delivered=${summary.modeComparison.holdout.delivered} suppressed=${summary.modeComparison.holdout.suppressed} helpful=${summary.modeComparison.holdout.automaticHelped} harmed=${summary.modeComparison.holdout.automaticHarmed} net=${summary.modeComparison.holdout.netHelpfulRate} verdict=${summary.modeComparison.holdout.verdict}

## Attribution Reasons

- success_outcome: ${summary.attributionReasons.success_outcome}
- relevant_failure: ${summary.attributionReasons.relevant_failure}
- environmental_failure: ${summary.attributionReasons.environmental_failure}
- exploratory_failure: ${summary.attributionReasons.exploratory_failure}
- no_relevant_failure: ${summary.attributionReasons.no_relevant_failure}
- suppressed_delivery: ${summary.attributionReasons.suppressed_delivery}
- unknown_outcome: ${summary.attributionReasons.unknown_outcome}

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

const renderOpenClawBaselineHistoryMarkdown = (entries: OpenClawBaselineHistoryEntry[]): string => {
  const lines = ["# OpenClaw Baseline History", ""];

  if (!entries.length) {
    lines.push("- No baseline summaries archived yet.");
    return lines.join("\n");
  }

  for (const entry of [...entries].reverse()) {
    lines.push(`## ${entry.generatedAt}`);
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

export const runOpenClawBaselineEvaluation = (
  options: CollectOptions = {}
): {
  summary: OpenClawBaselineSummary;
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
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
    const historyDir = dirname(outputDir);
    const historyJsonPath = join(historyDir, "baseline-history.json");
    const historyMarkdownPath = join(historyDir, "baseline-history.md");
    const existingHistory = existsSync(historyJsonPath)
      ? (JSON.parse(readFileSync(historyJsonPath, "utf8")) as OpenClawBaselineHistoryEntry[])
      : [];
    const previousHistoryEntry = existingHistory.at(-1);
    if (previousHistoryEntry) {
      summary.trend = {
        previousGeneratedAt: previousHistoryEntry.generatedAt,
        previousNetHelpfulRate: previousHistoryEntry.netHelpfulRate,
        deltaNetHelpfulRate: Number(
          (summary.benchmark.netHelpfulRate - previousHistoryEntry.netHelpfulRate).toFixed(4)
        ),
        previousVerdict: previousHistoryEntry.verdict,
        previousSuggestedMode: previousHistoryEntry.suggestedMode
      };
      writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      writeFileSync(markdownPath, `${renderOpenClawBaselineMarkdown(summary)}\n`, "utf8");
    }
    const benchmarkReport: BenchmarkReport = {
      generatedAt: summary.generatedAt,
      kind: "openclaw-baseline",
      recommendedNextMode: summary.benchmark.suggestedMode,
      benchmark: summary.benchmark,
      trend: summary.trend,
      modeComparison: summary.modeComparison,
      artifacts: {
        summaryJson: jsonPath,
        summaryMarkdown: markdownPath,
        historyJson: historyJsonPath,
        historyMarkdown: historyMarkdownPath
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
    const benchmarkReportJsonPath = join(outputDir, "benchmark-report.json");
    const benchmarkReportMarkdownPath = join(outputDir, "benchmark-report.md");
    const bundleJsonPath = join(outputDir, "evaluation-bundle.json");
    const bundleMarkdownPath = join(outputDir, "evaluation-bundle.md");
    const caseStudyJsonPath = join(outputDir, "case-study.json");
    const caseStudyMarkdownPath = join(outputDir, "case-study.md");
    const caseStudyIndexJsonPath = join(historyDir, "baseline-case-studies.json");
    const caseStudyIndexMarkdownPath = join(historyDir, "baseline-case-studies.md");
    const evidencePackageJsonPath = join(outputDir, "evidence-package.json");
    const evidencePackageMarkdownPath = join(outputDir, "evidence-package.md");
    const nextHistoryEntry: OpenClawBaselineHistoryEntry = {
      generatedAt: summary.generatedAt,
      verdict: summary.benchmark.verdict,
      suggestedMode: summary.benchmark.suggestedMode,
      netHelpfulRate: summary.benchmark.netHelpfulRate,
      summaryJsonPath: jsonPath,
      summaryMarkdownPath: markdownPath,
      caseStudyJsonPath,
      caseStudyMarkdownPath,
      trend: summary.trend
    };
    const nextHistory = [...existingHistory, nextHistoryEntry];
    const caseStudyIndex = nextHistory
      .filter((entry): entry is OpenClawBaselineHistoryEntry & { caseStudyJsonPath: string; caseStudyMarkdownPath: string } =>
        Boolean(entry.caseStudyJsonPath && entry.caseStudyMarkdownPath)
      )
      .map<CaseStudyIndexEntry>((entry) => ({
        generatedAt: entry.generatedAt,
        kind: "openclaw-baseline",
        verdict: entry.verdict,
        suggestedMode: entry.suggestedMode,
        netHelpfulRate: entry.netHelpfulRate,
        caseStudyJsonPath: entry.caseStudyJsonPath,
        caseStudyMarkdownPath: entry.caseStudyMarkdownPath
      }));
    const evidencePackage: EvidencePackage = {
      generatedAt: summary.generatedAt,
      kind: "openclaw-baseline",
      benchmark: summary.benchmark,
      trend: summary.trend,
      recommendation: {
        suggestedMode: summary.benchmark.suggestedMode,
        verdict: summary.benchmark.verdict,
        recommendation: summary.benchmark.recommendation
      },
      artifacts: {
        summaryJson: jsonPath,
        summaryMarkdown: markdownPath,
        historyJson: historyJsonPath,
        historyMarkdown: historyMarkdownPath,
        benchmarkReportJson: benchmarkReportJsonPath,
        benchmarkReportMarkdown: benchmarkReportMarkdownPath,
        evaluationBundleJson: bundleJsonPath,
        evaluationBundleMarkdown: bundleMarkdownPath,
        caseStudyJson: caseStudyJsonPath,
        caseStudyMarkdown: caseStudyMarkdownPath,
        caseStudyIndexJson: caseStudyIndexJsonPath,
        caseStudyIndexMarkdown: caseStudyIndexMarkdownPath
      }
    };
    writeFileSync(historyJsonPath, `${JSON.stringify(nextHistory, null, 2)}\n`, "utf8");
    writeFileSync(historyMarkdownPath, `${renderOpenClawBaselineHistoryMarkdown(nextHistory)}\n`, "utf8");
    writeFileSync(caseStudyIndexJsonPath, `${JSON.stringify(caseStudyIndex, null, 2)}\n`, "utf8");
    writeFileSync(caseStudyIndexMarkdownPath, `${renderCaseStudyIndexMarkdown(caseStudyIndex)}\n`, "utf8");
    writeFileSync(benchmarkReportJsonPath, `${JSON.stringify(benchmarkReport, null, 2)}\n`, "utf8");
    writeFileSync(benchmarkReportMarkdownPath, `${renderBenchmarkReportMarkdown(benchmarkReport)}\n`, "utf8");
    writeFileSync(bundleJsonPath, `${JSON.stringify(benchmarkReport, null, 2)}\n`, "utf8");
    writeFileSync(
      bundleMarkdownPath,
      `${renderEvaluationBundleMarkdown({
        ...benchmarkReport,
        artifacts: {
          ...benchmarkReport.artifacts,
          evaluationBundleJson: bundleJsonPath,
          evaluationBundleMarkdown: bundleMarkdownPath
        }
      })}\n`,
      "utf8"
    );
    writeFileSync(caseStudyJsonPath, `${JSON.stringify(caseStudyReport, null, 2)}\n`, "utf8");
    writeFileSync(
      caseStudyMarkdownPath,
      `${renderCaseStudyMarkdown({
        ...caseStudyReport,
        artifacts: {
          ...caseStudyReport.artifacts,
          evaluationBundleJson: bundleJsonPath,
          evaluationBundleMarkdown: bundleMarkdownPath,
          caseStudyJson: caseStudyJsonPath,
          caseStudyMarkdown: caseStudyMarkdownPath
        }
      })}\n`,
      "utf8"
    );
    writeFileSync(evidencePackageJsonPath, `${JSON.stringify(evidencePackage, null, 2)}\n`, "utf8");
    writeFileSync(evidencePackageMarkdownPath, `${renderEvidencePackageMarkdown(evidencePackage)}\n`, "utf8");
    return {
      summary,
      outputDir,
      jsonPath,
      markdownPath,
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
      evidencePackageMarkdownPath
    };
  } finally {
    db.close();
  }
};
