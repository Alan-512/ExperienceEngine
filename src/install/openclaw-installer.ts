import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { resolveExperienceEnginePaths, resolveProductStateDir, type ResolvedPathInfo } from "../config/path-resolver.js";
import {
  buildOpenClawInstallCommands,
  buildOpenClawConfigGetCommand,
  buildOpenClawInfoCommand,
  buildOpenClawLoadPathsSetCommand,
  buildOpenClawPluginsConfigGetCommand,
  parseOpenClawPluginEntryConfig,
  parseOpenClawPluginInfo,
  parseOpenClawPluginsConfig,
  resolveExperienceEnginePackageRoot,
  runOpenClawCommand,
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

type HostState = {
  status?: string;
  error?: string;
  warnings: string[];
  sourcePath?: string;
  installPath?: string;
  enabled?: boolean;
  configMatches: boolean;
  liveConfig?: Record<string, unknown>;
};

export type OpenClawInspection = ReturnType<typeof inspectOpenClawInstall>;

export const isOpenClawRepairRecommended = (inspection: {
  installed: boolean;
  hostState: Pick<HostState, "status" | "enabled" | "configMatches" | "error">;
}): boolean =>
  !inspection.installed ||
  inspection.hostState.enabled !== true ||
  inspection.hostState.configMatches !== true ||
  Boolean(inspection.hostState.error) ||
  (inspection.hostState.status !== undefined && inspection.hostState.status.toLowerCase() !== "loaded");

export const getOpenClawRepairHint = (inspection: {
  installed: boolean;
  hostState: Pick<HostState, "status" | "enabled" | "configMatches" | "error">;
}): string | null => (isOpenClawRepairRecommended(inspection) ? "ee repair openclaw" : null);

const identifyExperienceEnginePath = (rootPath: string): boolean => {
  if (!rootPath) {
    return false;
  }

  if (basename(rootPath).toLowerCase().includes("experienceengine")) {
    return true;
  }

  const manifestPath = join(rootPath, "openclaw.plugin.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { id?: string };
      return manifest.id === "experienceengine";
    } catch {
      return false;
    }
  }

  const packagePath = join(rootPath, "package.json");
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string };
      return pkg.name === "experienceengine";
    } catch {
      return false;
    }
  }

  return false;
};

export const filterExperienceEngineLoadPaths = (paths: string[]): string[] =>
  paths.filter((path) => !identifyExperienceEnginePath(path));

export const normalizeTreePermissions = (rootPath: string): void => {
  if (!existsSync(rootPath)) {
    return;
  }

  const stats = statSync(rootPath);
  if (stats.isDirectory()) {
    chmodSync(rootPath, 0o755);
    for (const entry of readdirSync(rootPath)) {
      normalizeTreePermissions(join(rootPath, entry));
    }
    return;
  }

  chmodSync(rootPath, 0o644);
};

const cleanupOpenClawWarningSources = (
  paths: ResolvedPathInfo,
  runner?: OpenClawCommandRunner
): void => {
  const pluginsOutput = runOpenClawCommand(buildOpenClawPluginsConfigGetCommand(), runner);
  const parsed = parseOpenClawPluginsConfig(pluginsOutput);
  const loadPaths = parsed.config?.load?.paths ?? [];
  const filteredLoadPaths = filterExperienceEngineLoadPaths(loadPaths);

  if (filteredLoadPaths.length !== loadPaths.length) {
    runOpenClawCommand(buildOpenClawLoadPathsSetCommand(filteredLoadPaths), runner);
  }

  const installPath =
    parsed.config?.installs?.experienceengine?.installPath ??
    join(dirname(paths.compatibilityHome), "extensions", "experienceengine");
  normalizeTreePermissions(installPath);
};

const readOpenClawPluginsConfig = (runner?: OpenClawCommandRunner) => {
  const pluginsOutput = runOpenClawCommand(buildOpenClawPluginsConfigGetCommand(), runner);
  return parseOpenClawPluginsConfig(pluginsOutput).config;
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

  const existingPluginsConfig = readOpenClawPluginsConfig(options.runner);
  const installMode =
    existingPluginsConfig?.installs?.experienceengine?.installPath ? "update" : "install";
  const commands = buildOpenClawInstallCommands(packageRoot, "experienceengine", installMode, pluginConfig);
  runOpenClawCommands(commands, options.runner);
  cleanupOpenClawWarningSources(paths, options.runner);

  const payload = {
    adapter: "openclaw",
    installedAt: new Date().toISOString(),
    packageRoot,
    installMode: installMode === "update" ? "updated-plugin" : "copied-plugin",
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
  const expectedConfig = state
    ? {
        dataDir: state.dataDir,
        sqlitePath: state.sqlitePath,
        captureDir: state.captureDir
      }
    : undefined;

  let hostState: HostState = {
    warnings: [],
    configMatches: false
  };

  try {
    const infoOutput = runOpenClawCommand(buildOpenClawInfoCommand("experienceengine"), options.runner);
    const configOutput = runOpenClawCommand(buildOpenClawConfigGetCommand("experienceengine"), options.runner);
    const info = parseOpenClawPluginInfo(infoOutput);
    const config = parseOpenClawPluginEntryConfig(configOutput);
    const liveConfig = config.entry?.config;
    const expected = expectedConfig;

    hostState = {
      status: info.status,
      error: info.error,
      warnings: [...info.warnings, ...config.warnings],
      sourcePath: info.sourcePath,
      installPath: info.installPath,
      enabled: config.entry?.enabled,
      liveConfig,
      configMatches:
        Boolean(expected) &&
        Boolean(liveConfig) &&
        liveConfig?.dataDir === expected?.dataDir &&
        liveConfig?.sqlitePath === expected?.sqlitePath &&
        liveConfig?.captureDir === expected?.captureDir
    };
  } catch (error) {
    hostState = {
      warnings: [],
      configMatches: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

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
    },
    hostState
  };
};

export const repairOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport =>
  installOpenClawAdapter(options);
