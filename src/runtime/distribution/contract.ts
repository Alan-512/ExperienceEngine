import { canonicalJson } from "../package/package-generation.js";
import {
  ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS,
  ARTIFACT_VALIDATION_STEP_RECORD_FIELDS,
  ARTIFACT_VALIDATION_STEP_STATUSES,
  DISTRIBUTION_ATTESTATION_FIELDS,
  DISTRIBUTION_ATTESTATION_VERSION,
  DOCUMENTATION_EVIDENCE_TIERS,
  PUBLISHED_DISTRIBUTION_CHANNELS,
  WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS,
  WINDOWS_OPENCLAW_RESOLUTION_RECORD_FIELDS,
  WINDOWS_OPENCLAW_RESOLUTION_SOURCES,
  WINDOWS_OPENCLAW_VERSION_PROBE_STATUSES
} from "./constants.js";
import type {
  ArtifactValidationStepRecord,
  DocumentationEvidenceMatrix,
  RuntimeDistributionAttestation,
  WindowsOpenClawResolutionRecord
} from "./types.js";

export type PublishedRuntimeClosureErrorCode =
  | "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID"
  | "EE_PUBLISHED_CHANNEL_MISMATCH"
  | "EE_PUBLISHED_VALIDATION_SEQUENCE_INVALID"
  | "EE_PUBLISHED_ARTIFACT_VERSION_INVALID"
  | "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED"
  | "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH"
  | "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID"
  | "EE_OPENCLAW_EXECUTABLE_UNRESOLVED"
  | "EE_OPENCLAW_SECURITY_APPROVAL_REQUIRED"
  | "EE_OPENCLAW_LIVE_HOST_COMMAND_FAILED"
  | "EE_OPENCLAW_LIVE_HOST_SHUTDOWN_TIMEOUT"
  | "EE_OPENCLAW_LIVE_HOST_GATEWAY_UNHEALTHY"
  | "EE_OPENCLAW_LIVE_HOST_PLUGIN_NOT_INSTALLED"
  | "EE_OPENCLAW_LIVE_HOST_PLUGIN_NOT_LOADED"
  | "EE_OPENCLAW_LIVE_HOST_AGENT_TURN_FAILED"
  | "EE_OPENCLAW_LIVE_HOST_QUEUE_EVIDENCE_INVALID"
  | "EE_OPENCLAW_LIVE_HOST_AUTHORITY_TIMEOUT"
  | "EE_OPENCLAW_LIVE_HOST_RESTART_RECOVERY_TIMEOUT"
  | "EE_OPENCLAW_LIVE_HOST_SHUTDOWN_EVIDENCE_TIMEOUT"
  | "EE_DOCUMENTATION_EVIDENCE_INVALID";

export class PublishedRuntimeClosureError extends Error {
  constructor(
    readonly code: PublishedRuntimeClosureErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PublishedRuntimeClosureError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void => {
  const observed = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  if (canonicalJson(observed) !== canonicalJson(normalizedExpected)) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `${label} fields are not exhaustive.`
    );
  }
};

const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `${field} must be a non-empty string.`
    );
  }
  return value;
};

const assertNullableString = (value: unknown, field: string): string | null => {
  if (value === null) {
    return null;
  }
  return assertNonEmptyString(value, field);
};

export const assertRuntimeDistributionAttestation = (
  value: unknown
): RuntimeDistributionAttestation => {
  if (!isRecord(value)) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Distribution attestation must be an object."
    );
  }
  assertExactKeys(value, DISTRIBUTION_ATTESTATION_FIELDS, "Distribution attestation");
  if (value.distribution_manifest_version !== DISTRIBUTION_ATTESTATION_VERSION) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Distribution attestation version is unsupported."
    );
  }
  if (!PUBLISHED_DISTRIBUTION_CHANNELS.includes(
    value.published_channel as typeof PUBLISHED_DISTRIBUTION_CHANNELS[number]
  )) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Distribution attestation channel is invalid."
    );
  }
  if (!Number.isSafeInteger(value.artifact_size) || Number(value.artifact_size) < 0) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Distribution artifact size must be a non-negative safe integer."
    );
  }
  for (const field of [
    "package_name",
    "package_version",
    "artifact_integrity",
    "closure_manifest_digest",
    "profile_registry_digest",
    "dependency_closure_digest",
    "compatibility_metadata_digest",
    "registry_record_identity",
    "created_at"
  ] as const) {
    assertNonEmptyString(value[field], field);
  }
  return value as RuntimeDistributionAttestation;
};

export const createPendingArtifactValidationSequence = ():
ArtifactValidationStepRecord[] => ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS.map(
  (stepId, index) => ({
    step_id: stepId,
    step_order: index + 1,
    status: "pending",
    evidence_digest: null,
    failure_code: null,
    started_at: null,
    completed_at: null
  })
);

