import { resolve } from "node:path";
import {
  renderOpenClawBaselineMarkdown,
  runOpenClawBaselineEvaluation
} from "../../evaluation/openclaw-baseline.js";

type EvaluateFlags = {
  lookbackHours?: number;
  outputDir?: string;
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
    }
  }

  return flags;
};

export const runEvaluateCommand = (target?: string, args: string[] = []): void => {
  if (target !== "openclaw-baseline") {
    console.log(
      "Usage: ee evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]"
    );
    return;
  }

  const flags = parseFlags(args);
  const result = runOpenClawBaselineEvaluation({
    lookbackHours: flags.lookbackHours,
    outputDir: flags.outputDir
  });

  console.log(renderOpenClawBaselineMarkdown(result.summary));
  console.log(`Snapshot directory: ${result.outputDir}`);
  console.log(`JSON: ${result.jsonPath}`);
  console.log(`Markdown: ${result.markdownPath}`);
};
