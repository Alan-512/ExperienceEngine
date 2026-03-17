import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildCodexAddCommand,
  buildCodexGetCommand,
  buildCodexMcpServerCommand,
  buildCodexRemoveCommand,
  CODEX_EXPERIENCEENGINE_STARTUP_TIMEOUT_SEC,
  defaultCodexCommandRunner,
  ensureCodexMcpServerStartupTimeout,
  parseCodexMcpServerInfo,
  runCodexCommand,
  type CodexCommandRunner,
  type CodexMcpServerInfo
} from "./codex-cli.js";
import {
  resolveExperienceEnginePaths,
  resolveProductStateDir,
  type ResolvedPathInfo
} from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import { resolveCodexHostLlmBinding } from "../distillation/host-llm.js";
import { buildVersionStatus, readCurrentPackageVersion } from "../version/package-version.js";

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  cliEnv?: NodeJS.ProcessEnv;
  runner?: CodexCommandRunner;
};

export type CodexInstallReport = {
  adapter: "codex";
  installed: true;
  paths: ResolvedPathInfo;
  packageRoot: string;
  installedVersion: string;
  serverName: string;
  serverCommand: string;
  captureDir: string;
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
  };
};

type CodexInstallState = {
  adapter: "codex";
  installedAt: string;
  installedVersion?: string;
  packageRoot: string;
  serverName: string;
  serverCommand: string;
  captureDir: string;
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
  };
};

const inspectCodexHost = (
  runner: CodexCommandRunner,
  cliEnv?: NodeJS.ProcessEnv
): CodexMcpServerInfo | null => {
  try {
    return parseCodexMcpServerInfo(runCodexCommand(buildCodexGetCommand(cliEnv), runner));
  } catch {
    return null;
  }
};

export const installCodexAdapter = (options: InstallerOptions = {}): CodexInstallReport => {
  const runner = options.runner ?? defaultCodexCommandRunner;
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const installedVersion = readCurrentPackageVersion(packageRoot);
  const existing = inspectCodexHost(runner, options.cliEnv);

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });

  const hostLlmBinding = resolveCodexHostLlmBinding({
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const serverEnv: Array<[string, string]> = [
    ["EXPERIENCE_ENGINE_USE_HOST_LLM", "true"],
    ["EXPERIENCE_ENGINE_ADAPTER", "codex"]
  ];
  if (hostLlmBinding?.configPath) {
    serverEnv.push(["CODEX_CONFIG_PATH", hostLlmBinding.configPath]);
  }
  for (const [key, value] of Object.entries(hostLlmBinding?.envBindings ?? {})) {
    serverEnv.push([key, value]);
  }

  if (existing?.name === "experienceengine") {
    runCodexCommand(buildCodexRemoveCommand(options.cliEnv), runner);
  }

  runCodexCommand(buildCodexAddCommand(packageRoot, paths.productHome, options.cliEnv, serverEnv), runner);
  ensureCodexMcpServerStartupTimeout("experienceengine", CODEX_EXPERIENCEENGINE_STARTUP_TIMEOUT_SEC, {
    homeDir: options.homeDir
  });

  const hostInfo = inspectCodexHost(runner, options.cliEnv);
  const state: CodexInstallState = {
    adapter: "codex",
    installedAt: new Date().toISOString(),
    installedVersion,
    packageRoot,
    serverName: "experienceengine",
    serverCommand: hostInfo?.commandDisplay ?? buildCodexMcpServerCommand(packageRoot).join(" "),
    captureDir: paths.captureDir,
    hostWiring: {
      wired: Boolean(hostInfo?.commandDisplay),
      command: hostInfo?.commandDisplay,
      transport: hostInfo?.transport
    }
  };

  writeFileSync(paths.installStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  return {
    adapter: "codex",
    installed: true,
    paths,
    packageRoot,
    installedVersion,
    serverName: state.serverName,
    serverCommand: state.serverCommand,
    captureDir: paths.captureDir,
    hostWiring: state.hostWiring
  };
};

export const inspectCodexInstall = (options: InstallerOptions = {}) => {
  const runner = options.runner ?? defaultCodexCommandRunner;
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const installState = existsSync(paths.installStatePath)
    ? (JSON.parse(readFileSync(paths.installStatePath, "utf8")) as CodexInstallState)
    : null;
  const packageRoot = resolveExperienceEnginePackageRoot();
  const hostInfo = inspectCodexHost(runner, options.cliEnv);

  return {
    adapter: "codex" as const,
    installed: Boolean(installState),
    versionStatus: buildVersionStatus(Boolean(installState), installState?.installedVersion),
    packageRoot,
    captureDir: paths.captureDir,
    serverName: installState?.serverName ?? "experienceengine",
    serverCommand: installState?.serverCommand,
    hostWiring: {
      wired: Boolean(hostInfo?.commandDisplay),
      command: hostInfo?.commandDisplay,
      transport: hostInfo?.transport,
      enabled: hostInfo?.enabled ?? false
    },
    hostState: hostInfo
  };
};
