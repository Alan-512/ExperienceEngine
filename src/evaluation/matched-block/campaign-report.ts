import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { MatchedBlockBenchmarkStore } from "./store.js";
import {
  scoreMatchedBlockCampaign,
  type BenchmarkArmScoringObservation,
  type ScoreBenchmarkCampaignResult
} from "./scoring.js";

export type RunMatchedBlockCampaignReportOptions = {
  campaignDatabasePath: string;
  campaignId: string;
  observationsPath: string;
  outputDir: string;
  negativeResultDisclosureIncluded: boolean;
  persistDecision?: boolean;
  now?: () => string;
};

export type MatchedBlockCampaignReport = {
  evidence_mode: "matched_block_campaign";
  diagnostic_single_arm_reused: false;
  campaign_database_name: string;
  observations_file_name: string;
  generated_at: string;
  result: ScoreBenchmarkCampaignResult;
};

export type MatchedBlockCampaignReportRunResult = {
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
  report: MatchedBlockCampaignReport;
};

const parseObservations = (path: string): BenchmarkArmScoringObservation[] => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("Matched-block observations file must contain a JSON array.");
  }
  return parsed as BenchmarkArmScoringObservation[];
};

export const renderMatchedBlockCampaignMarkdown = (
  report: MatchedBlockCampaignReport
): string => {
  const { campaign_scorecard: scorecard, publication_decision: decision } = report.result;
  const lines = [
    "# OpenClaw Matched-Block Campaign Report",
    "",
    `- Evidence mode: \`${report.evidence_mode}\``,
    `- Historical single-arm diagnostic reused: \`${report.diagnostic_single_arm_reused}\``,
    `- Campaign: \`${scorecard.benchmark_campaign_id}\``,
    `- Decision: \`${decision.decision}\``,
    `- Complete blocks: \`${scorecard.complete_block_ids.length}\``,
    `- Excluded blocks: \`${scorecard.excluded_block_ids.length}\``,
    `- Attempted arms: \`${scorecard.attempted_arm_count}\``,
    `- Complete block coverage: \`${scorecard.complete_block_coverage.toFixed(4)}\``,
    `- Infrastructure reliability: \`${scorecard.infrastructure_reliability.toFixed(4)}\``,
    "",
    "## Minimum Public Scorecard",
    ""
  ];
  for (const [field, value] of Object.entries(scorecard.scorecard)) {
    lines.push(`- ${field}: \`${value === null ? "unavailable" : value}\``);
  }
  if (scorecard.decision_opportunity_metrics) {
    lines.push(
      "",
      "## Decision Opportunity Evidence",
      "",
      `- correct_skip_evidence_coverage: \`${
        scorecard.decision_opportunity_metrics.correct_skip_evidence_coverage ?? "unavailable"
      }\``
    );
  }
  if (scorecard.harm_recovery_metrics) {
    lines.push(
      "",
      "## Harm Recovery Evidence",
      "",
      `- opportunity_count: \`${scorecard.harm_recovery_metrics.opportunity_count}\``,
      `- success_count: \`${scorecard.harm_recovery_metrics.success_count}\``,
      `- recovery_rate: \`${scorecard.harm_recovery_metrics.recovery_rate ?? "unavailable"}\``
    );
  }
  lines.push(
    "",
    "## Publication Thresholds",
    ""
  );
  for (const [threshold, passed] of Object.entries(decision.threshold_results)) {
    lines.push(`- ${threshold}: \`${passed ? "passed" : "failed"}\``);
  }
  lines.push(
    "",
    `Evidence digest: \`${scorecard.evidence_digest}\``,
    ""
  );
  return lines.join("\n");
};

export const runMatchedBlockCampaignReport = (
  options: RunMatchedBlockCampaignReportOptions
): MatchedBlockCampaignReportRunResult => {
  const databasePath = resolve(options.campaignDatabasePath);
  const observationsPath = resolve(options.observationsPath);
  const outputDir = resolve(options.outputDir);
  const generatedAt = (options.now ?? (() => new Date().toISOString()))();
  const store = new MatchedBlockBenchmarkStore(databasePath);
  let result: ScoreBenchmarkCampaignResult;
  try {
    result = scoreMatchedBlockCampaign({
      store,
      campaignId: options.campaignId,
      observations: parseObservations(observationsPath),
      negativeResultDisclosureIncluded: options.negativeResultDisclosureIncluded,
      createdAt: generatedAt,
      persistDecision: options.persistDecision ?? false
    });
  } finally {
    store.close();
  }
  const report: MatchedBlockCampaignReport = {
    evidence_mode: "matched_block_campaign",
    diagnostic_single_arm_reused: false,
    campaign_database_name: basename(databasePath),
    observations_file_name: basename(observationsPath),
    generated_at: generatedAt,
    result
  };
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "matched-block-campaign.json");
  const markdownPath = join(outputDir, "matched-block-campaign.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMatchedBlockCampaignMarkdown(report), "utf8");
  return { outputDir, jsonPath, markdownPath, report };
};
