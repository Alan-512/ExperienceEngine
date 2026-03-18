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
            host_endpoint: 0,
            host_mediated: 0,
            rule: 0,
            disabled: 0
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
  });
});
