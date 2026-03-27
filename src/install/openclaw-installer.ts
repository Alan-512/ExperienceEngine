import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { resolveExperienceEnginePaths, resolveProductStateDir, type ResolvedPathInfo } from "../config/path-resolver.js";
import {
  buildOpenClawInstallCommands,
  buildOpenClawConfigGetCommand,
  buildOpenClawInfoCommand,
  buildOpenClawLoadPathsSetCommand,
  buildOpenClawPluginsConfigGetCommand,
  type OpenClawInstallAction,
  parseOpenClawPluginEntryConfig,
  parseOpenClawPluginInfo,
  parseOpenClawPluginsConfig,
  resolveExperienceEnginePackageRoot,
  runOpenClawCommand,
  runOpenClawCommands,
  type OpenClawCommand,
  type OpenClawCommandRunner
} from "./openclaw-cli.js";
import { buildVersionStatus, readCurrentPackageVersion } from "../version/package-version.js";

export type OpenClawInstallReport = {
  adapter: "openclaw";
  installed: true;
  paths: ResolvedPathInfo;
  packageRoot: string;
  installSource: string;
  installedVersion: string;
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
  packageSourceBuilder?: (packageRoot: string, paths: ResolvedPathInfo) => string;
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
  driftDetected?: boolean;
  driftReason?: string;
};

const OPENCLAW_DRIFT_SENTINELS = [
  "dist/plugin/openclaw-plugin.js",
  "dist/runtime/service.js",
  "dist/store/sqlite/db.js",
  "dist/store/sqlite/repositories/injection-repo.js"
] as const;

const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const expandHomePath = (value: string, homeDir?: string): string => {
  const resolvedHome = homeDir ? resolve(homeDir) : resolve(homedir());
  return value === "~" ? resolvedHome : value.startsWith("~/") ? join(resolvedHome, value.slice(2)) : value;
};

const inspectInstalledOpenClawBundleDrift = (
  packageRoot: string | undefined,
  installPath: string | undefined,
  homeDir?: string
): { detected: boolean; reason?: string } => {
  if (!packageRoot || !installPath) {
    return { detected: false };
  }

  const normalizedPackageRoot = resolve(expandHomePath(packageRoot, homeDir));
  const normalizedInstallPath = resolve(expandHomePath(installPath, homeDir));
  if (normalizedPackageRoot === normalizedInstallPath) {
    return { detected: false };
  }

  if (!existsSync(normalizedInstallPath)) {
    return {
      detected: true,
      reason: `Installed OpenClaw plugin path is missing: ${normalizedInstallPath}.`
    };
  }

  for (const relativePath of OPENCLAW_DRIFT_SENTINELS) {
    const packageFile = join(normalizedPackageRoot, relativePath);
    const installFile = join(normalizedInstallPath, relativePath);

    if (!existsSync(packageFile)) {
      continue;
    }

    if (!existsSync(installFile)) {
      return {
        detected: true,
        reason: `Installed OpenClaw plugin bundle is missing ${relativePath}.`
      };
    }

    if (sha256File(packageFile) !== sha256File(installFile)) {
      return {
        detected: true,
        reason: `Installed OpenClaw plugin bundle differs from the current ExperienceEngine package at ${relativePath}.`
      };
    }
  }

  return { detected: false };
};

const inferOpenClawInstallAction = (
  pluginsConfig: ReturnType<typeof readOpenClawPluginsConfig>,
  packageRoot: string,
  installPath: string
): OpenClawInstallAction => {
  const install = pluginsConfig?.installs?.experienceengine;
  if (!install) {
    return existsSync(installPath) ? "reinstall" : "install";
  }

  if (install.source === "npm") {
    return "update";
  }

  const normalizedCurrentRoot = packageRoot.trim();
  const normalizedSourcePath = install.sourcePath?.trim();
  if (install.source === "path" || install.installPath || !normalizedSourcePath) {
    return "reinstall";
  }

  return normalizedSourcePath === normalizedCurrentRoot ? "reinstall" : "reinstall";
};

const removeExistingOpenClawInstallPath = (installPath: string): void => {
  if (existsSync(installPath)) {
    rmSync(installPath, { recursive: true, force: true });
  }
};

