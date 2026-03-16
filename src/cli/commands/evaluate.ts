import { resolve } from "node:path";
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
    console.log(`Scenario directory: ${result.outputDir}`);
    console.log(`JSON: ${result.jsonPath}`);
    console.log(`Markdown: ${result.markdownPath}`);
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
  console.log(`Snapshot directory: ${result.outputDir}`);
  console.log(`JSON: ${result.jsonPath}`);
  console.log(`Markdown: ${result.markdownPath}`);
};
