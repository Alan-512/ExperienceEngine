import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeClosureManifest } from "../../src/runtime/identity/types.js";
import type {
  MaterializedPublishedArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import type {
  InstalledArtifactRuntimeEvidence,
  PublishedLiveActivationEvidence
} from "../../src/runtime/distribution/types.js";
import {
  PublishedRuntimeClosureError
} from "../../src/runtime/distribution/contract.js";
import {
  validateExactPublishedNpmArtifactClosure
} from "../../src/runtime/distribution/npm-artifact-validator.js";

const temporaryRoots: string[] = [];

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-npm-validator-"));
  temporaryRoots.push(root);
  return root;
};

const artifact: MaterializedPublishedArtifact = {
  published_channel: "npm",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  artifact_path: "C:/isolated/download/experienceengine-0.4.8.tgz",
  artifact_integrity: "sha512-fixture",
  artifact_size: 123,
  registry_record_identity: "npm:fixture",
  materialized_at: "2026-07-13T12:00:00.000Z"
};

const manifest: RuntimeClosureManifest = {
  closure_manifest_version: "runtime-closure-v1",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  package_build_id: "build-fixture",
  required_entrypoints: [],
  required_runtime_files: [],
  required_schema_and_migrations: [],
  profile_registry_digest: "profile-fixture",
  dependency_requirements_digest: "requirements-fixture",
  compatibility_metadata_digest: "compat-fixture",
  closure_manifest_digest: "closure-fixture"
};

const liveEvidence = (
  productionLearningReady = false
): PublishedLiveActivationEvidence => ({
  evidence_schema_version: "published-live-activation-evidence-v1",
  evidence_class: "live_host",
  published_channel: "npm",
  package_name: artifact.package_name,
  package_version: artifact.package_version,
  artifact_integrity: artifact.artifact_integrity,
  registry_record_identity: artifact.registry_record_identity,
  host_environment: {
    openclaw_version: "2026.4.1",
    node_version: "v22.21.0",
    platform: "linux-x64",
    install_method: "openclaw_plugins_install",
    security_scan_status: "approved",
    security_scan_summary_digest: "scan-fixture",
    plugin_service_registered: true,
    real_agent_turn_observed: true,
    gateway_restart_recovered: true
  },
  activation: {
    home_id: "home-fixture",
    gateway_instance_id: "gateway-fixture",
    active_package_generation_id: "package-generation-fixture",
    package_activation_revision: 2,
    production_activation_id: "activation-fixture",
    supervisor_owner_id: "supervisor-fixture",
    supervisor_lease_epoch: 1,
    worker_owner_id: "worker-fixture",
    worker_fencing_token: 2,
    worker_mode: "production",
    schema_version: "legacy-learning-v0",
    configuration_generation_id: "configuration-fixture",
    effective_route_set_id: "routes-fixture"
  },
  queue: {
    fixture_id: "queue-fixture",
    job_id: "job-fixture",
    candidate_id: "candidate-fixture",
    claim_owner_id: "worker-fixture",
    claim_fencing_token: 2,
    completion_node_id: "node-fixture",
    semantic_completion_committed: true,
    authority_loss_completion_rejected: true,
    interruption_recovery_recorded: true,
    content_retry_consumed: false
  },
  shutdown: {
    gateway_stop_observed: true,
    worker_terminal_state: "stopped",
    supervisor_terminal_state: "stopped",
    supervisor_terminal_reason: "graceful_release",
    launch_attempt_terminal_code: "supervisor_graceful_release"
  },
  interaction_active: true,
  learning_runtime_active: true,
  production_learning_ready: productionLearningReady,
  verified_at: "2026-07-13T12:00:00.000Z"
});

const installedArtifactEvidence = (): InstalledArtifactRuntimeEvidence => ({
  evidence_schema_version: "installed-artifact-runtime-evidence-v1",
  evidence_class: "installed_artifact",
  published_channel: "npm",
  package_name: artifact.package_name,
  package_version: artifact.package_version,
  artifact_integrity: artifact.artifact_integrity,
  registry_record_identity: artifact.registry_record_identity,
  activation: liveEvidence().activation,
  queue: liveEvidence().queue,
  runtime_shutdown: {
    package_runtime_stop_observed: true,
    worker_terminal_state: "stopped",
    supervisor_terminal_state: "stopped",
    supervisor_terminal_reason: "graceful_release",
    launch_attempt_terminal_code: "supervisor_graceful_release"
  },
  interaction_active: true,
  learning_runtime_active: true,
  production_learning_ready: false,
  verified_at: "2026-07-13T12:00:00.000Z"
});

