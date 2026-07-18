import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { extract as extractTarArchive, list as listTarArchive } from "tar";
import {
  createNpmPublishedArtifactInstaller
} from "../../dist/runtime/distribution/npm-artifact-installer.js";
import {
  assertExactDiagnosticArchiveEntries,
  assertPublishedDiagnosticManifestBoundary,
  digestPublishedDiagnosticsRecord
} from "./lib/published-diagnostics-acceptance.mjs";

const execFileAsync = promisify(execFile);

const parseArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      options[token.slice(2)] = true;
    } else {
      options[token.slice(2)] = value;
      index += 1;
    }
  }
  return options;
};

const sha256File = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const sha256Text = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const assertSri = (path, integrity) => {
  const separator = integrity.indexOf("-");
  if (separator <= 0) throw new Error("Published npm integrity is invalid.");
  const algorithm = integrity.slice(0, separator);
  if (!["sha256", "sha384", "sha512"].includes(algorithm)) {
    throw new Error("Published npm integrity algorithm is unsupported.");
  }
  const expected = integrity.slice(separator + 1);
  const actual = createHash(algorithm).update(readFileSync(path)).digest("base64");
  if (actual !== expected) throw new Error("Published npm artifact SRI does not match.");
};

const args = parseArgs(process.argv.slice(2));
for (const key of ["artifact", "published-evidence", "expected-sha256", "output"]) {
  if (typeof args[key] !== "string" || args[key].trim().length === 0) {
    throw new Error(`Missing required --${key} argument.`);
  }
}

const artifactPath = resolve(args.artifact);
const publishedEvidencePath = resolve(args["published-evidence"]);
const evidenceOutputPath = resolve(args.output);
if (!existsSync(artifactPath) || !existsSync(publishedEvidencePath)) {
  throw new Error("Published diagnostics validation input is missing.");
}
if (existsSync(evidenceOutputPath)) {
  throw new Error("Published diagnostics evidence output already exists.");
}

const publishedEvidence = JSON.parse(readFileSync(publishedEvidencePath, "utf8"));
if (
  publishedEvidence.published_channel !== "npm" ||
  publishedEvidence.status !== "artifact_runtime_validated" ||
  typeof publishedEvidence.package_name !== "string" ||
  typeof publishedEvidence.package_version !== "string" ||
  typeof publishedEvidence.artifact_integrity !== "string" ||
  typeof publishedEvidence.artifact_size !== "number" ||
  typeof publishedEvidence.registry_record_identity !== "string"
) {
  throw new Error("Published npm runtime evidence identity is invalid.");
}

const actualSha256 = sha256File(artifactPath);
if (
  actualSha256 !== args["expected-sha256"] ||
  statSync(artifactPath).size !== publishedEvidence.artifact_size
) {
  throw new Error("Published npm artifact size or SHA-256 differs from the expected identity.");
}
assertSri(artifactPath, publishedEvidence.artifact_integrity);

