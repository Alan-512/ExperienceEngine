import { createHash } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  PublishedRuntimeClosureError
} from "./contract.js";
import type {
  PublishedDistributionChannel
} from "./constants.js";

export type MaterializedPublishedArtifact = {
  published_channel: PublishedDistributionChannel;
  package_name: string;
  package_version: string;
  artifact_path: string;
  artifact_integrity: string;
  artifact_size: number;
  registry_record_identity: string;
  materialized_at: string;
};

export type ClawHubArtifactDownload = {
  package_name: string;
  package_version: string;
  artifact_bytes: Uint8Array;
  artifact_integrity: string;
  registry_record_identity: string;
  filename: string;
};

export type ClawHubArtifactDownloader = (request: {
  packageName: string;
  packageVersion: string;
}) => Promise<ClawHubArtifactDownload>;

export type PublishedArtifactInstaller = (request: {
  artifact: MaterializedPublishedArtifact;
  installRoot: string;
}) => Promise<{ packageRoot: string }>;

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

const EXACT_SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

const assertExactPackageRequest = (
  packageName: string,
  packageVersion: string
): void => {
  if (
    packageName.length === 0 ||
    packageName.includes("\0") ||
    !EXACT_SEMVER_PATTERN.test(packageVersion)
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_VERSION_INVALID",
      "Published artifact materialization requires one exact package name and semantic version."
    );
  }
};

const sha256Text = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const digestBytes = (algorithm: string, bytes: Uint8Array): string =>
  createHash(algorithm).update(bytes).digest("base64");

const assertArtifactIntegrity = (
  bytes: Uint8Array,
  integrity: string
): void => {
  const separator = integrity.indexOf("-");
  if (separator <= 0 || separator === integrity.length - 1) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH",
      "Published artifact integrity is not a supported SRI value."
    );
  }
  const algorithm = integrity.slice(0, separator);
  const expected = integrity.slice(separator + 1);
  if (!new Set(["sha256", "sha384", "sha512"]).has(algorithm)) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH",
      `Unsupported published artifact integrity algorithm ${algorithm}.`
    );
  }
  if (digestBytes(algorithm, bytes) !== expected) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH",
      "Downloaded artifact bytes do not match registry integrity."
    );
  }
};

const safeArtifactFilename = (
  packageName: string,
  packageVersion: string,
  suggested: string
): string => {
  const candidate = basename(suggested).replace(/[^0-9A-Za-z._-]/gu, "-");
  if (candidate.length > 0 && candidate !== "." && candidate !== "..") {
    return candidate;
  }
  return `${packageName.replace(/[^0-9A-Za-z._-]/gu, "-")}-${packageVersion}.tgz`;
};

const writeMaterializedArtifact = async (options: {
  channel: PublishedDistributionChannel;
  packageName: string;
  packageVersion: string;
  destinationDirectory: string;
  bytes: Uint8Array;
  integrity: string;
  registryRecordIdentity: string;
  filename: string;
  now?: () => Date;
}): Promise<MaterializedPublishedArtifact> => {
  assertArtifactIntegrity(options.bytes, options.integrity);
  const destination = resolve(options.destinationDirectory);
  await mkdir(destination, { recursive: true });
  const artifactPath = join(
    destination,
    safeArtifactFilename(
      options.packageName,
      options.packageVersion,
      options.filename
    )
  );
  await writeFile(artifactPath, options.bytes, { flag: "wx", mode: 0o600 });
  const artifactStat = await stat(artifactPath);
  return {
    published_channel: options.channel,
    package_name: options.packageName,
    package_version: options.packageVersion,
    artifact_path: artifactPath,
    artifact_integrity: options.integrity,
    artifact_size: artifactStat.size,
    registry_record_identity: options.registryRecordIdentity,
    materialized_at: (options.now ?? (() => new Date()))().toISOString()
  };
};

