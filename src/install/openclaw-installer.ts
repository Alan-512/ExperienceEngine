import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveExperienceEnginePaths, resolveProductStateDir, type ResolvedPathInfo } from "../config/path-resolver.js";
import {
  buildOpenClawInstallCommands,
  resolveExperienceEnginePackageRoot,
  runOpenClawCommands,
  type OpenClawCommand,
  type OpenClawCommandRunner
} from "./openclaw-cli.js";

export type OpenClawInstallReport = {
  adapter: "openclaw";
  installed: true;
  paths: ResolvedPathInfo;
  packageRoot: string;
  hostWiring: {
    wired: boolean;
    commands: OpenClawCommand[];
    restartRecommended: boolean;
  };
  pluginConfig: {
    dataDir: string;
    sqlitePath: string;
    captureDir: string;
  };
};

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  runner?: OpenClawCommandRunner;
};

export const installOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env ?? {},
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const pluginConfig = {
    dataDir: paths.dataDir,
    sqlitePath: paths.sqlitePath,
    captureDir: paths.captureDir
  };

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });
  mkdirSync(dirname(paths.sqlitePath), { recursive: true });

  const commands = buildOpenClawInstallCommands(packageRoot, "experienceengine", pluginConfig);
  runOpenClawCommands(commands, options.runner);

  const payload = {
    adapter: "openclaw",
    installedAt: new Date().toISOString(),
    packageRoot,
    installMode: "linked-plugin",
    hostWiring: {
      wired: true,
      restartRecommended: true
    },
    ...pluginConfig
  };

  writeFileSync(paths.installStatePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    adapter: "openclaw",
    installed: true,
    paths,
    packageRoot,
    hostWiring: {
      wired: true,
      commands,
      restartRecommended: true
    },
    pluginConfig
  };
};

type PersistedInstallState = {
  adapter: string;
  installedAt: string;
  packageRoot?: string;
  installMode?: string;
  hostWiring?: {
    wired?: boolean;
    restartRecommended?: boolean;
  };
  dataDir?: string;
  sqlitePath?: string;
  captureDir?: string;
};

const readInstallState = (installStatePath: string): PersistedInstallState | null => {
  if (!existsSync(installStatePath)) {
    return null;
  }

  const raw = readFileSync(installStatePath, "utf8");
  return JSON.parse(raw) as PersistedInstallState;
};

export const inspectOpenClawInstall = (options: InstallerOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env,
    homeDir: options.homeDir
  });
  const state = readInstallState(paths.installStatePath);

  return {
    adapter: "openclaw" as const,
    installed: paths.usedInstallState,
    pathMode: paths.mode,
    activeHome: paths.activeHome,
    sqlitePath: paths.sqlitePath,
    captureDir: paths.captureDir,
    installStatePath: paths.installStatePath,
    packageRoot: state?.packageRoot,
    installMode: state?.installMode,
    hostWiring: {
      wired: state?.hostWiring?.wired ?? false,
      restartRecommended: state?.hostWiring?.restartRecommended ?? false
    }
  };
};
