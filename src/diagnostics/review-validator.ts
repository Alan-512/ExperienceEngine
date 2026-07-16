import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { relative, resolve } from "node:path";
import {
  DIAGNOSTIC_MANIFEST_MAX_BYTES,
  DIAGNOSTIC_REVIEW_DIRECTORY_VERSION
} from "./constants.js";
import {
  assertSafeDiagnosticManifest,
  type SafeDiagnosticManifest
} from "./contract.js";

export type ValidatedDiagnosticReviewDirectory = {
  review_directory_version: typeof DIAGNOSTIC_REVIEW_DIRECTORY_VERSION;
  review_directory: string;
  manifest_path: string;
  manifest: SafeDiagnosticManifest;
  manifest_bytes: Buffer;
};

const assertContainedRealPath = (root: string, candidate: string): void => {
  const relativePath = relative(root, candidate);
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("..") ||
    resolve(root, relativePath) !== resolve(candidate)
  ) {
    throw new Error("Diagnostic review content escapes the validated review directory.");
  }
};

export const validateDiagnosticReviewDirectory = (
  reviewDirectoryPath: string
): ValidatedDiagnosticReviewDirectory => {
  const requestedDirectory = resolve(reviewDirectoryPath);
  const requestedStat = lstatSync(requestedDirectory);
  if (!requestedStat.isDirectory() || requestedStat.isSymbolicLink()) {
    throw new Error("Diagnostic review path must be a real directory, not a link.");
  }

  const reviewDirectory = realpathSync(requestedDirectory);
  const entries = readdirSync(reviewDirectory, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    entries[0]?.name !== "manifest.json" ||
    !entries[0].isFile() ||
    entries[0].isSymbolicLink()
  ) {
    throw new Error("Diagnostic review directory must contain exactly one regular manifest.json file.");
  }

  const requestedManifestPath = resolve(reviewDirectory, "manifest.json");
  const manifestLstat = lstatSync(requestedManifestPath);
  if (!manifestLstat.isFile() || manifestLstat.isSymbolicLink()) {
    throw new Error("Diagnostic manifest must be a regular file, not a link.");
  }
  if (manifestLstat.size > DIAGNOSTIC_MANIFEST_MAX_BYTES) {
    throw new Error("Diagnostic manifest exceeds the maximum supported size.");
  }

  const manifestPath = realpathSync(requestedManifestPath);
  assertContainedRealPath(reviewDirectory, manifestPath);
  const manifestStat = statSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > DIAGNOSTIC_MANIFEST_MAX_BYTES) {
    throw new Error("Diagnostic manifest is not a supported regular file.");
  }

  const manifestBytes = readFileSync(manifestPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Diagnostic manifest JSON is invalid.");
  }
  const manifest = assertSafeDiagnosticManifest(parsed);

  return {
    review_directory_version: DIAGNOSTIC_REVIEW_DIRECTORY_VERSION,
    review_directory: reviewDirectory,
    manifest_path: manifestPath,
    manifest,
    manifest_bytes: manifestBytes
  };
};
