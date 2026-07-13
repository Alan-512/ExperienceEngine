import { readFile, stat } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import type {
  RuntimeClosureManifest
} from "../identity/types.js";
import {
  RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH,
  validateRuntimeClosureManifest,
  type RuntimeClosureValidationReport
} from "../package/closure-manifest.js";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import type {
  MaterializedPublishedArtifact
} from "./artifact-materializer.js";
import {
  assertRuntimeDistributionAttestation,
  PublishedRuntimeClosureError
} from "./contract.js";
import type {
  RuntimeDistributionAttestation
} from "./types.js";

export type InstalledDependencyClosureRecord = {
  package_name: string;
  package_version: string;
  metadata_digest: string;
};

export type PublishedArtifactClosureInspection = {
  valid: boolean;
  published_channel: MaterializedPublishedArtifact["published_channel"];
  package_name: string;
  package_version: string;
  artifact_integrity: string;
  artifact_size: number;
  registry_record_identity: string;
  closure_manifest_digest: string | null;
  dependency_closure_digest: string | null;
  issues: string[];
};

type PackageMetadata = {
  name?: unknown;
  version?: unknown;
  dependencies?: unknown;
  optionalDependencies?: unknown;
};

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const stringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
};

const resolveDependencyPackageJson = async (
  fromPackageRoot: string,
  dependencyName: string
): Promise<string | undefined> => {
  let cursor = resolve(fromPackageRoot);
  const dependencySegments = dependencyName.split("/");
  while (true) {
    const candidate = join(cursor, "node_modules", ...dependencySegments, "package.json");
    const candidateStat = await stat(candidate).catch(() => undefined);
    if (candidateStat?.isFile()) {
      return candidate;
    }
    const parent = dirname(cursor);
    if (parent === cursor || parse(cursor).root === cursor) {
      return undefined;
    }
    cursor = parent;
  }
};

export const deriveInstalledDependencyClosure = async (
  packageRoot: string
): Promise<{
  records: InstalledDependencyClosureRecord[];
  digest: string;
}> => {
  const rootMetadata = await readJson<PackageMetadata>(join(packageRoot, "package.json"));
  const queue: Array<{
    fromPackageRoot: string;
    dependencyName: string;
    optional: boolean;
  }> = [
    ...Object.keys(stringRecord(rootMetadata.dependencies)).map((dependencyName) => ({
      fromPackageRoot: packageRoot,
      dependencyName,
      optional: false
    })),
    ...Object.keys(stringRecord(rootMetadata.optionalDependencies)).map((dependencyName) => ({
      fromPackageRoot: packageRoot,
      dependencyName,
      optional: true
    }))
  ];
  const visitedPackageJsonPaths = new Set<string>();
  const records: InstalledDependencyClosureRecord[] = [];
  while (queue.length > 0) {
    const next = queue.shift()!;
    const dependencyPackageJson = await resolveDependencyPackageJson(
      next.fromPackageRoot,
      next.dependencyName
    );
    if (!dependencyPackageJson) {
      if (next.optional) {
        continue;
      }
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
        `Installed dependency ${next.dependencyName} is missing from the isolated package closure.`
      );
    }
    const normalizedPackageJson = resolve(dependencyPackageJson);
    if (visitedPackageJsonPaths.has(normalizedPackageJson)) {
      continue;
    }
    visitedPackageJsonPaths.add(normalizedPackageJson);
    const metadata = await readJson<PackageMetadata>(normalizedPackageJson);
    if (typeof metadata.name !== "string" || typeof metadata.version !== "string") {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
        `Installed dependency ${next.dependencyName} has invalid package metadata.`
      );
    }
    const dependencies = stringRecord(metadata.dependencies);
    const optionalDependencies = stringRecord(metadata.optionalDependencies);
    records.push({
      package_name: metadata.name,
      package_version: metadata.version,
      metadata_digest: sha256Text(canonicalJson({
        name: metadata.name,
        version: metadata.version,
        dependencies,
        optionalDependencies
      }))
    });
    const dependencyRoot = dirname(normalizedPackageJson);
    queue.push(
      ...Object.keys(dependencies).map((dependencyName) => ({
        fromPackageRoot: dependencyRoot,
        dependencyName,
        optional: false
      })),
      ...Object.keys(optionalDependencies).map((dependencyName) => ({
        fromPackageRoot: dependencyRoot,
        dependencyName,
        optional: true
      }))
    );
  }
  records.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  return {
    records,
    digest: sha256Text(canonicalJson(records))
  };
};