export const materializeExactNpmArtifact = async (options: {
  packageName: string;
  packageVersion: string;
  destinationDirectory: string;
  registryBaseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
}): Promise<MaterializedPublishedArtifact> => {
  assertExactPackageRequest(options.packageName, options.packageVersion);
  const fetchImpl = options.fetchImpl ?? fetch;
  const registryBase = (options.registryBaseUrl ?? "https://registry.npmjs.org")
    .replace(/\/+$/u, "");
  const metadataUrl = `${registryBase}/${encodeURIComponent(options.packageName)}/${encodeURIComponent(options.packageVersion)}`;
  let metadataResponse: Response;
  try {
    metadataResponse = await fetchImpl(metadataUrl, {
      headers: { accept: "application/json" },
      redirect: "follow"
    });
  } catch (error) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED",
      `Unable to download exact npm metadata: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!metadataResponse.ok) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED",
      `Exact npm metadata request failed with HTTP ${metadataResponse.status}.`
    );
  }
  const metadata = await metadataResponse.json() as {
    name?: unknown;
    version?: unknown;
    dist?: {
      tarball?: unknown;
      integrity?: unknown;
    };
  };
  if (
    metadata.name !== options.packageName ||
    metadata.version !== options.packageVersion ||
    typeof metadata.dist?.tarball !== "string" ||
    typeof metadata.dist.integrity !== "string"
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_VERSION_INVALID",
      "npm registry metadata does not match the exact requested package version."
    );
  }
  const artifactResponse = await fetchImpl(metadata.dist.tarball, {
    redirect: "follow"
  });
  if (!artifactResponse.ok) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED",
      `Exact npm artifact request failed with HTTP ${artifactResponse.status}.`
    );
  }
  const bytes = new Uint8Array(await artifactResponse.arrayBuffer());
  const registryRecordIdentity = `npm:${options.packageName}@${options.packageVersion}:${sha256Text(JSON.stringify({
    integrity: metadata.dist.integrity,
    tarball: metadata.dist.tarball
  }))}`;
  return writeMaterializedArtifact({
    channel: "npm",
    packageName: options.packageName,
    packageVersion: options.packageVersion,
    destinationDirectory: options.destinationDirectory,
    bytes,
    integrity: metadata.dist.integrity,
    registryRecordIdentity,
    filename: basename(new URL(metadata.dist.tarball).pathname),
    now: options.now
  });
};

export const materializeExactClawHubArtifact = async (options: {
  packageName: string;
  packageVersion: string;
  destinationDirectory: string;
  downloader: ClawHubArtifactDownloader;
  now?: () => Date;
}): Promise<MaterializedPublishedArtifact> => {
  assertExactPackageRequest(options.packageName, options.packageVersion);
  const downloaded = await options.downloader({
    packageName: options.packageName,
    packageVersion: options.packageVersion
  });
  if (
    downloaded.package_name !== options.packageName ||
    downloaded.package_version !== options.packageVersion ||
    downloaded.registry_record_identity.length === 0
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_VERSION_INVALID",
      "ClawHub artifact identity does not match the exact requested version."
    );
  }
  return writeMaterializedArtifact({
    channel: "clawhub",
    packageName: options.packageName,
    packageVersion: options.packageVersion,
    destinationDirectory: options.destinationDirectory,
    bytes: downloaded.artifact_bytes,
    integrity: downloaded.artifact_integrity,
    registryRecordIdentity: downloaded.registry_record_identity,
    filename: downloaded.filename,
    now: options.now
  });
};

export const installMaterializedPublishedArtifact = async (options: {
  artifact: MaterializedPublishedArtifact;
  installRoot: string;
  installer: PublishedArtifactInstaller;
  cleanExisting?: boolean;
}): Promise<{ packageRoot: string }> => {
  const installRoot = resolve(options.installRoot);
  if (options.cleanExisting) {
    await rm(installRoot, { recursive: true, force: true });
  }
  await mkdir(installRoot, { recursive: true });
  const installed = await options.installer({
    artifact: options.artifact,
    installRoot
  });
  const packageRoot = resolve(installed.packageRoot);
  const relativePackageRoot = relative(installRoot, packageRoot);
  if (
    !isAbsolute(packageRoot) ||
    relativePackageRoot === "" ||
    relativePackageRoot.startsWith("..") ||
    isAbsolute(relativePackageRoot)
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
      "Published artifact installer must return a package root inside the isolated install root."
    );
  }
  const packageStat = await stat(packageRoot).catch(() => undefined);
  if (!packageStat?.isDirectory()) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
      "Published artifact installer did not materialize a package directory."
    );
  }
  return { packageRoot };
};