const passingClosureOptions = (root: string) => ({
  packageName: artifact.package_name,
  packageVersion: artifact.package_version,
  validationRoot: root,
  materialize: async () => artifact,
  install: async () => ({ packageRoot: join(root, "installed-package") }),
  manifestReader: async () => manifest,
  dependencyClosureDeriver: async () => ({
    records: [],
    digest: "dependencies-fixture"
  }),
  closureInspector: async () => ({
    valid: true,
    published_channel: "npm" as const,
    package_name: artifact.package_name,
    package_version: artifact.package_version,
    artifact_integrity: artifact.artifact_integrity,
    artifact_size: artifact.artifact_size,
    registry_record_identity: artifact.registry_record_identity,
    closure_manifest_digest: manifest.closure_manifest_digest,
    dependency_closure_digest: "dependencies-fixture",
    issues: []
  }),
  entrypointImportValidator: async () => ({
    valid: true,
    records: [{
      role: "openclaw_plugin",
      path: "dist/plugin/openclaw-plugin.js",
      status: "passed" as const,
      evidence_digest: "entrypoint-fixture",
      failure_code: null
    }],
    issues: []
  }),
  now: () => new Date("2026-07-13T12:00:00.000Z")
});

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("published npm artifact validator", () => {
  it("records a stable step-one failure when the embedded manifest is missing", async () => {
    const root = await makeTempRoot();
    const result = await validateExactPublishedNpmArtifactClosure({
      packageName: artifact.package_name,
      packageVersion: artifact.package_version,
      validationRoot: root,
      materialize: async () => artifact,
      install: async () => ({ packageRoot: join(root, "installed-package") }),
      manifestReader: async () => {
        throw new Error("ENOENT: runtime closure manifest missing");
      },
      now: () => new Date("2026-07-13T12:00:00.000Z")
    });
    expect(result).toMatchObject({
      status: "closure_failed",
      support_claim_allowed: false,
      failure_code: "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      distribution_attestation: null,
      closure_inspection: null,
      entrypoint_import_report: null,
      issues: ["read_embedded_manifest:unexpected_error"]
    });
    expect(result.validation_steps[0]).toMatchObject({
      status: "failed",
      failure_code: "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID"
    });
    expect(result.validation_steps.slice(1).every(
      (step) => step.status === "blocked"
    )).toBe(true);
  });

  it("records closure success while keeping live support pending", async () => {
    const root = await makeTempRoot();
    const result = await validateExactPublishedNpmArtifactClosure({
      ...passingClosureOptions(root)
    });
    expect(result).toMatchObject({
      status: "closure_passed_live_pending",
      support_claim_allowed: false,
      failure_code: null
    });
    expect(result.validation_steps[0].status).toBe("passed");
    expect(result.validation_steps[1].status).toBe("passed");
    expect(result.validation_steps[2].status).toBe("passed");
    expect(result.validation_steps[3].status).toBe("passed");
    expect(result.validation_steps[4].status).toBe("pending");
    expect(result.validation_steps.slice(5).every(
      (step) => step.status === "blocked"
    )).toBe(true);
  });

  it("keeps real host validation pending after installed-artifact smoke succeeds", async () => {
    const root = await makeTempRoot();
    const result = await validateExactPublishedNpmArtifactClosure({
      ...passingClosureOptions(root),
      installedArtifactSmokeRunner: async () => installedArtifactEvidence()
    });
    expect(result).toMatchObject({
      status: "installed_artifact_validated_live_host_pending",
      installed_artifact_runtime_smoke_passed: true,
      artifact_runtime_validated: false,
      support_claim_allowed: false,
      failure_code: null,
      issues: ["real_openclaw_live_host_validation_pending"]
    });
    expect(result.installed_artifact_runtime_evidence).toEqual(installedArtifactEvidence());
    expect(result.live_activation_evidence).toBeNull();
    expect(result.validation_steps.slice(0, 7).every((step) => step.status === "passed")).toBe(true);
    expect(result.validation_steps[7].status).toBe("pending");
  });

  it("records artifact runtime validation separately from the quality support gate", async () => {
    const root = await makeTempRoot();
    const result = await validateExactPublishedNpmArtifactClosure({
      ...passingClosureOptions(root),
      installedArtifactSmokeRunner: async () => installedArtifactEvidence(),
      liveHostRunner: async () => liveEvidence(true)
    });
    expect(result).toMatchObject({
      status: "artifact_runtime_validated",
      installed_artifact_runtime_smoke_passed: true,
      artifact_runtime_validated: true,
      support_claim_allowed: false,
      issues: ["quality_publication_gate_pending"]
    });
    expect(result.live_activation_evidence).toEqual(liveEvidence(true));
    expect(result.validation_steps.every((step) => step.status === "passed")).toBe(true);
  });

  it("fails step five without erasing the passed closure steps", async () => {
    const root = await makeTempRoot();
    const result = await validateExactPublishedNpmArtifactClosure({
      ...passingClosureOptions(root),
      installedArtifactSmokeRunner: async () => {
        throw new PublishedRuntimeClosureError(
          "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
          "fixture live smoke failure"
        );
      }
    });
    expect(result).toMatchObject({
      status: "live_smoke_failed",
      support_claim_allowed: false,
      failure_code: "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      issues: [
        "run_live_smoke:EE_PUBLISHED_CLOSURE_SCHEMA_INVALID"
      ]
    });
    expect(result.validation_steps.slice(0, 4).every(
      (step) => step.status === "passed"
    )).toBe(true);
    expect(result.validation_steps[4]).toMatchObject({
      status: "failed",
      failure_code: "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID"
    });
    expect(result.validation_steps.slice(5).every(
      (step) => step.status === "blocked"
    )).toBe(true);
  });

  it("fails step three when an installed entrypoint cannot import", async () => {
    const root = await makeTempRoot();
    const result = await validateExactPublishedNpmArtifactClosure({
      packageName: artifact.package_name,
      packageVersion: artifact.package_version,
      validationRoot: root,
      materialize: async () => artifact,
      install: async () => ({ packageRoot: join(root, "installed-package") }),
      manifestReader: async () => manifest,
      dependencyClosureDeriver: async () => ({
        records: [],
        digest: "dependencies-fixture"
      }),
      closureInspector: async () => ({
        valid: true,
        published_channel: "npm",
        package_name: artifact.package_name,
        package_version: artifact.package_version,
        artifact_integrity: artifact.artifact_integrity,
        artifact_size: artifact.artifact_size,
        registry_record_identity: artifact.registry_record_identity,
        closure_manifest_digest: manifest.closure_manifest_digest,
        dependency_closure_digest: "dependencies-fixture",
        issues: []
      }),
      entrypointImportValidator: async () => ({
        valid: false,
        records: [{
          role: "package_local_worker",
          path: "dist/runtime/package/worker-entrypoint.js",
          status: "failed",
          evidence_digest: "failure-fixture",
          failure_code: "EE_PUBLISHED_ENTRYPOINT_IMPORT_FAILED"
        }],
        issues: [
          "package_local_worker:EE_PUBLISHED_ENTRYPOINT_IMPORT_FAILED"
        ]
      }),
      now: () => new Date("2026-07-13T12:00:00.000Z")
    });
    expect(result).toMatchObject({
      status: "closure_failed",
      failure_code: "EE_PUBLISHED_ENTRYPOINT_IMPORT_FAILED",
      support_claim_allowed: false
    });
    expect(result.validation_steps[0].status).toBe("passed");
    expect(result.validation_steps[1].status).toBe("passed");
    expect(result.validation_steps[2]).toMatchObject({
      status: "failed",
      failure_code: "EE_PUBLISHED_ENTRYPOINT_IMPORT_FAILED"
    });
    expect(result.validation_steps.slice(3).every(
      (step) => step.status === "blocked"
    )).toBe(true);
  });
});