export const assertArtifactValidationSequence = (
  value: unknown
): ArtifactValidationStepRecord[] => {
  if (!Array.isArray(value) || value.length !== ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS.length) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_VALIDATION_SEQUENCE_INVALID",
      "Published artifact validation requires exactly eight ordered steps."
    );
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_VALIDATION_SEQUENCE_INVALID",
        `Validation step ${index + 1} must be an object.`
      );
    }
    assertExactKeys(item, ARTIFACT_VALIDATION_STEP_RECORD_FIELDS, `Validation step ${index + 1}`);
    const expectedId = ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS[index];
    if (item.step_id !== expectedId || item.step_order !== index + 1) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_VALIDATION_SEQUENCE_INVALID",
        `Validation step ${index + 1} is out of order or has the wrong identity.`
      );
    }
    if (!ARTIFACT_VALIDATION_STEP_STATUSES.includes(
      item.status as typeof ARTIFACT_VALIDATION_STEP_STATUSES[number]
    )) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_VALIDATION_SEQUENCE_INVALID",
        `Validation step ${index + 1} has an invalid status.`
      );
    }
    assertNullableString(item.evidence_digest, "evidence_digest");
    assertNullableString(item.failure_code, "failure_code");
    assertNullableString(item.started_at, "started_at");
    assertNullableString(item.completed_at, "completed_at");
    return item as ArtifactValidationStepRecord;
  });
};

export const assertWindowsOpenClawResolutionRecord = (
  value: unknown
): WindowsOpenClawResolutionRecord => {
  if (!isRecord(value)) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Windows OpenClaw resolution evidence must be an object."
    );
  }
  assertExactKeys(value, WINDOWS_OPENCLAW_RESOLUTION_RECORD_FIELDS, "Windows resolution record");
  if (!WINDOWS_OPENCLAW_RESOLUTION_SOURCES.includes(
    value.resolution_source as typeof WINDOWS_OPENCLAW_RESOLUTION_SOURCES[number]
  )) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Windows resolution source is invalid."
    );
  }
  const pathFingerprint = assertNullableString(
    value.resolved_executable_path_fingerprint,
    "resolved_executable_path_fingerprint"
  );
  const extension = value.resolved_extension;
  if (
    extension !== null &&
    !WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS.includes(
      extension as typeof WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS[number]
    )
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Windows executable extension is unsupported."
    );
  }
  if (!WINDOWS_OPENCLAW_VERSION_PROBE_STATUSES.includes(
    value.version_probe_status as typeof WINDOWS_OPENCLAW_VERSION_PROBE_STATUSES[number]
  )) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Windows version probe status is invalid."
    );
  }
  const outputDigest = assertNullableString(
    value.version_probe_output_digest,
    "version_probe_output_digest"
  );
  if (
    value.version_probe_status === "passed" &&
    (!pathFingerprint || extension === null || !outputDigest)
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "A passed Windows version probe requires executable, extension, and output evidence."
    );
  }
  if (
    value.version_probe_status !== "passed" &&
    pathFingerprint === null &&
    extension === null
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_EXECUTABLE_UNRESOLVED",
      "No supported Windows OpenClaw executable was resolved."
    );
  }
  return value as WindowsOpenClawResolutionRecord;
};

export const assertDocumentationEvidenceMatrix = (
  value: DocumentationEvidenceMatrix
): DocumentationEvidenceMatrix => {
  const observedTiers = value.entries.map((entry) => entry.evidence_tier);
  if (canonicalJson(observedTiers) !== canonicalJson(DOCUMENTATION_EVIDENCE_TIERS)) {
    throw new PublishedRuntimeClosureError(
      "EE_DOCUMENTATION_EVIDENCE_INVALID",
      "Documentation evidence matrix must contain every evidence tier in order."
    );
  }
  for (const entry of value.entries) {
    if (
      entry.support_claim_allowed &&
      ![
        "published_npm_validated",
        "published_clawhub_validated",
        "host_native_runtime_validated"
      ].includes(entry.evidence_tier)
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_DOCUMENTATION_EVIDENCE_INVALID",
        "Source or local-pack evidence cannot authorize a published support claim."
      );
    }
    if (
      entry.evidence_tier === "published_npm_validated" &&
      entry.published_channel !== "npm"
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_CHANNEL_MISMATCH",
        "npm documentation evidence must bind the npm channel."
      );
    }
    if (
      entry.evidence_tier === "published_clawhub_validated" &&
      entry.published_channel !== "clawhub"
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_CHANNEL_MISMATCH",
        "ClawHub documentation evidence must bind the ClawHub channel."
      );
    }
  }
  return value;
};
