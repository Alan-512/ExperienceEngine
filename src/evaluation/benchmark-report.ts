import type { BenchmarkSummary, ModeBenchmarkSummary } from "./benchmark-summary.js";
import type { OpenClawBaselineTrend } from "./openclaw-baseline.js";

export type BenchmarkReport = {
  generatedAt: string;
  kind: "openclaw-baseline" | "openclaw-scenarios";
  repoRoot?: string;
  recommendedNextMode: BenchmarkSummary["suggestedMode"];
  benchmark: BenchmarkSummary;
  trend?: OpenClawBaselineTrend;
  modeComparison: {
    live: ModeBenchmarkSummary;
    shadow: ModeBenchmarkSummary;
    holdout: ModeBenchmarkSummary;
  };
  artifacts: Record<string, string>;
};

export type CaseStudyReport = {
  generatedAt: string;
  kind: "openclaw-baseline" | "openclaw-scenarios";
  repoRoot?: string;
  benchmark: BenchmarkSummary;
  trend?: OpenClawBaselineTrend;
  modeComparison: {
    live: ModeBenchmarkSummary;
    shadow: ModeBenchmarkSummary;
    holdout: ModeBenchmarkSummary;
  };
  recommendation: {
    suggestedMode: BenchmarkSummary["suggestedMode"];
    verdict: BenchmarkSummary["verdict"];
    recommendation: string;
  };
  artifacts: Record<string, string>;
};

export type CaseStudyIndexEntry = {
  generatedAt: string;
  kind: "openclaw-baseline" | "openclaw-scenarios";
  repoRoot?: string;
  verdict: BenchmarkSummary["verdict"];
  suggestedMode: BenchmarkSummary["suggestedMode"];
  netHelpfulRate: number;
  caseStudyJsonPath: string;
  caseStudyMarkdownPath: string;
};

export type EvidencePackage = {
  generatedAt: string;
  kind: "openclaw-baseline" | "openclaw-scenarios";
  repoRoot?: string;
  benchmark: BenchmarkSummary;
  trend?: OpenClawBaselineTrend;
  recommendation: {
    suggestedMode: BenchmarkSummary["suggestedMode"];
    verdict: BenchmarkSummary["verdict"];
    recommendation: string;
  };
  artifacts: Record<string, string>;
};

export const renderBenchmarkReportMarkdown = (report: BenchmarkReport): string => {
  const lines = [
    "# ExperienceEngine Benchmark Report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Kind: ${report.kind}`,
    `- Recommended next mode: ${report.recommendedNextMode}`
  ];

  if (report.repoRoot) {
    lines.push(`- Repo root: ${report.repoRoot}`);
  }

  lines.push("");
  lines.push("## Benchmark");
  lines.push("");
  lines.push(`- Verdict: ${report.benchmark.verdict}`);
  lines.push(`- Delivery rate: ${report.benchmark.deliveryRate}`);
  lines.push(`- Suppression rate: ${report.benchmark.suppressionRate}`);
  lines.push(`- Helpful rate: ${report.benchmark.helpfulRate}`);
  lines.push(`- Harmful rate: ${report.benchmark.harmfulRate}`);
  lines.push(`- Net helpful rate: ${report.benchmark.netHelpfulRate}`);
  lines.push(`- Recommendation: ${report.benchmark.recommendation}`);
  lines.push("");
  lines.push("## Mode Comparison");
  lines.push("");
  lines.push(
    `- live: decisions=${report.modeComparison.live.decisions} delivered=${report.modeComparison.live.delivered}`
    + ` suppressed=${report.modeComparison.live.suppressed} helpful=${report.modeComparison.live.automaticHelped}`
    + ` harmed=${report.modeComparison.live.automaticHarmed} net=${report.modeComparison.live.netHelpfulRate}`
    + ` verdict=${report.modeComparison.live.verdict}`
  );
  lines.push(
    `- shadow: decisions=${report.modeComparison.shadow.decisions} delivered=${report.modeComparison.shadow.delivered}`
    + ` suppressed=${report.modeComparison.shadow.suppressed} helpful=${report.modeComparison.shadow.automaticHelped}`
    + ` harmed=${report.modeComparison.shadow.automaticHarmed} net=${report.modeComparison.shadow.netHelpfulRate}`
    + ` verdict=${report.modeComparison.shadow.verdict}`
  );
  lines.push(
    `- holdout: decisions=${report.modeComparison.holdout.decisions} delivered=${report.modeComparison.holdout.delivered}`
    + ` suppressed=${report.modeComparison.holdout.suppressed} helpful=${report.modeComparison.holdout.automaticHelped}`
    + ` harmed=${report.modeComparison.holdout.automaticHarmed} net=${report.modeComparison.holdout.netHelpfulRate}`
    + ` verdict=${report.modeComparison.holdout.verdict}`
  );

  if (report.trend) {
    lines.push("");
    lines.push("## Trend vs Previous Run");
    lines.push("");
    lines.push(`- Previous generated at: ${report.trend.previousGeneratedAt}`);
    lines.push(`- Previous net helpful rate: ${report.trend.previousNetHelpfulRate}`);
    lines.push(`- Net helpful rate delta: ${report.trend.deltaNetHelpfulRate}`);
    lines.push(`- Verdict: ${report.trend.previousVerdict} -> ${report.benchmark.verdict}`);
    lines.push(`- Suggested mode: ${report.trend.previousSuggestedMode} -> ${report.benchmark.suggestedMode}`);
  }

  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  for (const [label, path] of Object.entries(report.artifacts)) {
    lines.push(`- ${label}: ${path}`);
  }

  return lines.join("\n");
};

