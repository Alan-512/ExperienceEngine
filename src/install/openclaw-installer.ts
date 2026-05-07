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
import { loadConfig } from "../config/load-config.js";
import { defaultConfig } from "../config/default-config.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { resolveExperienceEnginePaths, resolveProductStateDir, type ResolvedPathInfo } from "../config/path-resolver.js";
import {
  buildOpenClawInstallCommands,
  buildOpenClawConfigGetCommand,
  buildOpenClawInfoCommand,
  buildOpenClawLoadPathsSetCommand,
  buildOpenClawPluginsConfigGetCommand,
  buildOpenClawWorkspaceGetCommand,
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
import {
  inspectRecordedOpenClawInstallState,
  readPersistedOpenClawInstallState,
  type PersistedOpenClawInstallState
} from "../plugin/openclaw-install-state.js";
import { getOpenClawRuntimeDefaults } from "../plugin/openclaw-runtime-defaults.js";

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
    distillerProvider: string;
    distillerModel: string;
    hybridEnabled: boolean;
    hybridSyncExplainEnabled: boolean;
    hybridAsyncPostmortemEnabled: boolean;
    hybridAsyncPostmortemLlmEnabled: boolean;
    hybridExplainLlmEnabled: boolean;
    hybridExplainProviderMode: string;
    hybridExplainModelProfileVersion: string;
    hybridPostmortemProviderMode: string;
    hybridPostmortemModelProfileVersion: string;
  };
};

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  runner?: OpenClawCommandRunner;
  packageSourceBuilder?: (packageRoot: string, paths: ResolvedPathInfo) => string;
};

const readExplicitBooleanEnv = (env: NodeJS.ProcessEnv, key: string): boolean | undefined =>
  env[key] !== undefined ? env[key] === "true" : undefined;

const readExplicitStringEnv = (env: NodeJS.ProcessEnv, key: string): string | undefined =>
  env[key] !== undefined ? env[key] : undefined;

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
    "@modelcontextprotocol/sdk": dependencies["@modelcontextprotocol/sdk"],
    zod: dependencies.zod
  };
};

const OPENCLAW_PLUGIN_CONFIG_KEYS = [
  "dataDir",
  "sqlitePath",
  "captureDir",
  "distillerProvider",
  "distillerModel",
  "hybridEnabled",
  "hybridSyncExplainEnabled",
  "hybridAsyncPostmortemEnabled",
  "hybridAsyncPostmortemLlmEnabled",
  "hybridExplainLlmEnabled",
  "hybridExplainProviderMode",
  "hybridExplainModelProfileVersion",
  "hybridPostmortemProviderMode",
  "hybridPostmortemModelProfileVersion"
] as const satisfies readonly (keyof ExperienceEngineConfig)[];

type OpenClawComparableConfig = Partial<Record<(typeof OPENCLAW_PLUGIN_CONFIG_KEYS)[number], unknown>>;

const OPENCLAW_PLUGIN_ENTRYPOINT = "plugin/openclaw-plugin.js";
const OPENCLAW_REQUIRED_DIST_ASSETS = ["store/sqlite/schema.sql"] as const;
const OPENCLAW_RELATIVE_IMPORT_PATTERN =
  /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["'](\.[^"']+)["']/g;
const OPENCLAW_DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*["'](\.[^"']+)["']\s*\)/g;
const OPENCLAW_EXCLUDED_RUNTIME_PATHS = new Set([
  "analyzer/llm-learning-gate.js",
  "distillation/queue-worker.js",
  "hybrid/worker-client.js",
  "hybrid/capsule-builder.js",
  "hybrid/postmortem-provider-client.js",
  "install/openclaw-installer.js",
  "install/openclaw-cli.js",
  "store/vector/api-embedding-provider.js",
  "store/vector/local-provider.js"
]);

const normalizeOpenClawPackagedRuntimePath = (value: string): string => value.replaceAll("\\", "/");

const isOpenClawPackagedRuntimeFile = (relativePath: string): boolean =>
  relativePath.endsWith(".js") || relativePath.endsWith(".json");

const isOpenClawExcludedRuntimePath = (relativePath: string): boolean =>
  OPENCLAW_EXCLUDED_RUNTIME_PATHS.has(normalizeOpenClawPackagedRuntimePath(relativePath));

