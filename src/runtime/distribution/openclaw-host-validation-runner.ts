import { randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  rm
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  MaterializedPublishedArtifact
} from "./artifact-materializer.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";
import type {
  OpenClawLiveHostEnvironment,
  PublishedLiveActivationBinding,
  PublishedLiveActivationEvidence,
  PublishedProtectedQueueEvidence,
  PublishedShutdownEvidence
} from "./types.js";
import {
  LIVE_ACTIVATION_EVIDENCE_VERSION
} from "./constants.js";
import {
  parseOpenClawPluginInfo
} from "../../install/openclaw-cli.js";
import {
  digestOpenClawSecurityScanSummary,
  isOpenClawSecurityApprovalRequired
} from "../../install/openclaw-security-approval.js";
import {
  assertRuntimeClosureManifest
} from "../package/closure-manifest.js";
import {
  createOrAdoptRuntimeInstallAttestation,
  fingerprintRuntimeInstallPath
} from "../package/install-attestation.js";
import {
  initializeRuntimeHomeIdentity
} from "../identity/control-plane-bootstrap.js";

const execFileAsync = promisify(execFile);

export type OpenClawHostCommand = {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
};

export type OpenClawHostCommandResult = {
  stdout: string;
  stderr: string;
};

export type OpenClawHostCommandRunner = (
  command: OpenClawHostCommand
) => Promise<OpenClawHostCommandResult>;

export type OpenClawGatewayProcess = {
  pid: number | null;
  stop: () => Promise<void>;
  waitForExit: () => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

export type OpenClawGatewaySpawner = (options: {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
}) => Promise<OpenClawGatewayProcess>;

export type OpenClawHostActiveEvidence = {
  activation: PublishedLiveActivationBinding;
  queue: PublishedProtectedQueueEvidence;
  interaction_active: true;
  learning_runtime_active: true;
  production_learning_ready: boolean;
};

export type OpenClawHostAuthorityCollector = {
  captureActiveEvidence: (options: {
    sqlitePath: string;
    runtimeHome: string;
    timeoutMs: number;
  }) => Promise<OpenClawHostActiveEvidence>;
  verifyRestartRecovery: (options: {
    sqlitePath: string;
    runtimeHome: string;
    prior: OpenClawHostActiveEvidence;
    timeoutMs: number;
  }) => Promise<void>;
  captureShutdownEvidence: (options: {
    sqlitePath: string;
    runtimeHome: string;
    timeoutMs: number;
  }) => Promise<PublishedShutdownEvidence>;
};

export type OpenClawInstalledPackageVerifier = (installedRoot: string) => Promise<{
  packageBuildId: string;
  closureManifestDigest: string;
}>;

export type OpenClawPublishedAttestationIssuer = (options: {
  installedRoot: string;
  stateDir: string;
  runtimeHome: string;
  sqlitePath: string;
  openclawVersion: string;
  artifact: MaterializedPublishedArtifact;
  packageBuildId: string;
  closureManifestDigest: string;
  security: {
    security_scan_status: OpenClawLiveHostEnvironment["security_scan_status"];
    security_scan_summary_digest: string | null;
  };
  now: () => Date;
}) => Promise<void>;

const defaultCommandRunner: OpenClawHostCommandRunner = async (command) => {
  try {
    const result = await execFileAsync(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env,
      timeout: command.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      encoding: "utf8"
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string; code?: unknown };
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_COMMAND_FAILED",
      `OpenClaw command failed (${String(failure.code ?? "unknown")}): ${
        failure.stderr?.trim() || failure.stdout?.trim() || failure.message
      }`
    );
  }
};

const defaultGatewaySpawner: OpenClawGatewaySpawner = async (options) => {
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
    if (stderr.length > 1024 * 1024) {
      stderr = stderr.slice(-1024 * 1024);
    }
  });
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("exit", (code, signal) => resolveExit({ code, signal }));
    }
  );
  return {
    pid: child.pid ?? null,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      const timeout = new Promise<never>((_, rejectTimeout) => {
        const timer = setTimeout(() => {
          rejectTimeout(new PublishedRuntimeClosureError(
            "EE_OPENCLAW_LIVE_HOST_SHUTDOWN_TIMEOUT",
            `OpenClaw Gateway did not stop after SIGTERM. ${stderr.trim()}`
          ));
        }, 20_000);
        timer.unref();
      });
      await Promise.race([exitPromise, timeout]);
    },
    waitForExit: () => exitPromise
  };
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const runCommand = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
}): Promise<OpenClawHostCommandResult> => options.runner({
  executable: options.executable,
  args: options.args,
  env: options.env,
  cwd: options.cwd,
  timeoutMs: options.timeoutMs
});

