import { describe, expect, it } from "vitest";
import {
  ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS,
  DISTRIBUTION_ATTESTATION_FIELDS,
  DISTRIBUTION_ATTESTATION_VERSION,
  DOCUMENTATION_EVIDENCE_TIERS,
  EMBEDDED_CLOSURE_MANIFEST_FIELDS,
  PUBLISHED_DISTRIBUTION_CHANNELS,
  PUBLISHED_RUNTIME_CLOSURE_CONTRACT_FIXTURE,
  PUBLISHED_RUNTIME_EVIDENCE_CLASSES,
  WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS,
  WINDOWS_OPENCLAW_RESOLUTION_RECORD_FIELDS,
  WINDOWS_OPENCLAW_RESOLUTION_SOURCES
} from "../../src/runtime/distribution/constants.js";
import {
  PublishedRuntimeClosureError,
  assertArtifactValidationSequence,
  assertDocumentationEvidenceMatrix,
  assertRuntimeDistributionAttestation,
  assertWindowsOpenClawResolutionRecord,
  createPendingArtifactValidationSequence
} from "../../src/runtime/distribution/contract.js";
import type {
  DocumentationEvidenceMatrix,
  RuntimeDistributionAttestation
} from "../../src/runtime/distribution/types.js";

const attestation = (): RuntimeDistributionAttestation => ({
  distribution_manifest_version: DISTRIBUTION_ATTESTATION_VERSION,
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  published_channel: "npm",
  artifact_integrity: "sha512-artifact",
  artifact_size: 1024,
  closure_manifest_digest: "closure-digest",
  profile_registry_digest: "profile-digest",
  dependency_closure_digest: "dependency-digest",
  compatibility_metadata_digest: "compatibility-digest",
  registry_record_identity: "npm:@alan512/experienceengine@0.4.8",
  created_at: "2026-07-13T12:00:00.000Z"
});

const documentationMatrix = (): DocumentationEvidenceMatrix => ({
  matrix_schema_version: "documentation-evidence-matrix-v1",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  generated_at: "2026-07-13T12:00:00.000Z",
  entries: DOCUMENTATION_EVIDENCE_TIERS.map((evidenceTier) => ({
    evidence_tier: evidenceTier,
    published_channel: evidenceTier === "published_npm_validated"
      ? "npm"
      : evidenceTier === "published_clawhub_validated"
        ? "clawhub"
        : null,
    package_version: "0.4.8",
    artifact_integrity: null,
    validation_report_digest: null,
    live_activation_evidence_digest: null,
    support_claim_allowed: false,
    limitations: []
  }))
});

describe("published runtime closure contract", () => {
  it("materializes every imported schema, evidence class, channel, and validation step", () => {
    expect(EMBEDDED_CLOSURE_MANIFEST_FIELDS).toEqual([
      "closure_manifest_version",
      "package_name",
      "package_version",
      "package_build_id",
      "required_entrypoints",
      "required_runtime_files",
      "required_schema_and_migrations",
      "profile_registry_digest",
      "dependency_requirements_digest",
      "compatibility_metadata_digest",
      "closure_manifest_digest"
    ]);
    expect(DISTRIBUTION_ATTESTATION_FIELDS).toHaveLength(12);
    expect(PUBLISHED_DISTRIBUTION_CHANNELS).toEqual(["npm", "clawhub"]);
    expect(PUBLISHED_RUNTIME_EVIDENCE_CLASSES).toEqual([
      "source_repo",
      "local_pack",
      "published_npm",
      "published_clawhub",
      "installed_artifact",
      "live_host"
    ]);
    expect(ACTUAL_DOWNLOADED_ARTIFACT_VALIDATION_STEPS).toHaveLength(8);
    expect(WINDOWS_OPENCLAW_RESOLUTION_SOURCES).toEqual([
      "operator_configured_path",
      "host_provided_path",
      "path_lookup"
    ]);
    expect(WINDOWS_OPENCLAW_EXECUTABLE_EXTENSIONS).toEqual([
      ".exe",
      ".cmd",
      ".bat"
    ]);
    expect(WINDOWS_OPENCLAW_RESOLUTION_RECORD_FIELDS).toHaveLength(5);
    expect(PUBLISHED_RUNTIME_CLOSURE_CONTRACT_FIXTURE).toMatchObject({
      canonical_activation_requires_global_ee: false,
      canonical_activation_invokes_global_openclaw: false,
      npm_and_clawhub_evidence_interchangeable: false,
      installed_artifact_evidence_satisfies_live_host: false,
      artifact_runtime_validated_separate_from_support_claim: true
    });
  });

  it("accepts only an exact external attestation schema", () => {
    expect(assertRuntimeDistributionAttestation(attestation())).toEqual(attestation());
    const missing = { ...attestation() } as Record<string, unknown>;
    delete missing.registry_record_identity;
    expect(() => assertRuntimeDistributionAttestation(missing)).toThrowError(
      PublishedRuntimeClosureError
    );
    expect(() => assertRuntimeDistributionAttestation({
      ...attestation(),
      source_checkout_path: "forbidden"
    })).toThrow(/not exhaustive/u);
  });

  it("requires the exact ordered eight-step downloaded-artifact validation sequence", () => {
    const sequence = createPendingArtifactValidationSequence();
    expect(assertArtifactValidationSequence(sequence)).toEqual(sequence);
    expect(() => assertArtifactValidationSequence([
      sequence[1],
      sequence[0],
      ...sequence.slice(2)
    ])).toThrow(/out of order/u);
    expect(() => assertArtifactValidationSequence(sequence.slice(0, 7))).toThrow(
      /exactly eight/u
    );
  });

  it("freezes bounded Windows resolution evidence and unresolved mapping", () => {
    expect(assertWindowsOpenClawResolutionRecord({
      resolution_source: "path_lookup",
      resolved_executable_path_fingerprint: "path-fingerprint",
      resolved_extension: ".cmd",
      version_probe_status: "passed",
      version_probe_output_digest: "version-output-digest"
    })).toMatchObject({
      resolved_extension: ".cmd",
      version_probe_status: "passed"
    });
    let unresolved: unknown;
    try {
      assertWindowsOpenClawResolutionRecord({
        resolution_source: "path_lookup",
        resolved_executable_path_fingerprint: null,
        resolved_extension: null,
        version_probe_status: "not_run",
        version_probe_output_digest: null
      });
    } catch (error) {
      unresolved = error;
    }
    expect(unresolved).toBeInstanceOf(PublishedRuntimeClosureError);
    expect((unresolved as PublishedRuntimeClosureError).code).toBe(
      "EE_OPENCLAW_EXECUTABLE_UNRESOLVED"
    );
  });

  it("keeps source/local-pack evidence from authorizing published support", () => {
    const invalid = documentationMatrix();
    invalid.entries[0].support_claim_allowed = true;
    expect(() => assertDocumentationEvidenceMatrix(invalid)).toThrow(
      /cannot authorize/u
    );
    const valid = documentationMatrix();
    valid.entries[2].support_claim_allowed = true;
    valid.entries[2].artifact_integrity = "sha512-npm";
    valid.entries[2].validation_report_digest = "report-npm";
    expect(assertDocumentationEvidenceMatrix(valid)).toBe(valid);
  });
});
