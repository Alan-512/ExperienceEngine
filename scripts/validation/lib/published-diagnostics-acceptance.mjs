import { createHash } from "node:crypto";

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
};

export const digestPublishedDiagnosticsRecord = (record) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(record)), "utf8")
    .digest("hex");

export const assertPublishedDiagnosticManifestBoundary = (manifest, options) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Published diagnostic manifest must be an object.");
  }
  if (
    manifest.diagnostic_manifest_schema_version !== "diagnostic-manifest-v1" ||
    manifest.collection_policy_version !== "diagnostic-collection-policy-v1" ||
    manifest.error_aggregation_version !== "diagnostic-error-aggregation-v1"
  ) {
    throw new Error("Published diagnostic manifest contract identity is invalid.");
  }
  if (
    manifest.product?.package_name !== options.packageName ||
    manifest.product?.package_version !== options.packageVersion
  ) {
    throw new Error("Published diagnostic manifest package identity is invalid.");
  }
  const privacy = manifest.privacy;
  for (const key of [
    "raw_database_included",
    "raw_content_included",
    "absolute_paths_included",
    "credentials_included",
    "provider_payloads_included",
    "exact_model_id_included"
  ]) {
    if (privacy?.[key] !== false) {
      throw new Error(`Published diagnostic manifest privacy flag ${key} is not false.`);
    }
  }
  if (manifest.provider?.exact_model_id !== null) {
    throw new Error("Published diagnostic manifest exposed an exact model id without consent.");
  }
  const serialized = JSON.stringify(manifest);
  for (const forbidden of options.forbiddenValues ?? []) {
    if (typeof forbidden === "string" && forbidden.length > 0 && serialized.includes(forbidden)) {
      throw new Error("Published diagnostic manifest contains a forbidden runtime value.");
    }
  }
  return manifest;
};

export const assertExactDiagnosticArchiveEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length !== 1 || entries[0] !== "manifest.json") {
    throw new Error("Published diagnostic archive must contain exactly manifest.json.");
  }
  return entries;
};
