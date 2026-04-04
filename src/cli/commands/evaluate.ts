import { resolve } from "node:path";
import type {
  BenchmarkSummary,
  EffectivenessCounts,
  ModeBenchmarkSummary
} from "../../evaluation/benchmark-summary.js";
import {
  renderOpenClawBaselineMarkdown,
  runOpenClawBaselineEvaluation
} from "../../evaluation/openclaw-baseline.js";
import {
  renderOpenClawScenarioMarkdown,
  runOpenClawScenarioEvaluation,
  type OpenClawScenarioRunResult
} from "../../evaluation/openclaw-scenarios.js";

type EvaluateFlags = {
  lookbackHours?: number;
  outputDir?: string;
  pack?: "high-confidence";
  repoRoot?: string;
  dryRun?: boolean;
};

const parseFlags = (args: string[]): EvaluateFlags => {
  const flags: EvaluateFlags = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--lookback-hours") {
      const next = args[index + 1];
      if (next) {
        flags.lookbackHours = Number(next);
        index += 1;
      }
      continue;
    }

    if (token === "--output-dir") {
      const next = args[index + 1];
      if (next) {
        flags.outputDir = resolve(next);
        index += 1;
      }
      continue;
    }

    if (token === "--pack") {
      const next = args[index + 1];
      if (next === "high-confidence") {
        flags.pack = next;
        index += 1;
      }
      continue;
    }

    if (token === "--repo-root") {
      const next = args[index + 1];
      if (next) {
        flags.repoRoot = resolve(next);
        index += 1;
      }
      continue;
    }

    if (token === "--dry-run") {
      flags.dryRun = true;
    }
  }

  return flags;
};

type EvaluateDependencies = {
  runBaseline?: (options: {
    lookbackHours?: number;
    outputDir?: string;
  }) => ReturnType<typeof runOpenClawBaselineEvaluation>;
  runScenarios?: (options: {
    pack?: "high-confidence";
    repoRoot?: string;
    outputDir?: string;
    dryRun?: boolean;
  }) => OpenClawScenarioRunResult;
};

const formatRate = (value: number): string => value.toFixed(4);

const printBenchmarkSummary = (input: {
  benchmark: BenchmarkSummary;
  effectiveness: EffectivenessCounts;
  modeComparison?: {
    live: ModeBenchmarkSummary;
    shadow: ModeBenchmarkSummary;
    holdout: ModeBenchmarkSummary;
  };
}): void => {
  console.log(
    `Benchmark: delivery=${formatRate(input.benchmark.deliveryRate)}`
    + ` suppression=${formatRate(input.benchmark.suppressionRate)}`
    + ` helpful=${formatRate(input.benchmark.helpfulRate)}`
    + ` harmful=${formatRate(input.benchmark.harmfulRate)}`
    + ` net=${formatRate(input.benchmark.netHelpfulRate)}`
  );
  console.log(`Verdict: ${input.benchmark.verdict}`);
  console.log(`Suggested mode: ${input.benchmark.suggestedMode}`);
  console.log(`Recommendation: ${input.benchmark.recommendation}`);
  console.log(
    `Effectiveness: decisions=${input.effectiveness.decisions}`
    + ` delivered=${input.effectiveness.delivered}`
    + ` suppressed=${input.effectiveness.suppressed}`
    + ` live=${input.effectiveness.live}`
    + ` shadow=${input.effectiveness.shadow}`
    + ` holdout=${input.effectiveness.holdout}`
    + ` auto_helped=${input.effectiveness.automaticHelped}`
    + ` auto_harmed=${input.effectiveness.automaticHarmed}`
  );
  if (input.modeComparison) {
    console.log("Mode comparison:");
    for (const mode of ["live", "shadow", "holdout"] as const) {
      const summary = input.modeComparison[mode];
      console.log(
        `- ${mode}: decisions=${summary.decisions}`
        + ` delivered=${summary.delivered}`
        + ` suppressed=${summary.suppressed}`
        + ` helpful=${summary.automaticHelped}`
        + ` harmed=${summary.automaticHarmed}`
        + ` net=${formatRate(summary.netHelpfulRate)}`
        + ` verdict=${summary.verdict}`
      );
    }
  }
};

const printTrendSummary = (trend?: {
  deltaNetHelpfulRate: number;
  previousVerdict: string;
  previousSuggestedMode: string;
} , current?: {
  verdict: string;
  suggestedMode: string;
}): void => {
  if (!trend || !current) {
    return;
  }

  const signedDelta = trend.deltaNetHelpfulRate >= 0
    ? `+${formatRate(trend.deltaNetHelpfulRate)}`
    : formatRate(trend.deltaNetHelpfulRate);

  console.log(
    `Trend vs previous: net=${signedDelta}`
    + ` verdict=${trend.previousVerdict}->${current.verdict}`
    + ` suggested=${trend.previousSuggestedMode}->${current.suggestedMode}`
  );
};

const printGovernanceSummary = (governance?: {
  harmfulOrMisfiredHints: number;
  metaDominantSelections: number;
  realDevAlignedSelections: number;
}): void => {
  if (!governance) {
    return;
  }

  console.log(
    `Governance: misfires=${governance.harmfulOrMisfiredHints}`
    + ` meta_dominant=${governance.metaDominantSelections}`
    + ` real_dev_aligned=${governance.realDevAlignedSelections}`
  );
};

