import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  MaterializedPublishedArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import {
  INSTALLED_ARTIFACT_RUNTIME_SMOKE_CONTRACT,
  runInstalledArtifactRuntimeSmoke,
  type InstalledArtifactRuntimeSmokeInvocation
} from "../../src/runtime/distribution/installed-artifact-runtime-smoke.js";

const temporaryRoots: string[] = [];

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-published-live-smoke-"));
  temporaryRoots.push(root);
  return root;
};

const artifact: MaterializedPublishedArtifact = {
  published_channel: "npm",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.9",
  artifact_path: "C:/artifact.tgz",
  artifact_integrity: "sha512-published-fixture",
  artifact_size: 456,
  registry_record_identity: "npm:published-fixture",
  materialized_at: "2026-07-13T12:00:00.000Z"
};

const rawSmokeEvidence = {
  ok: true,
  package_name: artifact.package_name,
  package_version: artifact.package_version,
  artifact_integrity: artifact.artifact_integrity,
  registry_record_identity: artifact.registry_record_identity,
  evidence_class: "published_npm",
  home_id: "home-published-fixture",
  gateway_instance_id: "gateway-published-fixture",
  active_package_generation_id: "package-generation-published-fixture",
  package_activation_revision: 2,
  production_activation_id: "activation-published-fixture",
  schema_version: "legacy-learning-v0",
  supervisor_owner_id: "supervisor-published-fixture",
  supervisor_lease_epoch: 1,
  production_worker_owner_id: "worker-published-fixture",
  production_worker_fencing_token: 2,
  configuration_generation_id: "configuration-published-fixture",
  effective_route_set_id: "routes-published-fixture",
  semantic_completion_job_id: "job-published-fixture",
  semantic_completion_candidate_id: "candidate-published-fixture",
  semantic_completion_claim_owner_id: "worker-published-fixture",
  semantic_completion_claim_fencing_token: 2,
  semantic_completion_node_id: "node-published-fixture",
  semantic_completion_job_status: "succeeded",
  stale_output_failure_code: "EE_ACTIVATION_FENCING_REJECTED",
  stale_output_interruption_count: 1,
  stale_output_content_retry_count: 0,
  interaction_active: true,
  learning_runtime_active: true,
  production_learning_ready: false,
  worker_terminal_state: "stopped",
  supervisor_terminal_state: "stopped",
  terminal_reason: "graceful_release",
  attempt_terminal_code: "supervisor_graceful_release"
};

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("installed artifact runtime smoke", () => {
  it("executes the external harness from the installed package root and binds registry identity", async () => {
    const root = await makeTempRoot();
    const packageRoot = join(root, "installed-package");
    const harnessSourcePath = join(root, "source-harness.mjs");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(harnessSourcePath, "// fixture harness", "utf8");
    let invocation: InstalledArtifactRuntimeSmokeInvocation | undefined;
    const evidence = await runInstalledArtifactRuntimeSmoke({
      artifact,
      packageRoot,
      harnessSourcePath,
      processRunner: async (input) => {
        invocation = input;
        expect(await readFile(input.args[0], "utf8")).toBe("// fixture harness");
        return {
          stdout: `${JSON.stringify(rawSmokeEvidence)}\n`,
          stderr: "ignored experimental warning"
        };
      },
      now: () => new Date("2026-07-13T12:00:00.000Z")
    });
    expect(evidence).toMatchObject({
      evidence_class: "installed_artifact",
      published_channel: "npm",
      artifact_integrity: artifact.artifact_integrity,
      registry_record_identity: artifact.registry_record_identity,
      production_learning_ready: false,
      queue: {
        semantic_completion_committed: true,
        authority_loss_completion_rejected: true,
        interruption_recovery_recorded: true,
        content_retry_consumed: false
      }
    });
    expect(evidence.runtime_shutdown.package_runtime_stop_observed).toBe(true);
    expect(INSTALLED_ARTIFACT_RUNTIME_SMOKE_CONTRACT).toMatchObject({
      real_openclaw_gateway_started: false,
      evidence_class: "installed_artifact"
    });
    expect(invocation?.cwd).toBe(packageRoot);
    expect(invocation?.env.NODE_PATH).toBe("");
    expect(invocation?.env.NODE_OPTIONS).toBe("");
    expect(invocation?.env.EXPERIENCE_ENGINE_VALIDATION_EVIDENCE_CLASS)
      .toBe("published_npm");
    await expect(readFile(invocation!.args[0], "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("rejects smoke evidence that is not bound to the exact artifact", async () => {
    const root = await makeTempRoot();
    const packageRoot = join(root, "installed-package");
    const harnessSourcePath = join(root, "source-harness.mjs");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(harnessSourcePath, "// fixture harness", "utf8");
    await expect(runInstalledArtifactRuntimeSmoke({
      artifact,
      packageRoot,
      harnessSourcePath,
      processRunner: async () => ({
        stdout: JSON.stringify({
          ...rawSmokeEvidence,
          artifact_integrity: "sha512-wrong"
        }),
        stderr: ""
      })
    })).rejects.toMatchObject({
      code: "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID"
    });
  });
});
