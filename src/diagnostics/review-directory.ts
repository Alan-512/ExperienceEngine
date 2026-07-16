import { lstatSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { DIAGNOSTIC_REVIEW_DIRECTORY_VERSION } from "./constants.js";
import type { SafeDiagnosticManifest } from "./contract.js";

export type PrepareDiagnosticReviewDirectoryOptions = {
  manifest: SafeDiagnosticManifest;
  outputRoot?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  idFactory?: () => string;
};

export type PreparedDiagnosticReviewDirectory = {
  review_directory_version: typeof DIAGNOSTIC_REVIEW_DIRECTORY_VERSION;
  review_directory: string;
  manifest_path: string;
};

const safeId = (value: string): string => {
  const normalized = value.replace(/[^0-9A-Za-z._-]/gu, "-").replace(/^-+|-+$/gu, "");
  if (!normalized) throw new Error("Diagnostic review id is empty after sanitization.");
  return normalized.slice(0, 96);
};

export const prepareDiagnosticReviewDirectory = (
  options: PrepareDiagnosticReviewDirectoryOptions
): PreparedDiagnosticReviewDirectory => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const outputRoot = resolve(options.outputRoot ?? join(paths.productHome, "diagnostics", "reviews"));
  const id = safeId((options.idFactory ?? randomUUID)());
  const reviewDirectory = join(outputRoot, `review-${id}`);
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const outputRootStat = lstatSync(outputRoot);
  if (!outputRootStat.isDirectory() || outputRootStat.isSymbolicLink()) {
    throw new Error("Diagnostic output root must be a real directory, not a link.");
  }
  const relativeReviewPath = relative(outputRoot, reviewDirectory);
  if (
    relativeReviewPath.length === 0 ||
    relativeReviewPath.startsWith("..") ||
    resolve(outputRoot, relativeReviewPath) !== resolve(reviewDirectory)
  ) {
    throw new Error("Diagnostic review directory escapes the validated output root.");
  }
  mkdirSync(reviewDirectory, { recursive: false, mode: 0o700 });
  const manifestPath = join(reviewDirectory, "manifest.json");
  try {
    writeFileSync(manifestPath, `${JSON.stringify(options.manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
  } catch (error) {
    rmSync(reviewDirectory, { recursive: true, force: true });
    throw error;
  }
  return {
    review_directory_version: DIAGNOSTIC_REVIEW_DIRECTORY_VERSION,
    review_directory: reviewDirectory,
    manifest_path: manifestPath
  };
};