const waitForGatewayHealth = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
  gatewayUrl: string;
  gatewayToken: string;
}): Promise<void> => {
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await runCommand({
        ...options,
        args: [
          "gateway",
          "call",
          "health",
          "--url",
          options.gatewayUrl,
          "--token",
          options.gatewayToken,
          "--json"
        ],
        timeoutMs: 10_000
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new PublishedRuntimeClosureError(
    "EE_OPENCLAW_LIVE_HOST_GATEWAY_UNHEALTHY",
    `OpenClaw Gateway did not become healthy: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
};

const copySeedAgentAuth = async (options: {
  seedConfigPath?: string;
  seedAgentAuthPath?: string;
  stateDir: string;
  agentId: string;
}): Promise<void> => {
  const source = options.seedAgentAuthPath ?? (
    options.seedConfigPath
      ? join(
          dirname(options.seedConfigPath),
          "agents",
          options.agentId,
          "agent",
          "auth-profiles.json"
        )
      : null
  );
  if (!source) {
    return;
  }
  try {
    await access(source);
  } catch {
    return;
  }
  const destination = join(
    options.stateDir,
    "agents",
    options.agentId,
    "agent",
    "auth-profiles.json"
  );
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
};

const readVersion = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
}): Promise<string> => (
  await runCommand({
    ...options,
    args: ["--version"],
    timeoutMs: 15_000
  })
).stdout.trim();

const installExactArtifact = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  artifactPath: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  approveHostSecurityScan: boolean;
  timeoutMs: number;
}): Promise<{
  security_scan_status: OpenClawLiveHostEnvironment["security_scan_status"];
  security_scan_summary_digest: string | null;
}> => {
  try {
    await runCommand({
      ...options,
      args: ["plugins", "install", options.artifactPath],
      timeoutMs: options.timeoutMs
    });
    return {
      security_scan_status: "not_required",
      security_scan_summary_digest: null
    };
  } catch (error) {
    if (!isOpenClawSecurityApprovalRequired(error)) {
      throw error;
    }
    const digest = digestOpenClawSecurityScanSummary(error);
    if (!options.approveHostSecurityScan) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_SECURITY_APPROVAL_REQUIRED",
        `OpenClaw security approval is required for this exact artifact (scan ${digest}).`
      );
    }
    await runCommand({
      ...options,
      args: [
        "plugins",
        "install",
        options.artifactPath,
        "--dangerously-force-unsafe-install"
      ],
      timeoutMs: options.timeoutMs
    });
    return {
      security_scan_status: "approved",
      security_scan_summary_digest: digest
    };
  }
};

const defaultInstalledPackageVerifier: OpenClawInstalledPackageVerifier = async (
  installedRoot
) => {
  const closure = assertRuntimeClosureManifest(installedRoot);
  if (!closure.packageBuildId || !closure.closureManifestDigest) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Installed OpenClaw package closure did not expose build and manifest identity."
    );
  }
  return {
    packageBuildId: closure.packageBuildId,
    closureManifestDigest: closure.closureManifestDigest
  };
};

const defaultPublishedAttestationIssuer: OpenClawPublishedAttestationIssuer = async (
  options
) => {
  const home = await initializeRuntimeHomeIdentity({
    writer: "gateway_service_controller",
    explicitOpenClawHome: resolve(options.runtimeHome),
    now: options.now
  });
  await createOrAdoptRuntimeInstallAttestation({
    canonicalHome: home.resolution.resolvedHome,
    integrityKey: home.integrityKey,
    content: {
      install_origin: options.artifact.published_channel === "npm"
        ? "published_npm_attested"
        : "published_clawhub_attested",
      package_name: options.artifact.package_name,
      package_version: options.artifact.package_version,
      package_build_id: options.packageBuildId,
      closure_manifest_digest: options.closureManifestDigest,
      installed_root_fingerprint: fingerprintRuntimeInstallPath(options.installedRoot),
      host_state_dir_fingerprint: fingerprintRuntimeInstallPath(options.stateDir),
      home_id: home.homeIdentity.home_id,
      database_path_fingerprint: fingerprintRuntimeInstallPath(options.sqlitePath),
      openclaw_version: options.openclawVersion,
      node_version: process.version,
      artifact_integrity: options.artifact.artifact_integrity,
      registry_record_identity: options.artifact.registry_record_identity,
      security_approval: options.security.security_scan_status === "approved"
        ? {
            scan_status: "approved",
            scan_summary_digest: options.security.security_scan_summary_digest,
            approval_method: "explicit_cli",
            approved_at: options.now().toISOString()
          }
        : {
            scan_status: "not_required",
            scan_summary_digest: null,
            approval_method: null,
            approved_at: null
          },
      issued_by: "published_validator",
      issued_at: options.now().toISOString()
    }
  });
};

export const runOpenClawHostValidation = async (options: {
  artifact: MaterializedPublishedArtifact;
  openclawExecutable: string;
  validationRoot: string;
  runtimeHome: string;
  sqlitePath: string;
  pluginConfig: Record<string, unknown>;
  authorityCollector: OpenClawHostAuthorityCollector;
  seedConfigPath?: string;
  seedAgentAuthPath?: string;
  agentId?: string;
  agentMessage?: string;
  gatewayPort?: number;
  approveHostSecurityScan?: boolean;
  commandRunner?: OpenClawHostCommandRunner;
  gatewaySpawner?: OpenClawGatewaySpawner;
  installedPackageVerifier?: OpenClawInstalledPackageVerifier;
  publishedAttestationIssuer?: OpenClawPublishedAttestationIssuer;
  prepareRuntimeAuthority?: (options: {
    installedRoot: string;
    stateDir: string;
    runtimeHome: string;
    sqlitePath: string;
    artifact: MaterializedPublishedArtifact;
    openclawVersion: string;
  }) => Promise<void>;
  cleanupRuntimeFixture?: () => Promise<void>;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  now?: () => Date;
}): Promise<PublishedLiveActivationEvidence> => {
  const validationRoot = resolve(options.validationRoot);
  const stateDir = join(validationRoot, "openclaw-state");
  const configPath = join(stateDir, "openclaw.json");
  await mkdir(stateDir, { recursive: true });
  if (options.seedConfigPath) {
    await copyFile(options.seedConfigPath, configPath);
  }
  const agentId = options.agentId ?? "main";
  await copySeedAgentAuth({
    seedConfigPath: options.seedConfigPath,
    seedAgentAuthPath: options.seedAgentAuthPath,
    stateDir,
    agentId
  });
  const gatewayPort = options.gatewayPort ?? 19171;
  const gatewayUrl = `ws://127.0.0.1:${gatewayPort}`;
  const gatewayToken = randomBytes(32).toString("hex");
  const env: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_TOKEN: gatewayToken,
    OPENCLAW_GATEWAY_URL: gatewayUrl,
    EXPERIENCE_ENGINE_HOME: resolve(options.runtimeHome),
    NODE_PATH: "",
    NODE_OPTIONS: ""
  };
  const runner = options.commandRunner ?? defaultCommandRunner;
  const spawner = options.gatewaySpawner ?? defaultGatewaySpawner;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const executable = resolve(options.openclawExecutable);
  const cwd = validationRoot;
  const openclawVersion = await readVersion({ runner, executable, env, cwd });
  const security = await installExactArtifact({
    runner,
    executable,
    artifactPath: resolve(options.artifact.artifact_path),
    env,
    cwd,
    approveHostSecurityScan: options.approveHostSecurityScan === true,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: ["plugins", "enable", "experienceengine"],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: ["config", "set", "gateway.port", String(gatewayPort), "--json"],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: ["config", "set", "gateway.auth.mode", "token"],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: [
      "config",
      "set",
      "gateway.auth.token",
      JSON.stringify(gatewayToken),
      "--json"
    ],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: [
      "config",
      "set",
      "plugins.entries.experienceengine.config",
      JSON.stringify(options.pluginConfig),
      "--json"
    ],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: ["config", "set", "gateway.mode", "local"],
    env,
    cwd,
    timeoutMs
  });
  const pluginInfoOutput = await runCommand({
    runner,
    executable,
    args: ["plugins", "info", "experienceengine"],
    env,
    cwd,
    timeoutMs
  });
  const pluginInfo = parseOpenClawPluginInfo(pluginInfoOutput.stdout);
  if (!pluginInfo.installPath) {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_PLUGIN_NOT_INSTALLED",
      "OpenClaw did not report the installed ExperienceEngine package root."
    );
  }
  const installedRoot = resolve(pluginInfo.installPath);
  const verifiedPackage = await (
    options.installedPackageVerifier ?? defaultInstalledPackageVerifier
  )(installedRoot);
  const now = options.now ?? (() => new Date());
  await (
    options.publishedAttestationIssuer ?? defaultPublishedAttestationIssuer
  )({
    installedRoot,
    stateDir,
    runtimeHome: options.runtimeHome,
    sqlitePath: options.sqlitePath,
    openclawVersion,
    artifact: options.artifact,
    packageBuildId: verifiedPackage.packageBuildId,
    closureManifestDigest: verifiedPackage.closureManifestDigest,
    security,
    now
  });
  await options.prepareRuntimeAuthority?.({
    installedRoot,
    stateDir,
    runtimeHome: options.runtimeHome,
    sqlitePath: options.sqlitePath,
    artifact: options.artifact,
    openclawVersion
  });

  const gatewayArgs = [
    "gateway",
    "run",
    "--allow-unconfigured",
    "--auth",
    "token",
    "--token",
    gatewayToken,
    "--bind",
    "loopback",
    "--port",
    String(gatewayPort)
  ];
  let gateway = await spawner({ executable, args: gatewayArgs, env, cwd });
  try {
    await waitForGatewayHealth({
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken
    });
    const loadedInfo = parseOpenClawPluginInfo((await runCommand({
      runner,
      executable,
      args: ["plugins", "info", "experienceengine"],
      env,
      cwd,
      timeoutMs
    })).stdout);
    if (loadedInfo.status?.toLowerCase() !== "loaded") {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_PLUGIN_NOT_LOADED",
        `OpenClaw plugin status is ${loadedInfo.status ?? "unknown"}, not loaded.`
      );
    }
    const agentArgs = ["agent"];
    if (agentId) {
      agentArgs.push("--agent", agentId);
    }
    agentArgs.push(
      "--session-id",
      `ee-validation-${Date.now()}`,
      "--message",
      options.agentMessage ??
        "Inspect the current workspace, perform one bounded read-only tool action, and summarize the result.",
      "--json",
      "--timeout",
      String(Math.max(30, Math.floor(timeoutMs / 1000)))
    );
    const agentResult = await runCommand({
      runner,
      executable,
      args: agentArgs,
      env,
      cwd,
      timeoutMs
    });
    if (!agentResult.stdout.trim()) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_AGENT_TURN_FAILED",
        "OpenClaw real agent turn returned no result."
      );
    }
    const active = await options.authorityCollector.captureActiveEvidence({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      timeoutMs
    });
    await gateway.stop();
    gateway = await spawner({ executable, args: gatewayArgs, env, cwd });
    await waitForGatewayHealth({
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken
    });
    await options.authorityCollector.verifyRestartRecovery({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      prior: active,
      timeoutMs
    });
    await gateway.stop();
    const shutdown = await options.authorityCollector.captureShutdownEvidence({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      timeoutMs
    });
    return {
      evidence_schema_version: LIVE_ACTIVATION_EVIDENCE_VERSION,
      evidence_class: "live_host",
      published_channel: options.artifact.published_channel,
      package_name: options.artifact.package_name,
      package_version: options.artifact.package_version,
      artifact_integrity: options.artifact.artifact_integrity,
      registry_record_identity: options.artifact.registry_record_identity,
      host_environment: {
        openclaw_version: openclawVersion,
        node_version: process.version,
        platform: `${process.platform}-${process.arch}`,
        install_method: "openclaw_plugins_install",
        security_scan_status: security.security_scan_status,
        security_scan_summary_digest: security.security_scan_summary_digest,
        plugin_service_registered: true,
        real_agent_turn_observed: true,
        gateway_restart_recovered: true
      },
      activation: active.activation,
      queue: active.queue,
      shutdown,
      interaction_active: true,
      learning_runtime_active: true,
      production_learning_ready: active.production_learning_ready,
      verified_at: now().toISOString()
    };
  } finally {
    await gateway.stop().catch(() => undefined);
    await options.cleanupRuntimeFixture?.().catch(() => undefined);
    await rm(join(validationRoot, "gateway.pid"), { force: true }).catch(() => undefined);
  }
};

export const OPENCLAW_HOST_VALIDATION_RUNNER_CONTRACT = Object.freeze({
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