const resolveOpenClawPackagedRuntimeImport = (fromFile: string, specifier: string): string | null => {
  const normalizedFromFile = normalizeOpenClawPackagedRuntimePath(fromFile);
  const baseDir = dirname(normalizedFromFile);
  const resolvedPath = normalizeOpenClawPackagedRuntimePath(resolve("/", baseDir, specifier));
  const relativePath = resolvedPath.startsWith("/") ? resolvedPath.slice(1) : resolvedPath;
  return isOpenClawPackagedRuntimeFile(relativePath) ? relativePath : null;
};

const collectOpenClawRuntimeClosure = (packageRoot: string): string[] => {
  const distRoot = join(packageRoot, "dist");
  const pending = [OPENCLAW_PLUGIN_ENTRYPOINT];
  const collected = new Set<string>();

  while (pending.length > 0) {
    const next = pending.pop();
    if (!next || collected.has(next) || isOpenClawExcludedRuntimePath(next)) {
      continue;
    }

    const sourcePath = join(distRoot, next);
    if (!existsSync(sourcePath)) {
      continue;
    }

    collected.add(next);
    if (!next.endsWith(".js")) {
      continue;
    }

    const source = readFileSync(sourcePath, "utf8");
    for (const pattern of [OPENCLAW_RELATIVE_IMPORT_PATTERN, OPENCLAW_DYNAMIC_IMPORT_PATTERN]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier) {
          continue;
        }

        const resolvedImport = resolveOpenClawPackagedRuntimeImport(next, specifier);
        if (!resolvedImport || collected.has(resolvedImport) || isOpenClawExcludedRuntimePath(resolvedImport)) {
          continue;
        }

        pending.push(resolvedImport);
      }
    }
  }

  for (const requiredAsset of OPENCLAW_REQUIRED_DIST_ASSETS) {
    if (existsSync(join(distRoot, requiredAsset))) {
      collected.add(requiredAsset);
    }
  }

  return [...collected].sort();
};

const copyOpenClawRuntimeClosure = (packageRoot: string, stageDir: string): void => {
  const distRoot = join(packageRoot, "dist");
  const stageDistRoot = join(stageDir, "dist");

  for (const relativePath of collectOpenClawRuntimeClosure(packageRoot)) {
    const sourcePath = join(distRoot, relativePath);
    const destinationPath = join(stageDistRoot, relativePath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    cpSync(sourcePath, destinationPath);
  }
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

  copyOpenClawRuntimeClosure(packageRoot, stageDir);

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

  const archiveRoot = join(tempRoot, "package");
  const tarballPath = join(tempRoot, "experienceengine-openclaw.tgz");

  try {
    cpSync(stageDir, archiveRoot, { recursive: true });
    execFileSync("tar", ["-czf", tarballPath, "-C", tempRoot, "package"], {
      stdio: "pipe",
      encoding: "utf8"
    });
    return tarballPath;
  } catch {
    const output = execFileSync("npm", ["pack", stageDir, "--pack-destination", tempRoot], {
      stdio: "pipe",
      encoding: "utf8"
    }).trim();
    const tarballName = output.split(/\r?\n/).filter(Boolean).at(-1);
    if (!tarballName) {
      throw new Error("npm pack did not return an OpenClaw install artifact");
    }

    return join(tempRoot, tarballName);
  }
};

export type OpenClawInspection = ReturnType<typeof inspectOpenClawInstall>;

export type ClassifiedOpenClawWarnings = {
  owned: string[];
  advisory: string[];
  external: string[];
};

const isOpenClawGlobalWorkspacePath = (workspacePath?: string): boolean =>
  Boolean(workspacePath && /(^|[/\\])\.openclaw[/\\]workspace[/\\]?$/.test(workspacePath.trim()));

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
  existingPluginsConfig: ReturnType<typeof readOpenClawPluginsConfig>,
  expectedInstallPath: string,
  runner?: OpenClawCommandRunner
): void => {
  const loadPaths = existingPluginsConfig?.load?.paths ?? [];
  const filteredLoadPaths = filterExperienceEngineLoadPaths(loadPaths);

  if (filteredLoadPaths.length !== loadPaths.length) {
    runOpenClawCommand(buildOpenClawLoadPathsSetCommand(filteredLoadPaths), runner);
  }

  const installPath = existingPluginsConfig?.installs?.experienceengine?.installPath ?? expectedInstallPath;
  normalizeOpenClawPluginPermissions(installPath);
};

