import { createHash } from "node:crypto";
import {
  RUNTIME_PACKAGE_GENERATION_SCHEMA_VERSION
} from "../identity/constants.js";
import type {
  RuntimeClosureManifest,
  RuntimePackageGenerationIdentity,
  RuntimePublishedChannel
} from "../identity/types.js";

type RuntimePackageCompatibility = Pick<
  RuntimePackageGenerationIdentity,
  | "supervisor_protocol_version"
  | "worker_protocol_version"
  | "control_protocol_version"
  | "min_read_schema_version"
  | "max_read_schema_version"
  | "min_write_schema_version"
  | "max_write_schema_version"
  | "target_schema_version"
>;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

export const sha256Text = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const requiredEntrypoint = (manifest: RuntimeClosureManifest, role: string): string => {
  const matches = manifest.required_entrypoints.filter((entry) => entry.role === role);
  if (matches.length !== 1) {
    throw new Error(`Runtime closure must contain exactly one ${role} entrypoint.`);
  }
  return matches[0].path;
};

export const createRuntimePackageGenerationIdentity = (options: {
  manifest: RuntimeClosureManifest;
  artifactIntegrity: string;
  installRecordIdentity: string;
  publishedChannel: RuntimePublishedChannel;
  compatibility: RuntimePackageCompatibility;
}): RuntimePackageGenerationIdentity => {
  const identityWithoutGenerationId = {
    package_generation_schema_version: RUNTIME_PACKAGE_GENERATION_SCHEMA_VERSION,
    package_name: options.manifest.package_name,
    package_version: options.manifest.package_version,
    artifact_integrity: options.artifactIntegrity,
    install_record_identity: options.installRecordIdentity,
    plugin_entrypoint: requiredEntrypoint(options.manifest, "openclaw_plugin"),
    supervisor_entrypoint: requiredEntrypoint(options.manifest, "package_local_supervisor"),
    worker_entrypoint: requiredEntrypoint(options.manifest, "package_local_worker"),
    ...options.compatibility,
    profile_registry_digest: options.manifest.profile_registry_digest,
    published_channel: options.publishedChannel,
    closure_manifest_digest: options.manifest.closure_manifest_digest
  };

  return {
    package_name: identityWithoutGenerationId.package_name,
    package_version: identityWithoutGenerationId.package_version,
    package_generation_id: `pkg_${sha256Text(canonicalJson(identityWithoutGenerationId))}`,
    artifact_integrity: identityWithoutGenerationId.artifact_integrity,
    install_record_identity: identityWithoutGenerationId.install_record_identity,
    plugin_entrypoint: identityWithoutGenerationId.plugin_entrypoint,
    supervisor_entrypoint: identityWithoutGenerationId.supervisor_entrypoint,
    worker_entrypoint: identityWithoutGenerationId.worker_entrypoint,
    supervisor_protocol_version: identityWithoutGenerationId.supervisor_protocol_version,
    worker_protocol_version: identityWithoutGenerationId.worker_protocol_version,
    control_protocol_version: identityWithoutGenerationId.control_protocol_version,
    profile_registry_digest: identityWithoutGenerationId.profile_registry_digest,
    min_read_schema_version: identityWithoutGenerationId.min_read_schema_version,
    max_read_schema_version: identityWithoutGenerationId.max_read_schema_version,
    min_write_schema_version: identityWithoutGenerationId.min_write_schema_version,
    max_write_schema_version: identityWithoutGenerationId.max_write_schema_version,
    target_schema_version: identityWithoutGenerationId.target_schema_version,
    published_channel: identityWithoutGenerationId.published_channel
  };
};
