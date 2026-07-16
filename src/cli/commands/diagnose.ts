import { collectSafeDiagnosticManifest } from "../../diagnostics/collector.js";
import { prepareDiagnosticReviewDirectory } from "../../diagnostics/review-directory.js";
import { renderSafeDiagnosticSummary } from "../../diagnostics/render.js";
import type { SafeDiagnosticManifest } from "../../diagnostics/contract.js";
import type { PreparedDiagnosticReviewDirectory } from "../../diagnostics/review-directory.js";

type DiagnoseFlags = {
  prepareBundle: boolean;
  includeModelId: boolean;
  outputDir?: string;
};

export type DiagnoseCommandDependencies = {
  collect?: (options: { includeModelId: boolean }) => Promise<SafeDiagnosticManifest>;
  prepare?: (options: {
    manifest: SafeDiagnosticManifest;
    outputRoot?: string;
  }) => PreparedDiagnosticReviewDirectory;
  log?: (message: string) => void;
};

const parseFlags = (args: string[]): DiagnoseFlags => {
  const flags: DiagnoseFlags = {
    prepareBundle: false,
    includeModelId: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--prepare-bundle") {
      flags.prepareBundle = true;
    } else if (token === "--include-model-id") {
      flags.includeModelId = true;
    } else if (token === "--output-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--output-dir requires a path.");
      }
      flags.outputDir = value;
      index += 1;
    } else if (token === "--archive") {
      throw new Error("Diagnostic archive creation is not available until the review-archive slice is installed.");
    } else {
      throw new Error(`Unknown diagnose option: ${token}`);
    }
  }
  if (flags.outputDir && !flags.prepareBundle) {
    throw new Error("--output-dir requires --prepare-bundle.");
  }
  return flags;
};

export const runDiagnoseCommand = async (
  args: string[] = [],
  dependencies: DiagnoseCommandDependencies = {}
): Promise<void> => {
  const flags = parseFlags(args);
  const collect = dependencies.collect ?? collectSafeDiagnosticManifest;
  const prepare = dependencies.prepare ?? prepareDiagnosticReviewDirectory;
  const log = dependencies.log ?? console.log;
  const manifest = await collect({
    includeModelId: flags.includeModelId
  });
  log(renderSafeDiagnosticSummary(manifest));
  if (!flags.prepareBundle) return;
  const prepared = prepare({
    manifest,
    outputRoot: flags.outputDir
  });
  log(`- Review directory: ${prepared.review_directory}`);
  log(`- Exact manifest: ${prepared.manifest_path}`);
  log("- Review the manifest before sharing. No archive or upload was created.");
};
