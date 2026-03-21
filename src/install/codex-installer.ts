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
  ensureCodexLaunchers,
  resolveCodexRuntimeTarget,
  type CodexRuntimeTarget
} from "./codex-runtime-target.js";
import {
  resolveExperienceEnginePaths,
  resolveProductStateDir,
  type ResolvedPathInfo
} from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import { resolveDistillationResolution } from "../distillation/host-llm.js";
import { loadConfig } from "../config/load-config.js";
import { buildVersionStatus, readCurrentPackageVersion } from "../version/package-version.js";

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  cliEnv?: NodeJS.ProcessEnv;
  runner?: CodexCommandRunner;
  runtimeTarget?: CodexRuntimeTarget | string;
};

export type CodexInstallReport = {
  adapter: "codex";
  installed: true;
  paths: ResolvedPathInfo;
  packageRoot: string;
  installedVersion: string;
  serverName: string;
  serverCommand: string;
  runtimeTarget: CodexRuntimeTarget;
  launcherPaths: {
    mcpServer: string;
  };
  captureDir: string;
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
  };
  distillationStatus?: {
    distillationMode: "llm" | "rule" | "disabled";
    distillationSource: string;
    provider: string;
    reason: string;
    diagnostics: {
      configured: boolean;
      provider: string;
      model?: string;
      baseUrl: string;
      missingEnv: string[];
    };
  };
};

type CodexInstallState = {
  adapter: "codex";
  installedAt: string;
  installedVersion?: string;
  packageRoot: string;
  serverName: string;
  serverCommand: string;
  runtimeTarget?: CodexRuntimeTarget;
  launcherPaths?: {
    mcpServer?: string;
  };
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
  const runtimeTarget = resolveCodexRuntimeTarget({
    requested: options.runtimeTarget,
    env: options.env ?? process.env
  });
  const launchers = ensureCodexLaunchers({
    productHome: paths.productHome,
    packageRoot
  });
  const existing = inspectCodexHost(runner, options.cliEnv);

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });

  const serverEnv: Array<[string, string]> = [["EXPERIENCE_ENGINE_ADAPTER", "codex"]];

  if (existing?.name === "experienceengine") {
    runCodexCommand(buildCodexRemoveCommand(options.cliEnv), runner);
  }

  runCodexCommand(
    buildCodexAddCommand(packageRoot, paths.productHome, options.cliEnv, serverEnv, runtimeTarget),
    runner
  );
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
    serverCommand:
      hostInfo?.commandDisplay ??
      buildCodexMcpServerCommand(packageRoot, {
        productHome: paths.productHome,
        runtimeTarget,
        env: options.cliEnv
      }).join(" "),
    runtimeTarget,
    launcherPaths: {
      mcpServer: runtimeTarget === "windows" ? launchers.windowsMcpServer : launchers.mcpServer
    },
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
    runtimeTarget,
    launcherPaths: {
      mcpServer: runtimeTarget === "windows" ? launchers.windowsMcpServer : launchers.mcpServer
    },
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
  const config = loadConfig({}, { env: options.env ?? process.env, homeDir: options.homeDir });
  const resolutionEnv: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    EXPERIENCE_ENGINE_ADAPTER: "codex"
  };
  const distillationResolution = resolveDistillationResolution({
    env: resolutionEnv,
    configProvider: config.distillerProvider,
    configModel: config.distillerModel,
    distillationMode: config.distillationMode,
    allowRuleFallback: config.distillationAllowPassthrough
  });

  return {
    adapter: "codex" as const,
    installed: Boolean(installState),
    versionStatus: buildVersionStatus(Boolean(installState), installState?.installedVersion),
    packageRoot,
    captureDir: paths.captureDir,
    serverName: installState?.serverName ?? "experienceengine",
    serverCommand: installState?.serverCommand,
    runtimeTarget: installState?.runtimeTarget,
    launcherPaths: installState?.launcherPaths,
    hostWiring: {
      wired: Boolean(hostInfo?.commandDisplay),
      command: hostInfo?.commandDisplay,
      transport: hostInfo?.transport,
      enabled: hostInfo?.enabled ?? false
    },
    distillationStatus: {
      distillationMode: distillationResolution.distillationMode,
      distillationSource: distillationResolution.distillationSource,
      provider: distillationResolution.provider,
      reason: distillationResolution.reason,
      diagnostics: distillationResolution.diagnostics
    },
    hostState: hostInfo
  };
};
