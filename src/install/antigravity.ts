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

export {
  ensureAntigravityProjectWiring,
  inspectAntigravityProjectWiring,
  runAntigravityHookSpikeVerification,
  type AntigravityLifecycleMode,
  type AntigravityOptions,
  type AntigravityProjectWiringReport
};

export type AntigravityGlobalActivationState = "unsupported" | "supported" | "unknown";

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
  projectWiring: AntigravityProjectWiringReport,
  agyCliAvailable: boolean
): string | undefined => {
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

  const projectWiring = await ensureAntigravityProjectWiring(options);
  const state: AntigravityInstallState = {
    adapter: "antigravity",
    installScope: "user",
    installedAt: new Date().toISOString(),
    installedVersion,
    packageRoot,
    captureDir: paths.captureDir,
    lifecycleMode: projectWiring.lifecycleMode,
    mcpRegistered: projectWiring.mcpRegistered,
    hooksRegistered: projectWiring.hooksRegistered,
    hookContractSpikePassed: projectWiring.hookContractSpikePassed,
    agentDesktopGlobalActivation: "unsupported",
    serverName: projectWiring.serverName,
    serverCommand: projectWiring.serverCommand,
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
    projectWiring,
    hostWiring: {
      wired: projectWiring.mcpRegistered,
      command: projectWiring.serverCommand,
      transport: "stdio",
      enabled: projectWiring.mcpRegistered
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
        projectWiring: parsed.projectWiring as AntigravityProjectWiringReport
      };
    } catch {
      // Ignore malformed install state.
    }
  }

  const projectWiring = inspectAntigravityProjectWiring(options);
  const agyCliPath = findCommandPath("agy", env);
  const ideCliPath = findCommandPath("antigravity", env);
  const agyCliAvailable = Boolean(agyCliPath);
  const installed = Boolean(installState || projectWiring.mcpRegistered);
  const lifecycleMode = projectWiring.lifecycleMode;
  const agentDesktopGlobalActivation = installState?.agentDesktopGlobalActivation ?? "unsupported";

  return {
    adapter: "antigravity",
    installScope: "user",
    installed,
    versionStatus: buildVersionStatus(installed, installState?.installedVersion),
    packageRoot,
    captureDir: paths.captureDir,
    lifecycleMode,
    mcpRegistered: projectWiring.mcpRegistered,
    hooksRegistered: projectWiring.hooksRegistered,
    hookContractSpikePassed: installState?.hookContractSpikePassed ?? projectWiring.hookContractSpikePassed,
    cliAvailable: agyCliAvailable,
    agyCliAvailable,
    agyCliPath,
    ideCliAvailable: Boolean(ideCliPath),
    ideCliPath,
    cliValidatedInvocation: "ee agy exec -C <project-path> \"<prompt>\"",
    cliProjectDiscoveryNote:
      "The wrapper auto-adds `agy --add-dir <project-path>` and refreshes project wiring. Direct `agy` runs still need --add-dir on Windows.",
    agentDesktopGlobalActivation,
    projectWiring,
    recommendedNextStep: resolveAntigravityRecommendedNextStep(projectWiring, agyCliAvailable),
    serverName: projectWiring.serverName,
    serverCommand: projectWiring.serverCommand,
    hostWiring: {
      wired: projectWiring.mcpRegistered,
      command: projectWiring.serverCommand,
      transport: "stdio",
      enabled: projectWiring.mcpRegistered
    }
  };
};

export const repairAntigravityAdapter = async (options: AntigravityOptions = {}): Promise<AntigravityInstallReport> => {
  return await installAntigravityAdapter(options);
};