export const renderEvaluationBundleMarkdown = (report: BenchmarkReport): string =>
  renderBenchmarkReportMarkdown(report).replace(
    "# ExperienceEngine Benchmark Report",
    "# ExperienceEngine Evaluation Bundle"
  );

export const renderCaseStudyMarkdown = (report: CaseStudyReport): string => {
  const lines = [
    "# ExperienceEngine Case Study",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Kind: ${report.kind}`
  ];

  if (report.repoRoot) {
    lines.push(`- Repo root: ${report.repoRoot}`);
  }

  lines.push("");
  lines.push("## Outcome");
  lines.push("");
  lines.push(`- Verdict: ${report.benchmark.verdict}`);
  lines.push(`- Delivery rate: ${report.benchmark.deliveryRate}`);
  lines.push(`- Helpful rate: ${report.benchmark.helpfulRate}`);
  lines.push(`- Harmful rate: ${report.benchmark.harmfulRate}`);
  lines.push(`- Net helpful rate: ${report.benchmark.netHelpfulRate}`);

  if (report.trend) {
    lines.push("");
    lines.push("## Trend");
    lines.push("");
    lines.push(`- Previous generated at: ${report.trend.previousGeneratedAt}`);
    lines.push(`- Net helpful rate delta: ${report.trend.deltaNetHelpfulRate}`);
    lines.push(`- Verdict: ${report.trend.previousVerdict} -> ${report.benchmark.verdict}`);
    lines.push(`- Suggested mode: ${report.trend.previousSuggestedMode} -> ${report.benchmark.suggestedMode}`);
  }

  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  lines.push(`- Suggested mode: ${report.recommendation.suggestedMode}`);
  lines.push(`- Verdict: ${report.recommendation.verdict}`);
  lines.push(`- Action: ${report.recommendation.recommendation}`);
  lines.push("");
  lines.push("## Mode Comparison");
  lines.push("");
  lines.push(
    `- live: decisions=${report.modeComparison.live.decisions} delivered=${report.modeComparison.live.delivered}`
    + ` suppressed=${report.modeComparison.live.suppressed} helpful=${report.modeComparison.live.automaticHelped}`
    + ` harmed=${report.modeComparison.live.automaticHarmed} net=${report.modeComparison.live.netHelpfulRate}`
    + ` verdict=${report.modeComparison.live.verdict}`
  );
  lines.push(
    `- shadow: decisions=${report.modeComparison.shadow.decisions} delivered=${report.modeComparison.shadow.delivered}`
    + ` suppressed=${report.modeComparison.shadow.suppressed} helpful=${report.modeComparison.shadow.automaticHelped}`
    + ` harmed=${report.modeComparison.shadow.automaticHarmed} net=${report.modeComparison.shadow.netHelpfulRate}`
    + ` verdict=${report.modeComparison.shadow.verdict}`
  );
  lines.push(
    `- holdout: decisions=${report.modeComparison.holdout.decisions} delivered=${report.modeComparison.holdout.delivered}`
    + ` suppressed=${report.modeComparison.holdout.suppressed} helpful=${report.modeComparison.holdout.automaticHelped}`
    + ` harmed=${report.modeComparison.holdout.automaticHarmed} net=${report.modeComparison.holdout.netHelpfulRate}`
    + ` verdict=${report.modeComparison.holdout.verdict}`
  );
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  for (const [label, path] of Object.entries(report.artifacts)) {
    lines.push(`- ${label}: ${path}`);
  }

  return lines.join("\n");
};

export const renderCaseStudyIndexMarkdown = (entries: CaseStudyIndexEntry[]): string => {
  const lines = ["# ExperienceEngine Case Study Index", ""];

  if (!entries.length) {
    lines.push("- No case studies archived yet.");
    return lines.join("\n");
  }

  for (const entry of [...entries].reverse()) {
    lines.push(`## ${entry.generatedAt}`);
    lines.push(`- Kind: ${entry.kind}`);
    if (entry.repoRoot) {
      lines.push(`- Repo root: ${entry.repoRoot}`);
    }
    lines.push(`- Verdict: ${entry.verdict}`);
    lines.push(`- Suggested mode: ${entry.suggestedMode}`);
    lines.push(`- Net helpful rate: ${entry.netHelpfulRate}`);
    lines.push(`- Case study JSON: ${entry.caseStudyJsonPath}`);
    lines.push(`- Case study Markdown: ${entry.caseStudyMarkdownPath}`);
    lines.push("");
  }

  return lines.join("\n");
};