export const createRuntimeDistributionAttestation = (options: {
  artifact: MaterializedPublishedArtifact;
  manifest: RuntimeClosureManifest;
  dependencyClosureDigest: string;
  createdAt?: string;
}): RuntimeDistributionAttestation => ({
  distribution_manifest_version: "runtime-distribution-attestation-v1",
  package_name: options.artifact.package_name,
  package_version: options.artifact.package_version,
  published_channel: options.artifact.published_channel,
  artifact_integrity: options.artifact.artifact_integrity,
  artifact_size: options.artifact.artifact_size,
  closure_manifest_digest: options.manifest.closure_manifest_digest,
  profile_registry_digest: options.manifest.profile_registry_digest,
  dependency_closure_digest: options.dependencyClosureDigest,
  compatibility_metadata_digest: options.manifest.compatibility_metadata_digest,
  registry_record_identity: options.artifact.registry_record_identity,
  created_at: options.createdAt ?? new Date().toISOString()
});

export const inspectPublishedArtifactClosure = async (options: {
  artifact: MaterializedPublishedArtifact;
  packageRoot: string;
  attestation: RuntimeDistributionAttestation;
  closureValidator?: (packageRoot: string) => RuntimeClosureValidationReport;
  manifestReader?: (packageRoot: string) => Promise<RuntimeClosureManifest>;
  dependencyClosureDeriver?: typeof deriveInstalledDependencyClosure;
}): Promise<PublishedArtifactClosureInspection> => {
  const issues: string[] = [];
  let attestation: RuntimeDistributionAttestation;
  try {
    attestation = assertRuntimeDistributionAttestation(options.attestation);
  } catch (error) {
    return {
      valid: false,
      published_channel: options.artifact.published_channel,
      package_name: options.artifact.package_name,
      package_version: options.artifact.package_version,
      artifact_integrity: options.artifact.artifact_integrity,
      artifact_size: options.artifact.artifact_size,
      registry_record_identity: options.artifact.registry_record_identity,
      closure_manifest_digest: null,
      dependency_closure_digest: null,
      issues: [
        `distribution_attestation_invalid:${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }
  if (attestation.published_channel !== options.artifact.published_channel) {
    issues.push("published_channel_mismatch");
  }
  if (
    attestation.package_name !== options.artifact.package_name ||
    attestation.package_version !== options.artifact.package_version
  ) {
    issues.push("package_identity_mismatch");
  }
  if (attestation.artifact_integrity !== options.artifact.artifact_integrity) {
    issues.push("artifact_integrity_mismatch");
  }
  if (attestation.artifact_size !== options.artifact.artifact_size) {
    issues.push("artifact_size_mismatch");
  }
  if (
    attestation.registry_record_identity !==
      options.artifact.registry_record_identity
  ) {
    issues.push("registry_record_identity_mismatch");
  }
  const closureReport = (
    options.closureValidator ?? validateRuntimeClosureManifest
  )(options.packageRoot);
  issues.push(...closureReport.issues.map((issue) => `closure:${issue}`));
  let manifest: RuntimeClosureManifest | undefined;
  try {
    manifest = await (
      options.manifestReader ?? (async (packageRoot) => readJson<RuntimeClosureManifest>(
        join(
          packageRoot,
          ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/")
        )
      ))
    )(options.packageRoot);
  } catch (error) {
    issues.push(`embedded_manifest_unreadable:${error instanceof Error ? error.message : String(error)}`);
  }
  let dependencyClosureDigest: string | null = null;
  if (manifest) {
    if (manifest.package_name !== options.artifact.package_name ||
      manifest.package_version !== options.artifact.package_version) {
      issues.push("embedded_package_identity_mismatch");
    }
    if (manifest.closure_manifest_digest !== attestation.closure_manifest_digest) {
      issues.push("closure_manifest_digest_mismatch");
    }
    if (manifest.profile_registry_digest !== attestation.profile_registry_digest) {
      issues.push("profile_registry_digest_mismatch");
    }
    if (
      manifest.compatibility_metadata_digest !==
        attestation.compatibility_metadata_digest
    ) {
      issues.push("compatibility_metadata_digest_mismatch");
    }
  }
  try {
    dependencyClosureDigest = (
      await (
        options.dependencyClosureDeriver ?? deriveInstalledDependencyClosure
      )(options.packageRoot)
    ).digest;
    if (dependencyClosureDigest !== attestation.dependency_closure_digest) {
      issues.push("dependency_closure_digest_mismatch");
    }
  } catch (error) {
    issues.push(`dependency_closure_invalid:${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    valid: issues.length === 0 && closureReport.valid,
    published_channel: options.artifact.published_channel,
    package_name: options.artifact.package_name,
    package_version: options.artifact.package_version,
    artifact_integrity: options.artifact.artifact_integrity,
    artifact_size: options.artifact.artifact_size,
    registry_record_identity: options.artifact.registry_record_identity,
    closure_manifest_digest: manifest?.closure_manifest_digest ?? null,
    dependency_closure_digest: dependencyClosureDigest,
    issues
  };
};

export const assertPublishedArtifactClosure = async (
  options: Parameters<typeof inspectPublishedArtifactClosure>[0]
): Promise<PublishedArtifactClosureInspection> => {
  const report = await inspectPublishedArtifactClosure(options);
  if (!report.valid) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `Published artifact closure validation failed: ${report.issues.join(", ")}.`
    );
  }
  return report;
};
