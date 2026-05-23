import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolveExperienceEnginePaths, resolveProductStateDir } from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import { readCurrentPackageVersion, buildVersionStatus } from "../version/package-version.js";
import {
  ensureAntigravityProjectWiring,
  inspectAntigravityProjectWiring,
  runAntigravityHookSpikeVerification,
  type AntigravityLifecycleMode,
  type AntigravityOptions,
  type AntigravityProjectWiringReport
} from "./antigravity-project-wiring.js";
import {
  ensureAntigravityGlobalWiring,
  inspectAntigravityGlobalWiring,
  type AntigravityGlobalActivationState,
  type AntigravityGlobalWiringReport
} from "./antigravity-global-wiring.js";

export {
  ensureAntigravityProjectWiring,
  inspectAntigravityProjectWiring,
  runAntigravityHookSpikeVerification,
  type AntigravityLifecycleMode,
  type AntigravityOptions,
  type AntigravityProjectWiringReport
};

export type AntigravityInstallState = {
  adapter: "antigravity";
  installScope: "user";
  installedAt: string;
  installedVersion: string;
  packageRoot: string;
  captureDir: string;
  lifecycleMode: AntigravityLifecycleMode;
  mcpRegistered: boolean;
  hooksRegistered: boolean;
  hookContractSpikePassed: boolean;
  agentDesktopGlobalActivation: AntigravityGlobalActivationState;
  serverName: string;
  serverCommand: string;
  globalWiring: AntigravityGlobalWiringReport;
  projectWiring: AntigravityProjectWiringReport;
};

export type AntigravityInstallReport = {
  adapter: "antigravity";
  installScope: "user";
  installed: boolean;
  packageRoot: string;
  installedVersion: string;
  captureDir: string;
  lifecycleMode: AntigravityLifecycleMode;
  mcpRegistered: boolean;
  hooksRegistered: boolean;
  hookContractSpikePassed: boolean;
  agentDesktopGlobalActivation: AntigravityGlobalActivationState;
  serverName: string;
  serverCommand: string;
  globalWiring: AntigravityGlobalWiringReport;
  projectWiring: AntigravityProjectWiringReport;
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
    enabled?: boolean;
  };
};

export type AntigravityInspection = {
  adapter: "antigravity";
  installScope: "user";
  installed: boolean;
  versionStatus: ReturnType<typeof buildVersionStatus>;
  packageRoot: string;
  captureDir: string;
  lifecycleMode: AntigravityLifecycleMode;
  mcpRegistered: boolean;
  hooksRegistered: boolean;
  hookContractSpikePassed: boolean;
  cliAvailable: boolean;
  agyCliAvailable: boolean;
  agyCliPath?: string;
  ideCliAvailable: boolean;
  ideCliPath?: string;
  cliValidatedInvocation: string;
  cliProjectDiscoveryNote?: string;
  agentDesktopGlobalActivation: AntigravityGlobalActivationState;
  globalWiring: AntigravityGlobalWiringReport;
  projectWiring: AntigravityProjectWiringReport;
  recommendedNextStep?: string;
  serverName: string;
  serverCommand: string;
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
    enabled?: boolean;
  };
};

const findCommandPath = (command: string, env?: NodeJS.ProcessEnv): string | undefined => {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookupCommand, [command], {
    encoding: "utf8",
    env: env ?? process.env
  });
  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
};

const resolveAntigravityRecommendedNextStep = (
  globalWiring: AntigravityGlobalWiringReport,
  projectWiring: AntigravityProjectWiringReport,
  agyCliAvailable: boolean
): string | undefined => {
  if (globalWiring.hooksRegistered && globalWiring.mcpRegistered) {
    return agyCliAvailable
      ? "Start Agent Desktop in any project, or use `ee agy exec -C <project> \"<prompt>\"` for headless CLI runs."
      : "Start Agent Desktop in any project. Install or repair Antigravity CLI (`agy`) before using headless CLI validation.";
  }

  if (!projectWiring.mcpRegistered || !projectWiring.hooksRegistered) {
    return agyCliAvailable
      ? "Run `ee agy exec -C <project> \"<prompt>\"` to auto-activate this project for CLI runs, or `ee antigravity activate-project -C <project>` before using Agent Desktop."
      : "Run `ee antigravity activate-project -C <project>` before using Agent Desktop.";
  }

  if (!agyCliAvailable) {
    return "Install or repair Antigravity CLI (`agy`) before using headless CLI validation.";
  }

  return undefined;
};

