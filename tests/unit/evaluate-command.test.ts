import { afterEach, describe, expect, it, vi } from "vitest";
import { runEvaluateCommand } from "../../src/cli/commands/evaluate.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
});

describe("evaluate command", () => {
  it("prints usage for unsupported targets", () => {
    runEvaluateCommand("unknown");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Usage: ee evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]"
      + " | openclaw-scenarios --pack high-confidence [--repo-root PATH] [--output-dir PATH] [--dry-run]"
    );
  });

  it("routes the scenario target with parsed flags", () => {
    const runScenarios = vi.fn(() => ({
      outputDir: "/tmp/out",
      jsonPath: "/tmp/out/scenario-results.json",
      markdownPath: "/tmp/out/scenario-results.md",
      summary: {
        generatedAt: "2026-03-16T10:00:00.000Z",
        pack: "high-confidence" as const,
        repoRoot: "/repo",
        benchmark: {
          deliveryRate: 0,
          suppressionRate: 0,
          helpfulRate: 0,
          harmfulRate: 0,
          netHelpfulRate: 0,
          verdict: "warming_up" as const,
          suggestedMode: "shadow" as const,
          recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
        },
        modeComparison: {
          live: {
            decisions: 0,
            delivered: 0,
            suppressed: 0,
            automaticHelped: 0,
            automaticHarmed: 0,
            deliveryRate: 0,
            suppressionRate: 0,
            helpfulRate: 0,
            harmfulRate: 0,
            netHelpfulRate: 0,
            verdict: "warming_up" as const,
            suggestedMode: "shadow" as const,
            recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
          },
          shadow: {
            decisions: 0,
            delivered: 0,
            suppressed: 0,
            automaticHelped: 0,
            automaticHarmed: 0,
            deliveryRate: 0,
            suppressionRate: 0,
            helpfulRate: 0,
            harmfulRate: 0,
            netHelpfulRate: 0,
            verdict: "warming_up" as const,
            suggestedMode: "shadow" as const,
            recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
          },
          holdout: {
            decisions: 0,
            delivered: 0,
            suppressed: 0,
            automaticHelped: 0,
            automaticHarmed: 0,
            deliveryRate: 0,
            suppressionRate: 0,
            helpfulRate: 0,
            harmfulRate: 0,
            netHelpfulRate: 0,
            verdict: "warming_up" as const,
            suggestedMode: "shadow" as const,
            recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
          }
        },
        effectiveness: {
          decisions: 0,
          live: 0,
          shadow: 0,
          holdout: 0,
          delivered: 0,
          suppressed: 0,
          automaticHelped: 0,
          automaticHarmed: 0
        },
        trend: {
          previousGeneratedAt: "2026-03-15T10:00:00.000Z",
          previousNetHelpfulRate: -0.5,
          deltaNetHelpfulRate: 0.5,
          previousVerdict: "failing" as const,
          previousSuggestedMode: "holdout" as const
        }
      },
      summaryJsonPath: "/tmp/out/evaluation-summary.json",
      summaryMarkdownPath: "/tmp/out/evaluation-summary.md",
      historyJsonPath: "/tmp/evaluation-history.json",
      historyMarkdownPath: "/tmp/evaluation-history.md",
      benchmarkReportJsonPath: "/tmp/out/benchmark-report.json",
      benchmarkReportMarkdownPath: "/tmp/out/benchmark-report.md",
      bundleJsonPath: "/tmp/out/evaluation-bundle.json",
      bundleMarkdownPath: "/tmp/out/evaluation-bundle.md",
      caseStudyJsonPath: "/tmp/out/case-study.json",
      caseStudyMarkdownPath: "/tmp/out/case-study.md",
      caseStudyIndexJsonPath: "/tmp/scenario-case-studies.json",
      caseStudyIndexMarkdownPath: "/tmp/scenario-case-studies.md",
      evidencePackageJsonPath: "/tmp/out/evidence-package.json",
      evidencePackageMarkdownPath: "/tmp/out/evidence-package.md",
      report: {
        generatedAt: "2026-03-16T10:00:00.000Z",
        pack: "high-confidence" as const,
        repoRoot: "/repo",
        sqlitePath: "/tmp/db.sqlite",
        captureDir: "/tmp/captures",
        outputDir: "/tmp/out",
        dryRun: true,
        scenarios: [],
        aggregate: {
          total: 0,
          recordsMatched: 0,
          scenariosWithCandidates: 0,
          scenariosWithDistilledCandidates: 0,
          scenariosWithInjectedNodes: 0,
          scenariosWithTaskRuns: 0,
          scenariosWithOutcomes: 0,
          scenariosWithReviews: 0,
          successfulRecords: 0,
          failedRecords: 0,
          unknownRecords: 0,
          injectedNodeSources: {
            explicit_provider: 0,
            rule: 0,
            disabled: 0
          },
          effectiveness: {
            decisions: 0,
            live: 0,
            shadow: 0,
            holdout: 0,
            delivered: 0,
            suppressed: 0,
            automaticHelped: 0,
            automaticHarmed: 0
          },
          attributionReasons: {
            success_outcome: 0,
            relevant_failure: 0,
            environmental_failure: 0,
            exploratory_failure: 0,
            no_relevant_failure: 0,
            suppressed_delivery: 0,
            unknown_outcome: 0
          },
          benchmark: {
            deliveryRate: 0,
            suppressionRate: 0,
            helpfulRate: 0,
            harmfulRate: 0,
            netHelpfulRate: 0,
            verdict: "warming_up" as const,
            suggestedMode: "shadow" as const,
            recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
          },
          modeComparison: {
            live: {
              decisions: 0,
              delivered: 0,
              suppressed: 0,
              automaticHelped: 0,
              automaticHarmed: 0,
              deliveryRate: 0,
              suppressionRate: 0,
              helpfulRate: 0,
              harmfulRate: 0,
              netHelpfulRate: 0,
              verdict: "warming_up" as const,
              suggestedMode: "shadow" as const,
              recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
            },
            shadow: {
              decisions: 0,
              delivered: 0,
              suppressed: 0,
              automaticHelped: 0,
              automaticHarmed: 0,
              deliveryRate: 0,
              suppressionRate: 0,
              helpfulRate: 0,
              harmfulRate: 0,
              netHelpfulRate: 0,
              verdict: "warming_up" as const,
              suggestedMode: "shadow" as const,
              recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
            },
            holdout: {
              decisions: 0,
              delivered: 0,
              suppressed: 0,
              automaticHelped: 0,
              automaticHarmed: 0,
              deliveryRate: 0,
              suppressionRate: 0,
              helpfulRate: 0,
              harmfulRate: 0,
              netHelpfulRate: 0,
              verdict: "warming_up" as const,
              suggestedMode: "shadow" as const,
              recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
            }
          }
        }
      }
    }));

    runEvaluateCommand(
      "openclaw-scenarios",
      ["--pack", "high-confidence", "--repo-root", "/repo", "--dry-run"],
      { runScenarios }
    );

    expect(runScenarios).toHaveBeenCalledWith({
      pack: "high-confidence",
      repoRoot: "/repo",
      outputDir: undefined,
      dryRun: true
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Benchmark: delivery=0.0000 suppression=0.0000 helpful=0.0000 harmful=0.0000 net=0.0000"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Verdict: warming_up");
    expect(consoleLogSpy).toHaveBeenCalledWith("Suggested mode: shadow");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Recommendation: Collect at least 3 decisions before treating benchmark numbers as stable."
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Mode comparison:");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- live: decisions=0 delivered=0 suppressed=0 helpful=0 harmed=0 net=0.0000 verdict=warming_up"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Effectiveness: decisions=0 delivered=0 suppressed=0 live=0 shadow=0 holdout=0 auto_helped=0 auto_harmed=0"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Summary JSON: /tmp/out/evaluation-summary.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Summary Markdown: /tmp/out/evaluation-summary.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("History JSON: /tmp/evaluation-history.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("History Markdown: /tmp/evaluation-history.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Benchmark report JSON: /tmp/out/benchmark-report.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Benchmark report Markdown: /tmp/out/benchmark-report.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evaluation bundle JSON: /tmp/out/evaluation-bundle.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evaluation bundle Markdown: /tmp/out/evaluation-bundle.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study JSON: /tmp/out/case-study.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study Markdown: /tmp/out/case-study.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study index JSON: /tmp/scenario-case-studies.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study index Markdown: /tmp/scenario-case-studies.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evidence package JSON: /tmp/out/evidence-package.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evidence package Markdown: /tmp/out/evidence-package.md");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Trend vs previous: net=+0.5000 verdict=failing->warming_up suggested=holdout->shadow"
    );
  });

  it("prints concise benchmark summaries for baseline snapshots", () => {
    const runBaseline = vi.fn(() => ({
      outputDir: "/tmp/baseline",
      jsonPath: "/tmp/baseline/baseline.json",
      markdownPath: "/tmp/baseline/baseline.md",
      historyJsonPath: "/tmp/baseline-history.json",
      historyMarkdownPath: "/tmp/baseline-history.md",
      benchmarkReportJsonPath: "/tmp/baseline/benchmark-report.json",
      benchmarkReportMarkdownPath: "/tmp/baseline/benchmark-report.md",
      bundleJsonPath: "/tmp/baseline/evaluation-bundle.json",
      bundleMarkdownPath: "/tmp/baseline/evaluation-bundle.md",
      caseStudyJsonPath: "/tmp/baseline/case-study.json",
      caseStudyMarkdownPath: "/tmp/baseline/case-study.md",
      caseStudyIndexJsonPath: "/tmp/baseline-case-studies.json",
      caseStudyIndexMarkdownPath: "/tmp/baseline-case-studies.md",
      evidencePackageJsonPath: "/tmp/baseline/evidence-package.json",
      evidencePackageMarkdownPath: "/tmp/baseline/evidence-package.md",
      summary: {
        generatedAt: "2026-03-16T10:00:00.000Z",
        adapter: "openclaw" as const,
        sqlitePath: "/tmp/db.sqlite",
        captureDir: "/tmp/captures",
        config: {
          distillerProfile: "balanced",
          distillationMaxRetries: 2,
          distillationBatchSize: 10,
          distillationAutoDrain: true
        },
        records: {
          total: 1,
          success: 1,
          failure: 0,
          unknown: 0,
          injected: 1,
          injectionCoverage: 1
        },
        candidates: {
          total: 1,
          pending: 0,
          distilled: 1,
          failed: 0,
          discarded: 0,
          avgRetryCount: 0,
          maxRetryCount: 0,
          distillationSuccessRate: 1,
          discardRate: 0
        },
        distillationJobs: {
          total: 1,
          pending: 0,
          processing: 0,
          succeeded: 1,
          failed: 0,
          discarded: 0
        },
        nodes: {
          total: 1,
          active: 1,
          cooling: 0,
          retired: 0,
          candidateState: 0,
          bySource: {
            explicit_provider: 0,
            rule: 1,
            disabled: 0
          },
          withHelpedFeedback: 1,
          withHarmedFeedback: 0,
          totalHelpedCount: 1,
          totalHarmedCount: 0
        },
        effectiveness: {
          decisions: 1,
          live: 1,
          shadow: 0,
          holdout: 0,
          delivered: 1,
          suppressed: 0,
          automaticHelped: 1,
          automaticHarmed: 0
        },
        benchmark: {
          deliveryRate: 1,
          suppressionRate: 0,
          helpfulRate: 1,
          harmfulRate: 0,
          netHelpfulRate: 1,
          verdict: "warming_up" as const,
          suggestedMode: "shadow" as const,
          recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
        },
        trend: {
          previousGeneratedAt: "2026-03-15T10:00:00.000Z",
          previousNetHelpfulRate: -0.25,
          deltaNetHelpfulRate: 1.25,
          previousVerdict: "failing" as const,
          previousSuggestedMode: "holdout" as const
        },
        modeComparison: {
          live: {
            decisions: 1,
            delivered: 1,
            suppressed: 0,
            automaticHelped: 1,
            automaticHarmed: 0,
            deliveryRate: 1,
            suppressionRate: 0,
            helpfulRate: 1,
            harmfulRate: 0,
            netHelpfulRate: 1,
            verdict: "warming_up" as const,
            suggestedMode: "shadow" as const,
            recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
          },
          shadow: {
            decisions: 0,
            delivered: 0,
            suppressed: 0,
            automaticHelped: 0,
            automaticHarmed: 0,
            deliveryRate: 0,
            suppressionRate: 0,
            helpfulRate: 0,
            harmfulRate: 0,
            netHelpfulRate: 0,
            verdict: "warming_up" as const,
            suggestedMode: "shadow" as const,
            recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
          },
          holdout: {
            decisions: 0,
            delivered: 0,
            suppressed: 0,
            automaticHelped: 0,
            automaticHarmed: 0,
            deliveryRate: 0,
            suppressionRate: 0,
            helpfulRate: 0,
            harmfulRate: 0,
            netHelpfulRate: 0,
            verdict: "warming_up" as const,
            suggestedMode: "shadow" as const,
            recommendation: "Collect at least 3 decisions before treating benchmark numbers as stable."
          }
        },
        governance: {
          harmfulOrMisfiredHints: 0,
          harmfulOrMisfiredRate: 0,
          metaDominantSelections: 0,
          metaDominantRate: 0,
          realDevAlignedSelections: 1,
          realDevAlignedRate: 1
        },
        attributionReasons: {
          success_outcome: 1,
          relevant_failure: 0,
          environmental_failure: 0,
          exploratory_failure: 0,
          no_relevant_failure: 0,
          suppressed_delivery: 0,
          unknown_outcome: 0
        },
        runtime: {
          taskRuns: 1,
          outcomes: 1,
          reviews: 1
        },
        latest: {}
      }
    }));

    runEvaluateCommand("openclaw-baseline", [], { runBaseline });

    expect(runBaseline).toHaveBeenCalledWith({
      lookbackHours: undefined,
      outputDir: undefined
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Benchmark: delivery=1.0000 suppression=0.0000 helpful=1.0000 harmful=0.0000 net=1.0000"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Verdict: warming_up");
    expect(consoleLogSpy).toHaveBeenCalledWith("Suggested mode: shadow");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Recommendation: Collect at least 3 decisions before treating benchmark numbers as stable."
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Mode comparison:");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- live: decisions=1 delivered=1 suppressed=0 helpful=1 harmed=0 net=1.0000 verdict=warming_up"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Effectiveness: decisions=1 delivered=1 suppressed=0 live=1 shadow=0 holdout=0 auto_helped=1 auto_harmed=0"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Governance: misfires=0 meta_dominant=0 real_dev_aligned=1"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Trend vs previous: net=+1.2500 verdict=failing->warming_up suggested=holdout->shadow"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("History JSON: /tmp/baseline-history.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("History Markdown: /tmp/baseline-history.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Benchmark report JSON: /tmp/baseline/benchmark-report.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Benchmark report Markdown: /tmp/baseline/benchmark-report.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evaluation bundle JSON: /tmp/baseline/evaluation-bundle.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evaluation bundle Markdown: /tmp/baseline/evaluation-bundle.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study JSON: /tmp/baseline/case-study.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study Markdown: /tmp/baseline/case-study.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study index JSON: /tmp/baseline-case-studies.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Case study index Markdown: /tmp/baseline-case-studies.md");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evidence package JSON: /tmp/baseline/evidence-package.json");
    expect(consoleLogSpy).toHaveBeenCalledWith("Evidence package Markdown: /tmp/baseline/evidence-package.md");
  });
});