export const buildOpenClawPackagedDependencies = (rawPackageJson: Record<string, unknown>): Record<string, string> => {
  const dependencies =
    rawPackageJson.dependencies && typeof rawPackageJson.dependencies === "object"
      ? (rawPackageJson.dependencies as Record<string, string>)
      : {};

  return {
    "@huggingface/transformers": dependencies["@huggingface/transformers"],
    zod: dependencies.zod
  };
};

const protectOpenClawReinstallPath = (installPath: string, packageRoot: string, homeDir?: string): void => {
  const normalizedInstallPath = resolve(expandHomePath(installPath, homeDir));
  const normalizedPackageRoot = resolve(expandHomePath(packageRoot, homeDir));
  if (normalizedInstallPath === normalizedPackageRoot) {
    throw new Error(
      `Refusing to delete OpenClaw install path ${normalizedInstallPath} because it points at the current ExperienceEngine working tree.`
    );
  }

  const gitMarker = join(normalizedInstallPath, ".git");
  if (existsSync(gitMarker)) {
    throw new Error(
      `Refusing to delete OpenClaw install path ${normalizedInstallPath} because it looks like a git working tree.`
    );
  }

  const looksLikeSourceTree =
    existsSync(join(normalizedInstallPath, "src")) && existsSync(join(normalizedInstallPath, "tsconfig.json"));
  if (looksLikeSourceTree) {
    throw new Error(
      `Refusing to delete OpenClaw install path ${normalizedInstallPath} because it looks like a live source checkout.`
    );
  }
};

export const createOpenClawInstallTarball = (packageRoot: string, paths: ResolvedPathInfo): string => {
  const tempRoot = mkdtempSync(join(resolveProductStateDir(paths), "openclaw-package-"));
  const stageDir = join(tempRoot, "experienceengine-openclaw");
  mkdirSync(stageDir, { recursive: true });

  cpSync(join(packageRoot, "dist"), join(stageDir, "dist"), { recursive: true });

  const rawPackageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const packagedManifest = {
    name: rawPackageJson.name,
    version: rawPackageJson.version,
    type: rawPackageJson.type,
    description: rawPackageJson.description,
    openclaw: rawPackageJson.openclaw,
    engines: rawPackageJson.engines,
    dependencies: buildOpenClawPackagedDependencies(rawPackageJson)
  };
  writeFileSync(join(stageDir, "package.json"), `${JSON.stringify(packagedManifest, null, 2)}\n`, "utf8");

  const pluginManifestPath = join(packageRoot, "openclaw.plugin.json");
  if (existsSync(pluginManifestPath)) {
    cpSync(pluginManifestPath, join(stageDir, "openclaw.plugin.json"));
  }

  for (const filename of ["README.md", "LICENSE", "LICENSE.md"]) {
    const sourcePath = join(packageRoot, filename);
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, join(stageDir, filename));
    }
  }

  const output = execFileSync("npm", ["pack", stageDir, "--pack-destination", tempRoot], {
    stdio: "pipe",
    encoding: "utf8"
  }).trim();
  const tarballName = output.split(/\r?\n/).filter(Boolean).at(-1);
  if (!tarballName) {
    throw new Error("npm pack did not return an OpenClaw install artifact");
  }

  return join(tempRoot, tarballName);
};

export type OpenClawInspection = ReturnType<typeof inspectOpenClawInstall>;

export type ClassifiedOpenClawWarnings = {
  owned: string[];
  advisory: string[];
  external: string[];
};

export const isOpenClawRepairRecommended = (inspection: {
  installed: boolean;
  hostState: Pick<HostState, "status" | "enabled" | "configMatches" | "error" | "driftDetected">;
}): boolean =>
  !inspection.installed ||
  inspection.hostState.enabled !== true ||
  inspection.hostState.configMatches !== true ||
  inspection.hostState.driftDetected === true ||
  Boolean(inspection.hostState.error) ||
  (inspection.hostState.status !== undefined && inspection.hostState.status.toLowerCase() !== "loaded");

export const getOpenClawRepairHint = (inspection: {
  installed: boolean;
  hostState: Pick<HostState, "status" | "enabled" | "configMatches" | "error" | "driftDetected">;
}): string | null => (isOpenClawRepairRecommended(inspection) ? "ee repair openclaw" : null);