export const installAntigravityAdapter = async (options: AntigravityOptions = {}): Promise<AntigravityInstallReport> => {
  const env = options.env ?? process.env;
  const paths = resolveExperienceEnginePaths({
    adapter: "antigravity",
    env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const installedVersion = readCurrentPackageVersion(packageRoot);

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });

  const globalWiring = await ensureAntigravityGlobalWiring(options);
  const projectWiring = inspectAntigravityProjectWiring(options);
  const state: AntigravityInstallState = {
    adapter: "antigravity",
    installScope: "user",
    installedAt: new Date().toISOString(),
    installedVersion,
    packageRoot,
    captureDir: paths.captureDir,
    lifecycleMode: globalWiring.lifecycleMode,
    mcpRegistered: globalWiring.mcpRegistered,
    hooksRegistered: globalWiring.hooksRegistered,
    hookContractSpikePassed: globalWiring.hookContractSpikePassed,
    agentDesktopGlobalActivation: globalWiring.agentDesktopGlobalActivation,
    serverName: globalWiring.serverName,
    serverCommand: globalWiring.serverCommand,
    globalWiring,
    projectWiring
  };

  writeFileSync(paths.installStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  return {
    adapter: "antigravity",
    installScope: "user",
    installed: true,
    packageRoot,
    installedVersion,
    captureDir: paths.captureDir,
    lifecycleMode: state.lifecycleMode,
    mcpRegistered: state.mcpRegistered,
    hooksRegistered: state.hooksRegistered,
    hookContractSpikePassed: state.hookContractSpikePassed,
    agentDesktopGlobalActivation: state.agentDesktopGlobalActivation,
    serverName: state.serverName,
    serverCommand: state.serverCommand,
    globalWiring,
    projectWiring,
    hostWiring: {
      wired: globalWiring.mcpRegistered,
      command: globalWiring.serverCommand,
      transport: "stdio",
      enabled: globalWiring.mcpRegistered
    }
  };
};

export const inspectAntigravityInstall = (options: AntigravityOptions = {}): AntigravityInspection => {
  const env = options.env ?? process.env;
  const paths = resolveExperienceEnginePaths({
    adapter: "antigravity",
    env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();

  let installState: AntigravityInstallState | null = null;
  if (existsSync(paths.installStatePath)) {
    try {
      const parsed = JSON.parse(readFileSync(paths.installStatePath, "utf8")) as Partial<AntigravityInstallState>;
      installState = {
        adapter: "antigravity",
        installScope: "user",
        installedAt: parsed.installedAt ?? "",
        installedVersion: parsed.installedVersion ?? "",
        packageRoot: parsed.packageRoot ?? packageRoot,
        captureDir: parsed.captureDir ?? paths.captureDir,
        lifecycleMode: parsed.lifecycleMode ?? "mcp_only",
        mcpRegistered: parsed.mcpRegistered ?? false,
        hooksRegistered: parsed.hooksRegistered ?? false,
        hookContractSpikePassed: parsed.hookContractSpikePassed ?? (parsed as any).simulatedHookSpikePassed ?? false,
        agentDesktopGlobalActivation: parsed.agentDesktopGlobalActivation ?? "unsupported",
        serverName: parsed.serverName ?? "experienceengine",
        serverCommand: parsed.serverCommand ?? "",
        globalWiring: parsed.globalWiring as AntigravityGlobalWiringReport,
        projectWiring: parsed.projectWiring as AntigravityProjectWiringReport
      };
    } catch {
      // Ignore malformed install state.
    }
  }

  const projectWiring = inspectAntigravityProjectWiring(options);
  const globalWiring = inspectAntigravityGlobalWiring(options);
  const agyCliPath = findCommandPath("agy", env);
  const ideCliPath = findCommandPath("antigravity", env);
  const agyCliAvailable = Boolean(agyCliPath);
  const installed = Boolean(installState || globalWiring.mcpRegistered || projectWiring.mcpRegistered);
  const lifecycleMode = globalWiring.mcpRegistered ? globalWiring.lifecycleMode : projectWiring.lifecycleMode;
  const agentDesktopGlobalActivation = globalWiring.agentDesktopGlobalActivation;

  return {
    adapter: "antigravity",
    installScope: "user",
    installed,
    versionStatus: buildVersionStatus(installed, installState?.installedVersion),
    packageRoot,
    captureDir: paths.captureDir,
    lifecycleMode,
    mcpRegistered: globalWiring.mcpRegistered || projectWiring.mcpRegistered,
    hooksRegistered: globalWiring.hooksRegistered || projectWiring.hooksRegistered,
    hookContractSpikePassed:
      installState?.hookContractSpikePassed ?? globalWiring.hookContractSpikePassed ?? projectWiring.hookContractSpikePassed,
    cliAvailable: agyCliAvailable,
    agyCliAvailable,
    agyCliPath,
    ideCliAvailable: Boolean(ideCliPath),
    ideCliPath,
    cliValidatedInvocation: "ee agy exec -C <project-path> \"<prompt>\"",
    cliProjectDiscoveryNote:
      "The wrapper auto-adds `agy --add-dir <project-path>` for reliable workspace discovery on Windows.",
    agentDesktopGlobalActivation,
    globalWiring,
    projectWiring,
    recommendedNextStep: resolveAntigravityRecommendedNextStep(globalWiring, projectWiring, agyCliAvailable),
    serverName: globalWiring.serverName,
    serverCommand: globalWiring.serverCommand,
    hostWiring: {
      wired: globalWiring.mcpRegistered || projectWiring.mcpRegistered,
      command: globalWiring.mcpRegistered ? globalWiring.serverCommand : projectWiring.serverCommand,
      transport: "stdio",
      enabled: globalWiring.mcpRegistered || projectWiring.mcpRegistered
    }
  };
};

export const repairAntigravityAdapter = async (options: AntigravityOptions = {}): Promise<AntigravityInstallReport> => {
  return await installAntigravityAdapter(options);
};