export const runEvaluateCommand = (
  target?: string,
  args: string[] = [],
  deps: EvaluateDependencies = {}
): void => {
  if (!target || !["openclaw-baseline", "openclaw-scenarios"].includes(target)) {
    console.log(
      "Usage: ee evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]"
      + " | openclaw-scenarios --pack high-confidence [--repo-root PATH] [--output-dir PATH] [--dry-run]"
    );
    return;
  }

  const flags = parseFlags(args);
  if (target === "openclaw-scenarios") {
    const result = (deps.runScenarios ?? runOpenClawScenarioEvaluation)({
      pack: flags.pack ?? "high-confidence",
      repoRoot: flags.repoRoot,
      outputDir: flags.outputDir,
      dryRun: flags.dryRun
    });

    console.log(renderOpenClawScenarioMarkdown(result.report));
    printBenchmarkSummary({
      benchmark: result.report.aggregate.benchmark,
      effectiveness: result.report.aggregate.effectiveness,
      modeComparison: result.report.aggregate.modeComparison
    });
    printTrendSummary(result.summary?.trend, {
      verdict: result.report.aggregate.benchmark.verdict,
      suggestedMode: result.report.aggregate.benchmark.suggestedMode
    });
    console.log(`Scenario directory: ${result.outputDir}`);
    console.log(`JSON: ${result.jsonPath}`);
    console.log(`Markdown: ${result.markdownPath}`);
    if (result.summaryJsonPath && result.summaryMarkdownPath) {
      console.log(`Summary JSON: ${result.summaryJsonPath}`);
      console.log(`Summary Markdown: ${result.summaryMarkdownPath}`);
    }
    if (result.historyJsonPath && result.historyMarkdownPath) {
      console.log(`History JSON: ${result.historyJsonPath}`);
      console.log(`History Markdown: ${result.historyMarkdownPath}`);
    }
    if (result.benchmarkReportJsonPath && result.benchmarkReportMarkdownPath) {
      console.log(`Benchmark report JSON: ${result.benchmarkReportJsonPath}`);
      console.log(`Benchmark report Markdown: ${result.benchmarkReportMarkdownPath}`);
    }
    if (result.bundleJsonPath && result.bundleMarkdownPath) {
      console.log(`Evaluation bundle JSON: ${result.bundleJsonPath}`);
      console.log(`Evaluation bundle Markdown: ${result.bundleMarkdownPath}`);
    }
    if (result.caseStudyJsonPath && result.caseStudyMarkdownPath) {
      console.log(`Case study JSON: ${result.caseStudyJsonPath}`);
      console.log(`Case study Markdown: ${result.caseStudyMarkdownPath}`);
    }
    if (result.caseStudyIndexJsonPath && result.caseStudyIndexMarkdownPath) {
      console.log(`Case study index JSON: ${result.caseStudyIndexJsonPath}`);
      console.log(`Case study index Markdown: ${result.caseStudyIndexMarkdownPath}`);
    }
    if (result.evidencePackageJsonPath && result.evidencePackageMarkdownPath) {
      console.log(`Evidence package JSON: ${result.evidencePackageJsonPath}`);
      console.log(`Evidence package Markdown: ${result.evidencePackageMarkdownPath}`);
    }
    if (result.baselineJsonPath && result.baselineMarkdownPath) {
      console.log(`Baseline JSON: ${result.baselineJsonPath}`);
      console.log(`Baseline Markdown: ${result.baselineMarkdownPath}`);
    }
    return;
  }

  const result = (deps.runBaseline ?? runOpenClawBaselineEvaluation)({
    lookbackHours: flags.lookbackHours,
    outputDir: flags.outputDir
  });

  console.log(renderOpenClawBaselineMarkdown(result.summary));
  printBenchmarkSummary({
    benchmark: result.summary.benchmark,
    effectiveness: result.summary.effectiveness,
    modeComparison: result.summary.modeComparison
  });
  printGovernanceSummary(result.summary.governance);
  printTrendSummary(result.summary.trend, {
    verdict: result.summary.benchmark.verdict,
    suggestedMode: result.summary.benchmark.suggestedMode
  });
  console.log(`Snapshot directory: ${result.outputDir}`);
  console.log(`JSON: ${result.jsonPath}`);
  console.log(`Markdown: ${result.markdownPath}`);
  if (result.historyJsonPath && result.historyMarkdownPath) {
    console.log(`History JSON: ${result.historyJsonPath}`);
    console.log(`History Markdown: ${result.historyMarkdownPath}`);
  }
  if (result.benchmarkReportJsonPath && result.benchmarkReportMarkdownPath) {
    console.log(`Benchmark report JSON: ${result.benchmarkReportJsonPath}`);
    console.log(`Benchmark report Markdown: ${result.benchmarkReportMarkdownPath}`);
  }
  if (result.bundleJsonPath && result.bundleMarkdownPath) {
    console.log(`Evaluation bundle JSON: ${result.bundleJsonPath}`);
    console.log(`Evaluation bundle Markdown: ${result.bundleMarkdownPath}`);
  }
  if (result.caseStudyJsonPath && result.caseStudyMarkdownPath) {
    console.log(`Case study JSON: ${result.caseStudyJsonPath}`);
    console.log(`Case study Markdown: ${result.caseStudyMarkdownPath}`);
  }
  if (result.caseStudyIndexJsonPath && result.caseStudyIndexMarkdownPath) {
    console.log(`Case study index JSON: ${result.caseStudyIndexJsonPath}`);
    console.log(`Case study index Markdown: ${result.caseStudyIndexMarkdownPath}`);
  }
  if (result.evidencePackageJsonPath && result.evidencePackageMarkdownPath) {
    console.log(`Evidence package JSON: ${result.evidencePackageJsonPath}`);
    console.log(`Evidence package Markdown: ${result.evidencePackageMarkdownPath}`);
  }
};
