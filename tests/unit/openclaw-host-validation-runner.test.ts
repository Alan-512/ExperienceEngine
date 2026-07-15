import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  MaterializedPublishedArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import {
  assertOpenClawInstalledPackageMatchesExpected,
  buildOpenClawGatewaySpawnPlan,
  OPENCLAW_DIRECT_GATEWAY_PROTOCOL_RANGE,
  OPENCLAW_HOST_VALIDATION_RUNNER_CONTRACT,
  runOpenClawHostValidation,
  type DirectGatewayRpcClientFactory,
  type OpenClawGatewayProcess,
  type OpenClawHostActiveEvidence,
  type OpenClawHostAuthorityCollector,
  type OpenClawHostCommand,
  type OpenClawHostInitializationSnapshot
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

const initializationSnapshot: OpenClawHostInitializationSnapshot = {
  home_id: "home-host-fixture",
  projection_revision: 0,
  launch_revision: 0,
  authority_tables: {
    package_activation_state: [{
      home_id: "home-host-fixture",
      activation_revision: 0,
      activation_state: "uninitialized"
    }],
    supervisor_launch_state: [],
    package_launch_authorizations: [],
    supervisor_launch_attempts: [],
    supervisor_leases: [],
    worker_leases: [],
    activation_handshakes: [],
    control_request_idempotency: []
  }
};

describe("OpenClaw real-host validation runner", () => {
  it("rejects a channel-native install whose closure differs from published bytes", () => {
    expect(() => assertOpenClawInstalledPackageMatchesExpected(
      {
        packageBuildId: "build-installed",
        closureManifestDigest: "closure-installed"
      },
      {
        packageBuildId: "build-published",
        closureManifestDigest: "closure-published"
      }
    )).toThrow(/does not match the independently materialized published artifact/u);

    expect(() => assertOpenClawInstalledPackageMatchesExpected(
      {
        packageBuildId: "build-exact",
        closureManifestDigest: "closure-exact"
      },
      {
        packageBuildId: "build-exact",
        closureManifestDigest: "closure-exact"
      }
    )).not.toThrow();
  });

  it("bridges Windows Gateway shutdown through the OpenClaw SIGINT lifecycle", () => {
    const plan = buildOpenClawGatewaySpawnPlan({
      invocation: {
        file: "node.exe",
        args: [
          "C:/openclaw/openclaw.mjs",
          "gateway",
          "run",
          "--port",
          "19171"
        ]
      },
      platform: "win32"
    });

    expect(plan.file).toBe("node.exe");
    expect(plan.gracefulStopViaStdin).toBe(true);
    expect(plan.args.slice(0, 3)).toEqual([
      "--disable-warning=ExperimentalWarning",
      "--input-type=module",
      "-e"
    ]);
    expect(plan.args[3]).toContain("process.emit(\"SIGINT\")");
    expect(plan.args.slice(4)).toEqual([
      "C:/openclaw/openclaw.mjs",
      "gateway",
      "run",
      "--port",
      "19171"
    ]);
  });

  it("requires real install, Gateway, agent turn, restart, authoritative evidence, and shutdown", async () => {
    const root = await makeRoot();
    const sourceArtifactPath = join(root, "source-artifact.tgz");
    await writeFile(sourceArtifactPath, "artifact-fixture", "utf8");
    const seedConfigPath = join(root, "seed", "openclaw.json");
    const seedAgentDirectory = join(root, "seed", "agents", "main", "agent");
    await mkdir(seedAgentDirectory, { recursive: true });
    await writeFile(seedConfigPath, "{}", "utf8");
    await writeFile(
      join(seedAgentDirectory, "auth-profiles.json"),
      JSON.stringify({ version: 1, profiles: { fixture: { provider: "fixture" } } }),
      "utf8"
    );
    const seedAgentDatabasePath = join(
      seedAgentDirectory,
      "openclaw-agent.sqlite"
    );
    const seedAgentDatabase = new DatabaseSync(seedAgentDatabasePath);
    seedAgentDatabase.exec(
      "CREATE TABLE auth_profile_store (store_key TEXT PRIMARY KEY, store_json TEXT, updated_at INTEGER);"
    );
    seedAgentDatabase.close();
    const testArtifact: MaterializedPublishedArtifact = {
      ...artifact,
      artifact_path: sourceArtifactPath
    };
    const installedRoot = join(root, "openclaw-state", "extensions", "experienceengine");
    const commands: OpenClawHostCommand[] = [];
    let initializationCalls = 0;
    const chatMessages: Array<Record<string, unknown>> = [];
    const directGatewayRequests: Array<{
      method: string;
      params: Record<string, unknown>;
    }> = [];
    const directGatewayFinals = new Map<string, unknown>();
    let runtimeStatusCalls = 0;
    const directGatewayRpcClientFactory: DirectGatewayRpcClientFactory =
      vi.fn(async () => ({
        request: async (
          method: string,
          params: Record<string, unknown>
        ) => {
          directGatewayRequests.push({ method, params });
          if (method === "health") {
            return { status: "ok" };
          }
          if (method !== "chat.send") {
            throw new Error(`Unexpected direct Gateway method ${method}.`);
          }
          const message = String(params.message ?? "");
          let commandResult: Record<string, unknown>;
          if (message === "/experienceengine_status") {
            runtimeStatusCalls += 1;
            commandResult = runtimeStatusCalls === 1
              ? {
                  ok: true,
                  operation: "status",
                  code: "runtime_service_unavailable",
                  result: { learning_runtime_active: false }
                }
              : {
                  ok: true,
                  operation: "status",
                  code: "runtime_status",
                  result: { learning_runtime_active: true }
                };
          } else if (message === "/experienceengine_prepare_package_activation") {
            commandResult = {
              ok: true,
              operation: "prepare_package_activation",
              code: "package_activation_request_prepared",
              result: {
                operation: "initialize_package_activation",
                package_generation_id: "package-host-fixture",
                expected_projection_revision: 0,
                expected_launch_revision: 0,
                control_request_id: "control-host-initialize",
                authorization_id: "authorization-host-initialize",
                mutates_authority: false
              }
            };
          } else if (message.startsWith(
            "/experienceengine_initialize_package_activation "
          )) {
            initializationCalls += 1;
            commandResult = {
              ok: true,
              operation: "initialize_package_activation",
              code: "package_activation_initialized",
              result: {
                replayed: initializationCalls > 1,
                projection_revision: 1
              }
            };
          } else {
            throw new Error(`Unexpected direct Gateway message ${message}.`);
          }
          const runId = `direct-native-run-${directGatewayFinals.size + 1}`;
          directGatewayFinals.set(runId, {
            state: "final",
            message: {
              role: "assistant",
              content: [{
                type: "text",
                text: JSON.stringify(commandResult)
              }]
            }
          });
          return { runId, status: "started" };
        },
        waitForChatFinal: async (runId: string) => {
          const result = directGatewayFinals.get(runId);
          if (!result) {
            throw new Error(`Missing direct Gateway final for ${runId}.`);
          }
          return result;
        },
        close: vi.fn()
      }));
    const commandRunner = vi.fn(async (command: OpenClawHostCommand) => {
      commands.push(command);
      if (command.args[0] === "--version") {
        return { stdout: "OpenClaw 2026.4.1 (fixture)\n", stderr: "" };
      }
      if (command.args[0] === "doctor") {
        const destination = join(
          root,
          "openclaw-state",
          "agents",
          "main",
          "agent",
          "openclaw-agent.sqlite"
        );
        const migrated = new DatabaseSync(destination);
        migrated.exec(
          "CREATE TABLE auth_seed (provider TEXT PRIMARY KEY);" +
          "INSERT INTO auth_seed VALUES ('fixture-provider');"
        );
        migrated.close();
        return { stdout: "Doctor complete.\n", stderr: "" };
      }
      if (command.args[0] === "plugins" && command.args[1] === "info") {
        return {
          stdout: [
            "ExperienceEngine",
            "fixture plugin",
            "id: experienceengine",
            "Status: loaded",
            "Version: 0.4.9",
            "Install path: ~/openclaw-state/extensions/experienceengine"
          ].join("\n"),
          stderr: ""
        };
      }
      if (
        command.args[0] === "gateway" &&
        command.args[1] === "call" &&
        command.args[2] === "chat.history"
      ) {
        return {
          stdout: JSON.stringify({
            sessionKey: "agent:main:ee-native-activation-fixture",
            sessionId: "native-session-fixture",
            messages: chatMessages
          }),
          stderr: ""
        };
      }
      if (
        command.args[0] === "gateway" &&
        command.args[1] === "call" &&
        command.args[2] === "chat.send"
      ) {
        const paramsIndex = command.args.indexOf("--params");
        const params = JSON.parse(command.args[paramsIndex + 1]) as {
          message: string;
        };
        chatMessages.push({
          role: "user",
          content: [{ type: "text", text: params.message }]
        });
        if (params.message === "/experienceengine_prepare_package_activation") {
          chatMessages.push({
            role: "assistant",
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: true,
                operation: "prepare_package_activation",
                code: "package_activation_request_prepared",
                result: {
                  operation: "initialize_package_activation",
                  package_generation_id: "package-host-fixture",
                  expected_projection_revision: 0,
                  expected_launch_revision: 0,
                  control_request_id: "control-host-initialize",
                  authorization_id: "authorization-host-initialize",
                  mutates_authority: false
                }
              })
            }]
          });
        } else if (params.message.startsWith(
          "/experienceengine_initialize_package_activation "
        )) {
          initializationCalls += 1;
          chatMessages.push({
            role: "assistant",
            text: JSON.stringify({
              ok: true,
              operation: "initialize_package_activation",
              code: "package_activation_initialized",
              result: {
                replayed: initializationCalls > 1,
                projection_revision: 1
              }
            })
          });
        }
        return {
          stdout: JSON.stringify({
            runId: `native-run-${chatMessages.length}`,
            status: "started"
          }),
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
        readOutput: () => ({ stdout: "", stderr: "" }),
        stop: async () => {
          stopped.push(pid);
        },
        waitForExit: () => new Promise(() => undefined)
      };
    });
    const collector: OpenClawHostAuthorityCollector = {
      captureInitializationSnapshot: vi.fn(async () => initializationSnapshot),
      verifyInitializationIdempotency: vi.fn(async () => undefined),
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
      artifact: testArtifact,
      installSource: "npm:@alan512/experienceengine@0.4.9",
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
      seedConfigPath,
      commandRunner,
      gatewaySpawner,
      installedPackageVerifier,
      publishedAttestationIssuer,
      hostHomeDir: root,
      nativeCommandTransport: "direct_gateway",
      directGatewayRpcClientFactory,
      prepareRuntimeAuthority: vi.fn(async () => ({
        packageGenerationId: "package-host-fixture"
      })),
      now: () => new Date("2026-07-14T12:00:00.000Z")
    });
    expect(evidence).toMatchObject({
      evidence_class: "live_host",
      artifact_integrity: testArtifact.artifact_integrity,
      registry_record_identity: testArtifact.registry_record_identity,
      host_environment: {
        openclaw_version: "OpenClaw 2026.4.1 (fixture)",
        install_method: "openclaw_plugins_install",
        plugin_service_registered: true,
        native_activation_prepare_observed: true,
        native_activation_prepare_read_only: true,
        native_activation_initialize_observed: true,
        native_activation_idempotent_replay_observed: true,
        real_agent_turn_observed: true,
        gateway_restart_recovered: true
      },
      activation: activeEvidence.activation,
      queue: activeEvidence.queue,
      production_learning_ready: false
    });
    expect(commands.some((command) => command.args[0] === "plugins" && command.args[1] === "install")).toBe(true);
    expect(commands.some((command) => command.args[0] === "doctor")).toBe(true);
    expect(commands.find((command) =>
      command.args[0] === "plugins" && command.args[1] === "install"
    )?.args[2]).toBe("npm:@alan512/experienceengine@0.4.9");
    expect(commands.filter((command) => command.args[0] === "agent")).toHaveLength(1);
    expect(commands.filter((command) =>
      command.args[0] === "gateway" &&
      command.args[1] === "call" &&
      command.args[2] === "chat.send"
    )).toHaveLength(0);
    expect(commands.filter((command) =>
      command.args[0] === "gateway" &&
      command.args[1] === "call" &&
      command.args[2] === "health"
    )).toHaveLength(0);
    expect(directGatewayRequests.filter((request) =>
      request.method === "health"
    )).toHaveLength(2);
    const directMessages = directGatewayRequests
      .filter((request) => request.method === "chat.send")
      .map((request) => String(request.params.message ?? ""));
    expect(directMessages).toHaveLength(5);
    expect(directMessages.filter((message) =>
      message === "/experienceengine_status"
    )).toHaveLength(2);
    expect(directMessages).toContain(
      "/experienceengine_prepare_package_activation"
    );
    expect(directMessages.filter((message) => message.startsWith(
      "/experienceengine_initialize_package_activation "
    ))).toHaveLength(2);
    expect(directGatewayRpcClientFactory).toHaveBeenCalledTimes(7);
    expect(gatewaySpawner).toHaveBeenCalledTimes(2);
    expect(stopped).toEqual([1001, 1002, 1002]);
    expect(collector.captureActiveEvidence).toHaveBeenCalledOnce();
    expect(collector.captureInitializationSnapshot).toHaveBeenCalledTimes(2);
    expect(collector.verifyInitializationIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        controlRequestId: "control-host-initialize",
        authorizationId: "authorization-host-initialize",
        expectedPackageGenerationId: "package-host-fixture"
      })
    );
    expect(collector.verifyRestartRecovery).toHaveBeenCalledOnce();
    expect(collector.captureShutdownEvidence).toHaveBeenCalledTimes(2);
    expect(installedPackageVerifier).toHaveBeenCalledWith(installedRoot);
    expect(publishedAttestationIssuer).toHaveBeenCalledOnce();
    const isolatedAgentDatabase = new DatabaseSync(join(
      root,
      "openclaw-state",
      "agents",
      "main",
      "agent",
      "openclaw-agent.sqlite"
    ), { readOnly: true });
    expect(isolatedAgentDatabase.prepare(
      "SELECT provider FROM auth_seed"
    ).get()).toEqual({ provider: "fixture-provider" });
    isolatedAgentDatabase.close();
  });

  it("freezes the real-host boundary", () => {
    expect(OPENCLAW_DIRECT_GATEWAY_PROTOCOL_RANGE).toEqual({
      minProtocol: 3,
      maxProtocol: 4
    });
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
      seed_agent_auth_is_copied_only_into_temporary_state: true,
      native_activation_prepare_command_required: true,
      native_activation_initialize_command_required: true,
      native_activation_prepare_must_be_read_only: true,
      native_activation_initialize_replay_required: true,
      gateway_lifecycle_stop_drives_runtime_drain: true,
      windows_batch_shim_uses_validated_node_entrypoint: true,
      windows_gateway_health_uses_direct_gateway_rpc: true,
      windows_native_commands_use_direct_gateway_rpc: true,
      direct_gateway_protocol_range_is_negotiated: true,
      channel_native_install_closure_binding_required: true,
      shell_true_allowed: false
    });
  });
});
