import { createHash } from "node:crypto";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import type {
  ClawHubArtifactDownloader
} from "./artifact-materializer.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";

const DEFAULT_CLAWHUB_BASE_URL = "https://clawhub.ai";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

type ClawHubArtifactMetadata = {
  package?: {
    name?: unknown;
    family?: unknown;
  };
  version?: unknown;
  artifact?: {
    kind?: unknown;
    format?: unknown;
    sha256?: unknown;
    size?: unknown;
    npmIntegrity?: unknown;
    npmShasum?: unknown;
    npmTarballName?: unknown;
    downloadUrl?: unknown;
  };
};

const sha512Sri = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const sha1Hex = (bytes: Uint8Array): string =>
  createHash("sha1").update(bytes).digest("hex");

const fetchWithTimeout = async (options: {
  url: URL;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await options.fetchImpl(options.url, {
      signal: controller.signal,
      headers: { Accept: "application/json, application/octet-stream" }
    });
  } catch (error) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED",
      `ClawHub request failed: ${
        error instanceof Error ? error.name : "unknown_error"
      }.`
    );
  } finally {
    clearTimeout(timeout);
  }
};

const requireResponseOk = async (
  response: Response,
  stage: string
): Promise<void> => {
  if (!response.ok) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED",
      `ClawHub ${stage} request failed with HTTP ${response.status}.`
    );
  }
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `ClawHub artifact metadata field ${field} is missing.`
    );
  }
  return value.trim();
};

const requireSafeFilename = (value: unknown): string => {
  const filename = requireString(value, "npmTarballName");
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename === "." ||
    filename === ".."
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "ClawHub artifact metadata contains an unsafe tarball filename."
    );
  }
  return filename;
};

const parseMetadata = (options: {
  value: unknown;
  packageName: string;
  packageVersion: string;
  baseUrl: URL;
}): {
  sha256: string;
  size: number;
  npmIntegrity: string;
  npmShasum: string;
  filename: string;
  downloadUrl: URL;
  registryRecordIdentity: string;
} => {
  const metadata = options.value as ClawHubArtifactMetadata;
  const artifact = metadata?.artifact;
  const sha256 = requireString(artifact?.sha256, "sha256").toLowerCase();
  const npmIntegrity = requireString(
    artifact?.npmIntegrity,
    "npmIntegrity"
  );
  const npmShasum = requireString(artifact?.npmShasum, "npmShasum")
    .toLowerCase();
  const downloadUrl = new URL(
    requireString(artifact?.downloadUrl, "downloadUrl"),
    options.baseUrl
  );
  if (
    metadata.package?.name !== options.packageName ||
    metadata.version !== options.packageVersion ||
    metadata.package?.family !== "code-plugin" ||
    artifact?.kind !== "npm-pack" ||
    artifact?.format !== "tgz" ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(npmIntegrity) ||
    !/^[a-f0-9]{40}$/u.test(npmShasum) ||
    !Number.isSafeInteger(artifact?.size) ||
    Number(artifact?.size) < 1 ||
    downloadUrl.origin !== options.baseUrl.origin
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "ClawHub artifact metadata does not describe the exact supported npm-pack artifact."
    );
  }
  const size = Number(artifact!.size);
  const filename = requireSafeFilename(artifact?.npmTarballName);
  const registryRecord = {
    package_name: options.packageName,
    package_version: options.packageVersion,
    family: metadata.package.family,
    artifact_kind: artifact.kind,
    artifact_format: artifact.format,
    artifact_sha256: sha256,
    artifact_size: size,
    npm_integrity: npmIntegrity,
    npm_shasum: npmShasum,
    npm_tarball_name: filename,
    download_path: downloadUrl.pathname
  };
  return {
    sha256,
    size,
    npmIntegrity,
    npmShasum,
    filename,
    downloadUrl,
    registryRecordIdentity:
      `clawhub:${options.packageName}@${options.packageVersion}:` +
      sha256Text(canonicalJson(registryRecord))
  };
};

export const createPublicClawHubArtifactDownloader = (options: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxArtifactBytes?: number;
} = {}): ClawHubArtifactDownloader => async (request) => {
  const baseUrl = new URL(options.baseUrl ?? DEFAULT_CLAWHUB_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const metadataUrl = new URL(baseUrl);
  metadataUrl.pathname =
    `/api/v1/packages/${encodeURIComponent(request.packageName)}` +
    `/versions/${encodeURIComponent(request.packageVersion)}/artifact`;
  const metadataResponse = await fetchWithTimeout({
    url: metadataUrl,
    fetchImpl,
    timeoutMs
  });
  await requireResponseOk(metadataResponse, "artifact metadata");
  let metadataJson: unknown;
  try {
    metadataJson = await metadataResponse.json();
  } catch {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "ClawHub artifact metadata is not valid JSON."
    );
  }
  const metadata = parseMetadata({
    value: metadataJson,
    packageName: request.packageName,
    packageVersion: request.packageVersion,
    baseUrl
  });
  const maxArtifactBytes = options.maxArtifactBytes ??
    DEFAULT_MAX_ARTIFACT_BYTES;
  if (metadata.size > maxArtifactBytes) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED",
      "ClawHub artifact metadata exceeds the configured artifact size limit."
    );
  }
  const artifactResponse = await fetchWithTimeout({
    url: metadata.downloadUrl,
    fetchImpl,
    timeoutMs
  });
  await requireResponseOk(artifactResponse, "artifact download");
  const headerSha256 = artifactResponse.headers
    .get("X-ClawHub-Artifact-Sha256")?.trim().toLowerCase();
  const headerNpmIntegrity = artifactResponse.headers
    .get("X-ClawHub-Npm-Integrity")?.trim();
  const headerNpmShasum = artifactResponse.headers
    .get("X-ClawHub-Npm-Shasum")?.trim().toLowerCase();
  if (
    headerSha256 !== metadata.sha256 ||
    headerNpmIntegrity !== metadata.npmIntegrity ||
    headerNpmShasum !== metadata.npmShasum
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH",
      "ClawHub artifact response headers do not match registry metadata."
    );
  }
  const bytes = new Uint8Array(await artifactResponse.arrayBuffer());
  if (
    bytes.byteLength !== metadata.size ||
    bytes.byteLength > maxArtifactBytes ||
    sha256Hex(bytes) !== metadata.sha256 ||
    sha512Sri(bytes) !== metadata.npmIntegrity ||
    sha1Hex(bytes) !== metadata.npmShasum
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH",
      "Downloaded ClawHub artifact bytes do not match exact registry metadata."
    );
  }
  return {
    package_name: request.packageName,
    package_version: request.packageVersion,
    artifact_bytes: bytes,
    artifact_integrity: metadata.npmIntegrity,
    registry_record_identity: metadata.registryRecordIdentity,
    filename: metadata.filename
  };
};

export const PUBLIC_CLAWHUB_ARTIFACT_DOWNLOADER_CONTRACT = Object.freeze({
  exact_version_artifact_resolver_required: true,
  npm_pack_artifact_only: true,
  same_origin_download_required: true,
  metadata_sha256_required: true,
  response_integrity_headers_required: true,
  sha256_sha512_and_sha1_verified: true,
  bounded_artifact_size: true
});