export const renderEvidencePackageMarkdown = (pkg: EvidencePackage): string => {
  const lines = [
    "# ExperienceEngine Evidence Package",
    "",
    `- Generated at: ${pkg.generatedAt}`,
    `- Kind: ${pkg.kind}`
  ];

  if (pkg.repoRoot) {
    lines.push(`- Repo root: ${pkg.repoRoot}`);
  }

  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  lines.push(`- Suggested mode: ${pkg.recommendation.suggestedMode}`);
  lines.push(`- Verdict: ${pkg.recommendation.verdict}`);
  lines.push(`- Action: ${pkg.recommendation.recommendation}`);
  lines.push("");
  lines.push("## Benchmark");
  lines.push("");
  lines.push(`- Delivery rate: ${pkg.benchmark.deliveryRate}`);
  lines.push(`- Helpful rate: ${pkg.benchmark.helpfulRate}`);
  lines.push(`- Harmful rate: ${pkg.benchmark.harmfulRate}`);
  lines.push(`- Net helpful rate: ${pkg.benchmark.netHelpfulRate}`);

  if (pkg.trend) {
    lines.push("");
    lines.push("## Trend");
    lines.push("");
    lines.push(`- Previous generated at: ${pkg.trend.previousGeneratedAt}`);
    lines.push(`- Net helpful rate delta: ${pkg.trend.deltaNetHelpfulRate}`);
    lines.push(`- Verdict: ${pkg.trend.previousVerdict} -> ${pkg.benchmark.verdict}`);
    lines.push(`- Suggested mode: ${pkg.trend.previousSuggestedMode} -> ${pkg.benchmark.suggestedMode}`);
  }

  lines.push("");
  lines.push("## Included Artifacts");
  lines.push("");
  for (const [label, path] of Object.entries(pkg.artifacts)) {
    lines.push(`- ${label}: ${path}`);
  }

  return lines.join("\n");
};