const runRoot = mkdtempSync(join(tmpdir(), "ee-published-diagnostics-"));
let validationRecord;
let failure;
try {
  const installRoot = join(runRoot, "install");
  mkdirSync(installRoot, { recursive: true });
  const installer = createNpmPublishedArtifactInstaller({ timeoutMs: 300_000 });
  const artifact = {
    published_channel: "npm",
    package_name: publishedEvidence.package_name,
    package_version: publishedEvidence.package_version,
    artifact_path: artifactPath,
    artifact_integrity: publishedEvidence.artifact_integrity,
    artifact_size: publishedEvidence.artifact_size,
    registry_record_identity: publishedEvidence.registry_record_identity,
    materialized_at: publishedEvidence.distribution_attestation?.created_at ??
      new Date().toISOString()
  };
  const { packageRoot } = await installer({ artifact, installRoot });
  const cliPath = join(packageRoot, "dist", "cli", "index.js");
  if (!existsSync(cliPath)) throw new Error("Installed published package CLI is missing.");

  const userHome = join(runRoot, "user-home");
  const workspace = join(runRoot, "workspace");
  const eeHome = join(runRoot, "ee-home");
  mkdirSync(userHome, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const secretMarker = "published-diagnostics-secret-marker-v1";
  const env = {
    ...process.env,
    HOME: userHome,
    USERPROFILE: userHome,
    APPDATA: join(userHome, "AppData", "Roaming"),
    LOCALAPPDATA: join(userHome, "AppData", "Local"),
    XDG_CONFIG_HOME: join(userHome, ".config"),
    EXPERIENCE_ENGINE_HOME: eeHome,
    OPENROUTER_API_KEY: secretMarker,
    NODE_PATH: ""
  };

  const runCli = async (cliArgs, expectedSuccess = true) => {
    const execute = () => execFileAsync(
      process.execPath,
      [cliPath, ...cliArgs],
      {
        cwd: workspace,
        env,
        timeout: 120_000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      }
    );
    if (expectedSuccess) {
      try {
        const result = await execute();
        return { stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        throw new Error(
          `Published CLI command failed: ${cliArgs.join(" ")}: ${
            error?.stderr?.trim?.() || error?.message || String(error)
          }`
        );
      }
    }
    try {
      await execute();
    } catch (error) {
      return {
        stdout: typeof error?.stdout === "string" ? error.stdout : "",
        stderr: typeof error?.stderr === "string" ? error.stderr : String(error)
      };
    }
    throw new Error(`Published CLI unexpectedly accepted: ${cliArgs.join(" ")}`);
  };

  const assertProductHomeAbsent = () => {
    if (existsSync(eeHome) || existsSync(join(userHome, ".experienceengine"))) {
      throw new Error("Published diagnose flow created a product home for an uninitialized user.");
    }
  };

  const localSummary = await runCli(["diagnose"]);
  if (!localSummary.stdout.toLowerCase().includes("no files were uploaded")) {
    throw new Error("Published diagnose summary omitted the no-upload boundary.");
  }
  assertProductHomeAbsent();

  const reviewOutputRoot = join(runRoot, "reviews");
  const prepared = await runCli([
    "diagnose",
    "--prepare-bundle",
    "--output-dir",
    reviewOutputRoot
  ]);
  if (!prepared.stdout.toLowerCase().includes("no archive or upload was created")) {
    throw new Error("Published prepare flow omitted the review-first boundary.");
  }
  assertProductHomeAbsent();

  const reviewRoots = readdirSync(reviewOutputRoot, { withFileTypes: true });
  if (reviewRoots.length !== 1 || !reviewRoots[0].isDirectory() || reviewRoots[0].isSymbolicLink()) {
    throw new Error("Published prepare flow did not create exactly one real review directory.");
  }
  const reviewDirectory = join(reviewOutputRoot, reviewRoots[0].name);
  const reviewEntries = readdirSync(reviewDirectory, { withFileTypes: true });
  if (
    reviewEntries.length !== 1 ||
    reviewEntries[0].name !== "manifest.json" ||
    !reviewEntries[0].isFile() ||
    reviewEntries[0].isSymbolicLink()
  ) {
    throw new Error("Published review directory is not the exact one-manifest shape.");
  }
  const manifestPath = join(reviewDirectory, "manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assertPublishedDiagnosticManifestBoundary(manifest, {
    packageName: publishedEvidence.package_name,
    packageVersion: publishedEvidence.package_version,
    forbiddenValues: [
      runRoot,
      runRoot.replaceAll("\\", "/"),
      artifactPath,
      artifactPath.replaceAll("\\", "/"),
      secretMarker
    ]
  });

  const firstArchive = join(runRoot, "diagnostics-first.tar.gz");
  const secondArchive = join(runRoot, "diagnostics-second.tar.gz");
  const firstArchiveRun = await runCli([
    "diagnose", "--archive", reviewDirectory, "--output", firstArchive
  ]);
  const secondArchiveRun = await runCli([
    "diagnose", "--archive", reviewDirectory, "--output", secondArchive
  ]);
  for (const result of [firstArchiveRun, secondArchiveRun]) {
    if (!result.stdout.toLowerCase().includes("no files were uploaded or submitted")) {
      throw new Error("Published archive flow omitted the no-upload boundary.");
    }
  }
  const firstArchiveBytes = readFileSync(firstArchive);
  const secondArchiveBytes = readFileSync(secondArchive);
  if (!firstArchiveBytes.equals(secondArchiveBytes)) {
    throw new Error("Published diagnostic archives are not deterministic.");
  }

  const archiveEntries = [];
  await listTarArchive({
    file: firstArchive,
    strict: true,
    onentry: (entry) => archiveEntries.push(entry.path)
  });
  assertExactDiagnosticArchiveEntries(archiveEntries);
  const extractedRoot = join(runRoot, "extracted");
  mkdirSync(extractedRoot);
  await extractTarArchive({ file: firstArchive, cwd: extractedRoot, strict: true });
  if (!readFileSync(join(extractedRoot, "manifest.json")).equals(manifestBytes)) {
    throw new Error("Published diagnostic archive manifest differs from the reviewed manifest.");
  }

  const firstArchiveHashBeforeOverwrite = sha256File(firstArchive);
  const overwriteFailure = await runCli([
    "diagnose", "--archive", reviewDirectory, "--output", firstArchive
  ], false);
  if (
    !overwriteFailure.stderr.toLowerCase().includes("already exists") &&
    !overwriteFailure.stderr.toLowerCase().includes("overwrite")
  ) {
    throw new Error("Published archive overwrite rejection did not expose a stable refusal.");
  }
  if (sha256File(firstArchive) !== firstArchiveHashBeforeOverwrite) {
    throw new Error("Published archive overwrite rejection changed the existing archive.");
  }

  writeFileSync(join(reviewDirectory, "extra.log"), secretMarker, { mode: 0o600 });
  const unsafeArchive = join(runRoot, "unsafe.tar.gz");
  const extraFileFailure = await runCli([
    "diagnose", "--archive", reviewDirectory, "--output", unsafeArchive
  ], false);
  if (!extraFileFailure.stderr.toLowerCase().includes("exactly one regular manifest.json")) {
    throw new Error("Published archive extra-file rejection did not expose the strict boundary.");
  }
  if (existsSync(unsafeArchive)) {
    throw new Error("Published archive extra-file rejection created an unsafe archive.");
  }
  assertProductHomeAbsent();

  validationRecord = {
    validation_schema_version: "published-diagnostics-acceptance-v1",
    evidence_class: "exact_published_npm",
    published_channel: "npm",
    package_name: publishedEvidence.package_name,
    package_version: publishedEvidence.package_version,
    artifact: {
      file_name: basename(artifactPath),
      size_bytes: statSync(artifactPath).size,
      sha256: actualSha256,
      integrity: publishedEvidence.artifact_integrity,
      registry_record_identity: publishedEvidence.registry_record_identity
    },
    host: {
      platform: process.platform,
      architecture: process.arch,
      node_version: process.version.replace(/^v/u, "")
    },
    checks: {
      isolated_exact_archive_install: true,
      diagnose_read_only_empty_home: true,
      review_directory_exact_manifest: true,
      manifest_privacy_boundary: true,
      deterministic_archive: true,
      archive_entries: archiveEntries,
      archive_manifest_exact_match: true,
      overwrite_rejected_without_mutation: true,
      extra_file_rejected_without_archive: true,
      no_upload_or_submission: true
    },
    manifest: {
      schema_version: manifest.diagnostic_manifest_schema_version,
      sha256: createHash("sha256").update(manifestBytes).digest("hex")
    },
    archive: {
      sha256: firstArchiveHashBeforeOverwrite,
      size_bytes: firstArchiveBytes.length
    },
    command_output_digests: {
      diagnose: sha256Text(localSummary.stdout),
      prepare: sha256Text(prepared.stdout),
      archive_first: sha256Text(firstArchiveRun.stdout),
      archive_second: sha256Text(secondArchiveRun.stdout)
    },
    support_claim_allowed: false,
    production_learning_ready: false,
    runtime_cleaned: false,
    generated_at: new Date().toISOString()
  };
} catch (error) {
  failure = error;
}

try {
  rmSync(runRoot, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100
  });
} catch (error) {
  failure ??= error;
}

if (failure) throw failure;
if (!validationRecord || existsSync(runRoot)) {
  throw new Error("Published diagnostics validation runtime cleanup failed.");
}
validationRecord.runtime_cleaned = true;
validationRecord.validation_digest = digestPublishedDiagnosticsRecord(validationRecord);
mkdirSync(dirname(evidenceOutputPath), { recursive: true });
writeFileSync(
  evidenceOutputPath,
  `${JSON.stringify(validationRecord, null, 2)}\n`,
  { encoding: "utf8", flag: "wx", mode: 0o600 }
);
process.stdout.write(`${JSON.stringify({
  status: "published_diagnostics_validated",
  package_name: validationRecord.package_name,
  package_version: validationRecord.package_version,
  artifact_sha256: validationRecord.artifact.sha256,
  archive_sha256: validationRecord.archive.sha256,
  runtime_cleaned: validationRecord.runtime_cleaned,
  support_claim_allowed: false,
  production_learning_ready: false,
  validation_digest: validationRecord.validation_digest
}, null, 2)}\n`);