const readOpenClawPluginsConfig = (runner?: OpenClawCommandRunner) => {
  const pluginsOutput = runOpenClawCommand(buildOpenClawPluginsConfigGetCommand(), runner);
  return parseOpenClawPluginsConfig(pluginsOutput).config;
};

const readOpenClawPluginEntryConfig = (runner?: OpenClawCommandRunner) => {
  try {
    const output = runOpenClawCommand(buildOpenClawConfigGetCommand("experienceengine"), runner);
    return parseOpenClawPluginEntryConfig(output).entry?.config ?? null;
  } catch {
    return null;
  }
};

export const installOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport => {
  const env = options.env ?? process.env;
  const resolvedConfig = loadConfig({}, { env, homeDir: options.homeDir });
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const installedVersion = readCurrentPackageVersion(packageRoot);
  const existingEntryConfig = readOpenClawPluginEntryConfig(options.runner);
  const pluginConfig = {
    dataDir: paths.dataDir,
    sqlitePath: paths.sqlitePath,
    captureDir: paths.captureDir,
    distillerProvider:
      readExplicitStringEnv(env, "EXPERIENCE_ENGINE_DISTILLER_PROVIDER")
      ?? (typeof existingEntryConfig?.distillerProvider === "string" ? existingEntryConfig.distillerProvider : undefined)
      ?? resolvedConfig.distillerProvider,
    distillerModel:
      readExplicitStringEnv(env, "EXPERIENCE_ENGINE_DISTILLER_MODEL")
      ?? (typeof existingEntryConfig?.distillerModel === "string" ? existingEntryConfig.distillerModel : undefined)
      ?? resolvedConfig.distillerModel,
    hybridEnabled:
      readExplicitBooleanEnv(env, "EXPERIENCE_ENGINE_HYBRID_ENABLED")
      ?? (typeof existingEntryConfig?.hybridEnabled === "boolean" ? existingEntryConfig.hybridEnabled : undefined)
      ?? resolvedConfig.hybridEnabled,
    hybridSyncExplainEnabled:
      readExplicitBooleanEnv(env, "EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED")
      ?? (typeof existingEntryConfig?.hybridSyncExplainEnabled === "boolean" ? existingEntryConfig.hybridSyncExplainEnabled : undefined)
      ?? resolvedConfig.hybridSyncExplainEnabled,
    hybridAsyncPostmortemEnabled:
      readExplicitBooleanEnv(env, "EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED")
      ?? (typeof existingEntryConfig?.hybridAsyncPostmortemEnabled === "boolean" ? existingEntryConfig.hybridAsyncPostmortemEnabled : undefined)
      ?? resolvedConfig.hybridAsyncPostmortemEnabled,
    hybridAsyncPostmortemLlmEnabled:
      readExplicitBooleanEnv(env, "EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_LLM_ENABLED")
      ?? (typeof existingEntryConfig?.hybridAsyncPostmortemLlmEnabled === "boolean" ? existingEntryConfig.hybridAsyncPostmortemLlmEnabled : undefined)
      ?? resolvedConfig.hybridAsyncPostmortemLlmEnabled,
    hybridExplainLlmEnabled:
      readExplicitBooleanEnv(env, "EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED")
      ?? (typeof existingEntryConfig?.hybridExplainLlmEnabled === "boolean" ? existingEntryConfig.hybridExplainLlmEnabled : undefined)
      ?? resolvedConfig.hybridExplainLlmEnabled,
    hybridExplainProviderMode:
      readExplicitStringEnv(env, "EXPERIENCE_ENGINE_HYBRID_EXPLAIN_PROVIDER_MODE")
      ?? (typeof existingEntryConfig?.hybridExplainProviderMode === "string" ? existingEntryConfig.hybridExplainProviderMode : undefined)
      ?? resolvedConfig.hybridExplainProviderMode,
    hybridExplainModelProfileVersion:
      readExplicitStringEnv(env, "EXPERIENCE_ENGINE_HYBRID_EXPLAIN_MODEL_PROFILE_VERSION")
      ?? (typeof existingEntryConfig?.hybridExplainModelProfileVersion === "string" ? existingEntryConfig.hybridExplainModelProfileVersion : undefined)
      ?? resolvedConfig.hybridExplainModelProfileVersion,
    hybridPostmortemProviderMode:
      readExplicitStringEnv(env, "EXPERIENCE_ENGINE_HYBRID_POSTMORTEM_PROVIDER_MODE")
      ?? (typeof existingEntryConfig?.hybridPostmortemProviderMode === "string" ? existingEntryConfig.hybridPostmortemProviderMode : undefined)
      ?? resolvedConfig.hybridPostmortemProviderMode,
    hybridPostmortemModelProfileVersion:
      readExplicitStringEnv(env, "EXPERIENCE_ENGINE_HYBRID_POSTMORTEM_MODEL_PROFILE_VERSION")
      ?? (typeof existingEntryConfig?.hybridPostmortemModelProfileVersion === "string" ? existingEntryConfig.hybridPostmortemModelProfileVersion : undefined)
      ?? resolvedConfig.hybridPostmortemModelProfileVersion
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
  cleanupOpenClawWarningSources(existingPluginsConfig, expectedInstallPath, options.runner);

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

const isLiveConfigValueMissingButDefault = <K extends keyof OpenClawComparableConfig>(
  key: K,
  expectedValue: OpenClawComparableConfig[K]
): boolean => defaultConfig[key] === expectedValue;

const configsMatch = (
  liveConfig: Record<string, unknown> | undefined,
  expectedConfig: OpenClawComparableConfig | undefined
): boolean =>
  Boolean(liveConfig) &&
  Boolean(expectedConfig) &&
  OPENCLAW_PLUGIN_CONFIG_KEYS.every((key) => {
    const expectedValue = expectedConfig?.[key];
    if (expectedValue === undefined) {
      return true;
    }

    const liveValue = liveConfig?.[key];
    if (liveValue === undefined) {
      return isLiveConfigValueMissingButDefault(key, expectedValue);
    }

    return liveValue === expectedValue;
  });

export const inspectOpenClawInstall = (options: InstallerOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env,
    homeDir: options.homeDir
  });
  const state = readPersistedOpenClawInstallState(paths.installStatePath);
  const expectedConfig = state
    ? {
        dataDir: state.dataDir,
        sqlitePath: state.sqlitePath,
        captureDir: state.captureDir,
        distillerProvider: state.distillerProvider,
        distillerModel: state.distillerModel,
        hybridEnabled: state.hybridEnabled,
        hybridSyncExplainEnabled: state.hybridSyncExplainEnabled,
        hybridAsyncPostmortemEnabled: state.hybridAsyncPostmortemEnabled,
        hybridAsyncPostmortemLlmEnabled: state.hybridAsyncPostmortemLlmEnabled,
        hybridExplainLlmEnabled: state.hybridExplainLlmEnabled,
        hybridExplainProviderMode: state.hybridExplainProviderMode,
        hybridExplainModelProfileVersion: state.hybridExplainModelProfileVersion,
        hybridPostmortemProviderMode: state.hybridPostmortemProviderMode,
        hybridPostmortemModelProfileVersion: state.hybridPostmortemModelProfileVersion
      }
    : undefined;
  const runtimeDefaults = getOpenClawRuntimeDefaults();

  let hostState: HostState = {
    warnings: [],
    configMatches: false
  };
  let workspace: {
    path?: string;
    globalWorkspace: boolean;
    isolationBehavior: "project_scope" | "session_isolated";
  } = {
    globalWorkspace: false,
    isolationBehavior: "project_scope"
  };

  try {
    const infoOutput = runOpenClawCommand(buildOpenClawInfoCommand("experienceengine"), options.runner);
    const configOutput = runOpenClawCommand(buildOpenClawConfigGetCommand("experienceengine"), options.runner);
    const workspaceOutput = runOpenClawCommand(buildOpenClawWorkspaceGetCommand(), options.runner);
    const info = parseOpenClawPluginInfo(infoOutput);
    const config = parseOpenClawPluginEntryConfig(configOutput);
    const workspacePath = workspaceOutput.trim() || undefined;
    const globalWorkspace = isOpenClawGlobalWorkspacePath(workspacePath);
    const liveConfig = config.entry?.config;
    const expected = expectedConfig;
    workspace = {
      path: workspacePath,
      globalWorkspace,
      isolationBehavior: globalWorkspace ? "session_isolated" : "project_scope"
    };

    hostState = {
      status: info.status,
      error: info.error,
      warnings: [...info.warnings, ...config.warnings],
      sourcePath: info.sourcePath,
      installPath: info.installPath,
      enabled: config.entry?.enabled,
      liveConfig,
      configMatches: configsMatch(liveConfig, expected)
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
    runtimeDefaults,
    workspace,
    hostState
  };
};

export const repairOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport =>
  installOpenClawAdapter(options);
