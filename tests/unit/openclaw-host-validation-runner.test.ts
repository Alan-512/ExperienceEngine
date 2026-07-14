import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  MaterializedPublishedArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import {
  OPENCLAW_HOST_VALIDATION_RUNNER_CONTRACT,
  runOpenClawHostValidation,
  type OpenClawGatewayProcess,
  type OpenClawHostActiveEvidence,
  type OpenClawHostAuthorityCollector,
  type OpenClawHostCommand
} from "../../src/runtime/distribution/openclaw-host-validation-runner.js";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-openclaw-host-runner-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  while (roots.length > 0) {
    await rm(roots.pop()!, { recursive: true, force: true });
  }
});

const artifact: MaterializedPublishedArtifact = {
  published_channel: "npm",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.9",
  artifact_path: "C:/artifacts/experienceengine-0.4.9.tgz",
  artifact_integrity: "sha512-host-fixture",
  artifact_size: 456,
  registry_record_identity: "npm:host-fixture",
  materialized_at: "2026-07-14T12:00:00.000Z"
};

const activeEvidence: OpenClawHostActiveEvidence = {
  activation: {
    home_id: "home-host-fixture",
    gateway_instance_id: "gateway-host-fixture",
    active_package_generation_id: "package-host-fixture",
    package_activation_revision: 2,
    production_activation_id: "activation-host-fixture",
    supervisor_owner_id: "supervisor-host-fixture",
    supervisor_lease_epoch: 1,
    worker_owner_id: "worker-host-fixture",
    worker_fencing_token: 2,
    worker_mode: "production",
    schema_version: "legacy-learning-v0",
    configuration_generation_id: "config-host-fixture",
    effective_route_set_id: "routes-host-fixture"
  },
  queue: {
    fixture_id: "real-host-queue-fixture",
    job_id: "job-host-fixture",
    candidate_id: "candidate-host-fixture",
    claim_owner_id: "worker-host-fixture",
    claim_fencing_token: 2,
    completion_node_id: "node-host-fixture",
    semantic_completion_committed: true,
    authority_loss_completion_rejected: true,
    interruption_recovery_recorded: true,
    content_retry_consumed: false
  },
  interaction_active: true,
  learning_runtime_active: true,
  production_learning_ready: false
};

describe("OpenClaw real-host validation runner", () => {
  it("requires real install, Gateway, agent turn, restart, authoritative evidence, and shutdown", async () => {
    const root = await makeRoot();
    const installedRoot = join(root, "openclaw-state", "extensions", "experienceengine");
    const commands: OpenClawHostCommand[] = [];
    const commandRunner = vi.fn(async (command: OpenClawHostCommand) => {
      commands.push(command);
      if (command.args[0] === "--version") {
        return { stdout: "OpenClaw 2026.4.1 (fixture)\n", stderr: "" };
      }
      if (command.args[0] === "plugins" && command.args[1] === "info") {
        return {
          stdout: [
            "ExperienceEngine",
            "fixture plugin",
            "id: experienceengine",
            "Status: loaded",
            "Version: 0.4.9",
            `Install path: ${installedRoot}`
          ].join("\n"),
          stderr: ""
        };
      }
      if (command.args[0] === "agent") {
        return { stdout: '{"ok":true,"sessionId":"fixture"}\n', stderr: "" };
      }
      return { stdout: "ok\n", stderr: "" };
    });
    const stopped: number[] = [];
    let processId = 1000;
    const gatewaySpawner = vi.fn(async (): Promise<OpenClawGatewayProcess> => {
      const pid = ++processId;
      return {
        pid,
        stop: async () => {
          stopped.push(pid);
        },
        waitForExit: async () => ({ code: 0, signal: null })
      };
    });
    const collector: OpenClawHostAuthorityCollector = {
      captureActiveEvidence: vi.fn(async () => activeEvidence),
      verifyRestartRecovery: vi.fn(async () => undefined),
      captureShutdownEvidence: vi.fn(async () => ({
        gateway_stop_observed: true,
        worker_terminal_state: "stopped" as const,
        supervisor_terminal_state: "stopped" as const,
        supervisor_terminal_reason: "graceful_release",
        launch_attempt_terminal_code: "supervisor_graceful_release"
      }))
    };
    const installedPackageVerifier = vi.fn(async () => ({
      packageBuildId: "build-host-fixture",
      closureManifestDigest: "closure-host-fixture"
    }));
    const publishedAttestationIssuer = vi.fn(async () => undefined);
    const evidence = await runOpenClawHostValidation({
      artifact,
      openclawExecutable: join(root, "bin", "openclaw"),
      validationRoot: root,
      runtimeHome: join(root, "runtime-home"),
      sqlitePath: join(root, "runtime-home", "sqlite", "experienceengine.db"),
      pluginConfig: {
        dataDir: join(root, "runtime-home"),
        sqlitePath: join(root, "runtime-home", "sqlite", "experienceengine.db"),
        captureDir: join(root, "runtime-home", "captures")
      },
      authorityCollector: collector,
      commandRunner,
      gatewaySpawner,
      installedPackageVerifier,
      publishedAttestationIssuer,
      now: () => new Date("2026-07-14T12:00:00.000Z")
    });
    expect(evidence).toMatchObject({
      evidence_class: "live_host",
      artifact_integrity: artifact.artifact_integrity,
      registry_record_identity: artifact.registry_record_identity,
      host_environment: {
        openclaw_version: "OpenClaw 2026.4.1 (fixture)",
        install_method: "openclaw_plugins_install",
        plugin_service_registered: true,
        real_agent_turn_observed: true,
        gateway_restart_recovered: true
      },
      activation: activeEvidence.activation,
      queue: activeEvidence.queue,
      production_learning_ready: false
    });
    expect(commands.some((command) => command.args[0] === "plugins" && command.args[1] === "install")).toBe(true);
    expect(commands.some((command) => command.args[0] === "agent")).toBe(true);
    expect(gatewaySpawner).toHaveBeenCalledTimes(2);
    expect(stopped).toEqual([1001, 1002, 1002]);
    expect(collector.captureActiveEvidence).toHaveBeenCalledOnce();
    expect(collector.verifyRestartRecovery).toHaveBeenCalledOnce();
    expect(collector.captureShutdownEvidence).toHaveBeenCalledOnce();
    expect(installedPackageVerifier).toHaveBeenCalledWith(installedRoot);
    expect(publishedAttestationIssuer).toHaveBeenCalledOnce();
  });

  it("freezes the real-host boundary", () => {
    expect(OPENCLAW_HOST_VALIDATION_RUNNER_CONTRACT).toEqual({
      real_openclaw_install_required: true,
      real_gateway_required: true,
      plugin_service_registration_required: true,
      real_agent_turn_required: true,
      authoritative_sqlite_collector_required: true,
      gateway_restart_recovery_required: true,
      installed_artifact_smoke_substitution_allowed: false,
      explicit_security_approval_required_when_blocked: true,
      isolated_gateway_port_and_token_required: true,
      seed_agent_auth_is_copied_only_into_temporary_state: true
    });
  });
});