const normalizeWarningNeedles = (inspection: {
  packageRoot?: string;
  hostState: Pick<HostState, "sourcePath" | "installPath">;
}): string[] => {
  const values = [
    "experienceengine",
    inspection.packageRoot,
    inspection.hostState.sourcePath,
    inspection.hostState.installPath
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  return Array.from(
    new Set(
      values.flatMap((value) => {
        const trimmed = value.trim();
        return [trimmed.toLowerCase(), basename(trimmed).toLowerCase()];
      })
    )
  );
};

export const classifyOpenClawHostWarnings = (inspection: {
  packageRoot?: string;
  hostState: Pick<HostState, "warnings" | "sourcePath" | "installPath">;
}): ClassifiedOpenClawWarnings => {
  const advisoryPatterns = [/plugins\.allow is empty/i];
  const ownershipNeedles = normalizeWarningNeedles(inspection);

  return inspection.hostState.warnings.reduce<ClassifiedOpenClawWarnings>(
    (groups, warning) => {
      if (advisoryPatterns.some((pattern) => pattern.test(warning))) {
        groups.advisory.push(warning);
        return groups;
      }

      const normalizedWarning = warning.toLowerCase();
      if (ownershipNeedles.some((needle) => normalizedWarning.includes(needle))) {
        groups.owned.push(warning);
        return groups;
      }

      groups.external.push(warning);
      return groups;
    },
    { owned: [], advisory: [], external: [] }
  );
};

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
      return pkg.name === "experienceengine" || pkg.name === "@alan512/experienceengine";
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

const normalizeOpenClawPluginPermissions = (installPath: string): void => {
  if (existsSync(installPath)) {
    chmodSync(installPath, 0o755);
  }

  const pathsToNormalize = [
    join(installPath, "src"),
    join(installPath, "dist"),
    join(installPath, "src", "plugin"),
    join(installPath, "openclaw.plugin.json"),
    join(installPath, "package.json")
  ];

  for (const path of pathsToNormalize) {
    normalizeTreePermissions(path);
  }
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
  normalizeOpenClawPluginPermissions(installPath);
};

const readOpenClawPluginsConfig = (runner?: OpenClawCommandRunner) => {
  const pluginsOutput = runOpenClawCommand(buildOpenClawPluginsConfigGetCommand(), runner);
  return parseOpenClawPluginsConfig(pluginsOutput).config;
};

export const installOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const installedVersion = readCurrentPackageVersion(packageRoot);
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
  const expectedInstallPath =
    existingPluginsConfig?.installs?.experienceengine?.installPath ??
    join(dirname(paths.compatibilityHome), "extensions", "experienceengine");
  const installAction = inferOpenClawInstallAction(existingPluginsConfig, packageRoot, expectedInstallPath);
  if (installAction === "reinstall") {
    protectOpenClawReinstallPath(expectedInstallPath, packageRoot, options.homeDir);
    removeExistingOpenClawInstallPath(expectedInstallPath);
  }
  const installSource = (options.packageSourceBuilder ?? createOpenClawInstallTarball)(packageRoot, paths);
  const commands = buildOpenClawInstallCommands(installSource, "experienceengine", installAction, pluginConfig);
  runOpenClawCommands(commands, options.runner);
  cleanupOpenClawWarningSources(paths, options.runner);

  const payload = {
    adapter: "openclaw",
    installedAt: new Date().toISOString(),
    installedVersion,
    packageRoot,
    installSource,
    installMode:
      installAction === "update"
        ? "updated-plugin"
        : installAction === "reinstall"
          ? "reinstalled-packaged-plugin"
          : "packaged-plugin",
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
    installSource,
    installedVersion,
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
  installedVersion?: string;
  packageRoot?: string;
  installSource?: string;
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

    const drift = inspectInstalledOpenClawBundleDrift(state?.packageRoot, info.installPath, options.homeDir);
    hostState.driftDetected = drift.detected;
    hostState.driftReason = drift.reason;
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
    versionStatus: buildVersionStatus(paths.usedInstallState, state?.installedVersion),
    pathMode: paths.mode,
    activeHome: paths.activeHome,
    sqlitePath: paths.sqlitePath,
    captureDir: paths.captureDir,
    installStatePath: paths.installStatePath,
    packageRoot: state?.packageRoot,
    installSource: state?.installSource,
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
