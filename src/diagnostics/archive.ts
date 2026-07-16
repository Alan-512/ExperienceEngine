import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { create as createTarArchive } from "tar";
import { DIAGNOSTIC_ARCHIVE_VERSION } from "./constants.js";
import { validateDiagnosticReviewDirectory } from "./review-validator.js";

export type CreateDiagnosticArchiveOptions = {
  reviewDirectory: string;
  outputPath?: string;
  idFactory?: () => string;
};

export type CreatedDiagnosticArchive = {
  diagnostic_archive_version: typeof DIAGNOSTIC_ARCHIVE_VERSION;
  archive_path: string;
  archive_sha256: string;
  archive_size: number;
  manifest_schema_version: "diagnostic-manifest-v1";
  uploaded: false;
};

const assertRealOutputDirectory = (outputDirectory: string): string => {
  const resolvedDirectory = resolve(outputDirectory);
  const stat = lstatSync(resolvedDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Diagnostic archive output directory must be a real directory, not a link.");
  }
  return resolvedDirectory;
};

const fsyncFile = (path: string): void => {
  const descriptor = openSync(path, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

export const createDiagnosticReviewArchive = async (
  options: CreateDiagnosticArchiveOptions
): Promise<CreatedDiagnosticArchive> => {
  const validated = validateDiagnosticReviewDirectory(options.reviewDirectory);
  const defaultArchiveName = `${basename(validated.review_directory)}.tar.gz`;
  const requestedOutputPath = resolve(
    options.outputPath ?? join(dirname(validated.review_directory), defaultArchiveName)
  );
  const outputDirectory = assertRealOutputDirectory(dirname(requestedOutputPath));
  const archivePath = join(outputDirectory, basename(requestedOutputPath));
  if (existsSync(archivePath)) {
    throw new Error("Diagnostic archive output already exists; overwrite is forbidden.");
  }

  const id = (options.idFactory ?? randomUUID)().replace(/[^0-9A-Za-z._-]/gu, "-");
  const temporaryPath = join(outputDirectory, `.${basename(archivePath)}.${id}.candidate`);
  if (existsSync(temporaryPath)) {
    throw new Error("Diagnostic archive temporary path already exists.");
  }

  let temporaryCreated = false;
  try {
    await createTarArchive({
      cwd: validated.review_directory,
      file: temporaryPath,
      gzip: { level: 9 },
      portable: true,
      mtime: new Date(0),
      strict: true,
      follow: false,
      noDirRecurse: true,
      noPax: true,
      mode: 0o600
    }, ["manifest.json"]);
    temporaryCreated = true;
    fsyncFile(temporaryPath);

    try {
      linkSync(temporaryPath, archivePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("Diagnostic archive output already exists; overwrite is forbidden.");
      }
      throw error;
    }
    unlinkSync(temporaryPath);
    temporaryCreated = false;

    const archiveStat = statSync(archivePath);
    return {
      diagnostic_archive_version: DIAGNOSTIC_ARCHIVE_VERSION,
      archive_path: archivePath,
      archive_sha256: sha256File(archivePath),
      archive_size: archiveStat.size,
      manifest_schema_version: validated.manifest.diagnostic_manifest_schema_version,
      uploaded: false
    };
  } finally {
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true });
    }
  }
};
