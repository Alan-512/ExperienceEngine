import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire, isBuiltin } from "node:module";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, posix, resolve } from "node:path";
import { loadConfig } from "../config/load-config.js";
import { defaultConfig } from "../config/default-config.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import {
  isolatePathEnvForHomeDir,
  resolveExperienceEnginePaths,
  resolveProductStateDir,
  type ResolvedPathInfo
} from "../config/path-resolver.js";
import {
  buildOpenClawInstallCommands,
  buildOpenClawAllowSetCommand,
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
  type OpenClawCommandRunner,
  type OpenClawPluginsConfig
} from "./openclaw-cli.js";
import { buildVersionStatus, readCurrentPackageVersion } from "../version/package-version.js";
import {
  inspectRecordedOpenClawInstallState,
  readPersistedOpenClawInstallState,
  type PersistedOpenClawInstallState
} from "../plugin/openclaw-install-state.js";
import { getOpenClawRuntimeDefaults } from "../plugin/openclaw-runtime-defaults.js";
import type { RuntimeClosureManifest } from "../runtime/identity/types.js";
import type {
  RuntimeInstallOrigin,
  RuntimeInstallSecurityApproval
} from "../runtime/identity/types.js";
import {
  RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH,
  validateRuntimeClosureManifest
} from "../runtime/package/closure-manifest.js";
import {
  digestOpenClawSecurityScanSummary,
  isOpenClawSecurityApprovalRequired,
  normalizeOpenClawSecurityScanSummary
} from "./openclaw-security-approval.js";
import { runNpmCli } from "./npm-cli.js";

export type OpenClawInstallReport = {
  adapter: "openclaw";
  installed: true;
  paths: ResolvedPathInfo;
  packageRoot: string;
  installSource: string;
  installedVersion: string;
  installOrigin: RuntimeInstallOrigin;
  securityApproval: RuntimeInstallSecurityApproval;
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

export type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  runner?: OpenClawCommandRunner;
  packageSourceBuilder?: (packageRoot: string, paths: ResolvedPathInfo) => string;
  approveHostSecurityScan?: boolean;
  installOrigin?: RuntimeInstallOrigin;
  artifactIntegrity?: string;
  registryRecordIdentity?: string | null;
  openClawVersion?: string | null;
  postInstallVerifier?: (input: {
    installPath: string;
    expectedVersion: string;
    runner?: OpenClawCommandRunner;
  }) => void;
  now?: () => Date;
};

export class OpenClawInstallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = "OpenClawInstallError";
  }
}

const readExplicitBooleanEnv = (env: NodeJS.ProcessEnv, key: string): boolean | undefined =>
  env[key] !== undefined ? env[key] === "true" : undefined;

const readExplicitStringEnv = (env: NodeJS.ProcessEnv, key: string): string | undefined =>
  env[key] !== undefined ? env[key] : undefined;

const resolveOpenClawConfigPath = (homeDir?: string): string =>
  join(homeDir ? resolve(homeDir) : resolve(homedir()), ".openclaw", "openclaw.json");

const readOpenClawConfigFile = (homeDir?: string): OpenClawPluginsConfig | null => {
  const configPath = resolveOpenClawConfigPath(homeDir);
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
      plugins?: OpenClawPluginsConfig;
    };
    return parsed.plugins ?? null;
  } catch {
    return null;
  }
};

const writeOpenClawAllowListToConfigFile = (pluginIds: string[], homeDir?: string): boolean => {
  const configPath = resolveOpenClawConfigPath(homeDir);
  if (!existsSync(configPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
      plugins?: OpenClawPluginsConfig;
    };
    parsed.plugins = {
      ...(parsed.plugins ?? {}),
      allow: pluginIds
    };
    writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
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
    return install.installPath && !existsSync(expandHomePath(install.installPath)) ? "install" : "update";
  }

  const normalizedCurrentRoot = packageRoot.trim();
  const normalizedSourcePath = install.sourcePath?.trim();
  if (install.source === "path" || install.installPath || !normalizedSourcePath) {
    return "reinstall";
  }

  return normalizedSourcePath === normalizedCurrentRoot ? "reinstall" : "reinstall";
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

const OPENCLAW_RELATIVE_IMPORT_PATTERN =
  /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g;
const OPENCLAW_DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

const normalizeOpenClawPackagedRuntimePath = (value: string): string => value.replaceAll("\\", "/");

const isOpenClawPackagedRuntimeFile = (relativePath: string): boolean =>
  relativePath.endsWith(".js") || relativePath.endsWith(".json");

const resolveOpenClawPackagedRuntimeImport = (fromFile: string, specifier: string): string | null => {
  const normalizedFromFile = normalizeOpenClawPackagedRuntimePath(fromFile);
  const baseDir = posix.dirname(normalizedFromFile);
  const resolvedPath = normalizeOpenClawPackagedRuntimePath(posix.resolve("/", baseDir, specifier));
  const relativePath = resolvedPath.startsWith("/") ? resolvedPath.slice(1) : resolvedPath;
  return isOpenClawPackagedRuntimeFile(relativePath) ? relativePath : null;
};

const readOpenClawRuntimeClosureManifest = (packageRoot: string): RuntimeClosureManifest => {
  const manifestPath = join(
    packageRoot,
    ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/")
  );
  if (!existsSync(manifestPath)) {
    throw new Error(
      `EE_RUNTIME_CLOSURE_INVALID: generated runtime manifest is missing at ${RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH}`
    );
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as RuntimeClosureManifest;
};

const runtimeClosureAssetPaths = (manifest: RuntimeClosureManifest): string[] =>
  Array.from(new Set([
    ...manifest.required_entrypoints,
    ...manifest.required_runtime_files,
    ...manifest.required_schema_and_migrations
  ].map((asset) => normalizeOpenClawPackagedRuntimePath(asset.path)))).sort();

type OpenClawRuntimeImport = {
  fromFile: string;
  specifier: string;
};

const readOpenClawRuntimeImports = (
  packageRoot: string,
  manifest: RuntimeClosureManifest
): OpenClawRuntimeImport[] => {
  const imports: OpenClawRuntimeImport[] = [];
  for (const currentPath of runtimeClosureAssetPaths(manifest).filter((path) => path.endsWith(".js"))) {
    const sourcePath = join(packageRoot, ...currentPath.split("/"));
    const source = readFileSync(sourcePath, "utf8");
    for (const pattern of [OPENCLAW_RELATIVE_IMPORT_PATTERN, OPENCLAW_DYNAMIC_IMPORT_PATTERN]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier) {
          imports.push({ fromFile: currentPath, specifier });
        }
      }
    }
  }
  return imports;
};

const copyOpenClawRuntimeClosure = (
  packageRoot: string,
  stageDir: string,
  manifest: RuntimeClosureManifest
): void => {
  for (const relativePath of [
    ...runtimeClosureAssetPaths(manifest),
    RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH
  ]) {
    const sourcePath = join(packageRoot, ...relativePath.split("/"));
    if (!existsSync(sourcePath)) {
      throw new Error(`EE_RUNTIME_CLOSURE_INVALID: declared runtime asset is missing: ${relativePath}`);
    }
    const destinationPath = join(stageDir, ...relativePath.split("/"));
    mkdirSync(dirname(destinationPath), { recursive: true });
    cpSync(sourcePath, destinationPath);
  }
};

const assertOpenClawRuntimeImportsDeclared = (
  packageRoot: string,
  manifest: RuntimeClosureManifest
): void => {
  const declared = new Set(runtimeClosureAssetPaths(manifest));
  for (const runtimeImport of readOpenClawRuntimeImports(packageRoot, manifest)) {
    if (!runtimeImport.specifier.startsWith(".")) {
      continue;
    }
    const distRelativeFrom = runtimeImport.fromFile.startsWith("dist/")
      ? runtimeImport.fromFile.slice("dist/".length)
      : runtimeImport.fromFile;
    const resolved = resolveOpenClawPackagedRuntimeImport(distRelativeFrom, runtimeImport.specifier);
    if (!resolved) {
      throw new Error(
        `EE_OPENCLAW_RUNTIME_IMPORT_UNRESOLVED: ${runtimeImport.fromFile} imports ${runtimeImport.specifier}`
      );
    }
    const packageRelative = `dist/${resolved}`;
    if (!declared.has(packageRelative)) {
      throw new Error(
        `EE_OPENCLAW_RUNTIME_IMPORT_UNDECLARED: ${runtimeImport.fromFile} imports ${packageRelative}`
      );
    }
  }
};

const assertOpenClawPackageContainsNoLinks = (packageRoot: string): void => {
  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    const entryPath = join(packageRoot, entry.name);
    const entryStat = lstatSync(entryPath);
    if (entryStat.isSymbolicLink()) {
      throw new Error(`EE_OPENCLAW_PACKAGE_LINK_REJECTED: ${entryPath}`);
    }
    if (entryStat.isDirectory()) {
      assertOpenClawPackageContainsNoLinks(entryPath);
    }
  }
};

const assertOpenClawPackagedDependencies = (
  packageRoot: string,
  manifest: RuntimeClosureManifest
): void => {
  const packageManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    bundledDependencies?: string[];
    experienceengine?: { optionalRuntimeDependencies?: string[] };
  };
  const declaredDependencies = packageManifest.dependencies ?? {};
  const bundledDependencies = new Set(packageManifest.bundledDependencies ?? []);
  const optionalRuntimeDependencies = new Set(
    packageManifest.experienceengine?.optionalRuntimeDependencies ?? []
  );
  for (const dependencyName of Object.keys(declaredDependencies)) {
    if (!bundledDependencies.has(dependencyName)) {
      throw new Error(`EE_OPENCLAW_DEPENDENCY_NOT_BUNDLED: ${dependencyName}`);
    }
    const dependencyManifestPath = join(packageRoot, "node_modules", ...dependencyName.split("/"), "package.json");
    if (!existsSync(dependencyManifestPath)) {
      throw new Error(`EE_OPENCLAW_DEPENDENCY_MISSING: ${dependencyName}`);
    }
  }

  const requireFromPackage = createRequire(join(packageRoot, "package.json"));
  for (const runtimeImport of readOpenClawRuntimeImports(packageRoot, manifest)) {
    if (runtimeImport.specifier.startsWith(".") || isBuiltin(runtimeImport.specifier)) {
      continue;
    }
    const dependencyName = runtimeImport.specifier.startsWith("@")
      ? runtimeImport.specifier.split("/").slice(0, 2).join("/")
      : runtimeImport.specifier.split("/")[0];
    if (dependencyName && optionalRuntimeDependencies.has(dependencyName)) {
      continue;
    }
    try {
      requireFromPackage.resolve(runtimeImport.specifier);
    } catch {
      throw new Error(
        `EE_OPENCLAW_RUNTIME_DEPENDENCY_UNRESOLVED: ${runtimeImport.fromFile} imports ${runtimeImport.specifier}`
      );
    }
  }
};

const assertOpenClawPackageClosure = (
  packageRoot: string,
  manifest?: RuntimeClosureManifest
): void => {
  const validation = validateRuntimeClosureManifest(packageRoot);
  if (!validation.valid) {
    throw new Error(
      `EE_RUNTIME_CLOSURE_INVALID: ${validation.issues.join(", ")}`
    );
  }
  assertOpenClawRuntimeImportsDeclared(
    packageRoot,
    manifest ?? readOpenClawRuntimeClosureManifest(packageRoot)
  );
};

const validateOpenClawTarballClosure = (
  tarballPath: string,
  tempRoot: string
): void => {
  const verboseEntries = execFileSync("tar", ["-tvzf", tarballPath], {
    stdio: "pipe",
    encoding: "utf8"
  });
  const linkedEntry = verboseEntries.split(/\r?\n/).find((entry) => /^[lh]/.test(entry));
  if (linkedEntry) {
    throw new Error(`EE_OPENCLAW_PACKAGE_LINK_REJECTED: ${linkedEntry}`);
  }
  const unpackRoot = join(tempRoot, "final-artifact-validation");
  mkdirSync(unpackRoot, { recursive: true });
  execFileSync("tar", ["-xzf", tarballPath, "-C", unpackRoot], {
    stdio: "pipe",
    encoding: "utf8"
  });
  const packageRoot = join(unpackRoot, "package");
  const runtimeManifest = readOpenClawRuntimeClosureManifest(packageRoot);
  assertOpenClawPackageContainsNoLinks(packageRoot);
  assertOpenClawPackageClosure(packageRoot, runtimeManifest);
  assertOpenClawPackagedDependencies(packageRoot, runtimeManifest);
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

const removeOpenClawReinstallPath = (installPath: string, homeDir?: string): void => {
  const normalizedInstallPath = resolve(expandHomePath(installPath, homeDir));
  rmSync(normalizedInstallPath, { recursive: true, force: true });
};

const removeOpenClawPluginFromAllowList = (
  existingPluginsConfig: ReturnType<typeof readOpenClawPluginsConfig>,
  pluginId: string,
  homeDir?: string,
  runner?: OpenClawCommandRunner
): void => {
  const allowList = existingPluginsConfig?.allow;
  if (!Array.isArray(allowList) || !allowList.includes(pluginId)) {
    return;
  }

  const nextAllowList = allowList.filter((allowedPluginId) => allowedPluginId !== pluginId);
  try {
    runOpenClawCommand(buildOpenClawAllowSetCommand(nextAllowList), runner);
  } catch (error) {
    if (writeOpenClawAllowListToConfigFile(nextAllowList, homeDir)) {
      return;
    }
    throw error;
  }
};

export const createOpenClawInstallTarball = (packageRoot: string, paths: ResolvedPathInfo): string => {
  const tempRoot = mkdtempSync(join(resolveProductStateDir(paths), "openclaw-package-"));
  const stageDir = join(tempRoot, "experienceengine-openclaw");
  mkdirSync(stageDir, { recursive: true });

  const runtimeManifest = readOpenClawRuntimeClosureManifest(packageRoot);
  copyOpenClawRuntimeClosure(packageRoot, stageDir, runtimeManifest);

  const rawPackageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const packagedDependencies = buildOpenClawPackagedDependencies(rawPackageJson);
  const packagedManifest = {
    name: rawPackageJson.name,
    version: rawPackageJson.version,
    type: rawPackageJson.type,
    description: rawPackageJson.description,
    openclaw: rawPackageJson.openclaw,
    engines: rawPackageJson.engines,
    dependencies: packagedDependencies,
    bundledDependencies: Object.keys(packagedDependencies),
    experienceengine: rawPackageJson.experienceengine
  };
  writeFileSync(join(stageDir, "package.json"), `${JSON.stringify(packagedManifest, null, 2)}\n`, "utf8");

  const pluginManifestPath = join(packageRoot, "openclaw.plugin.json");
  if (existsSync(pluginManifestPath)) {
    const pluginManifest = JSON.parse(readFileSync(pluginManifestPath, "utf8")) as Record<string, unknown>;
    pluginManifest.version = rawPackageJson.version;
    writeFileSync(join(stageDir, "openclaw.plugin.json"), `${JSON.stringify(pluginManifest, null, 2)}\n`, "utf8");
  }

  for (const filename of ["README.md", "LICENSE", "LICENSE.md"]) {
    const sourcePath = join(packageRoot, filename);
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, join(stageDir, filename));
    }
  }

  assertOpenClawPackageClosure(stageDir, runtimeManifest);
  runNpmCli([
    "install",
    "--omit=dev",
    "--omit=peer",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--no-bin-links",
    "--prefer-offline",
    "--package-lock=false"
  ], stageDir);
  assertOpenClawPackageContainsNoLinks(stageDir);
  assertOpenClawPackagedDependencies(stageDir, runtimeManifest);

  const output = runNpmCli([
    "pack",
    ".",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    tempRoot
  ], stageDir);
  const packResults = JSON.parse(output) as Array<{ filename?: string }>;
  const tarballName = packResults[0]?.filename;
  if (!tarballName) {
    throw new Error("npm pack did not return an OpenClaw install artifact");
  }
  const finalTarballPath = join(tempRoot, tarballName);
  validateOpenClawTarballClosure(finalTarballPath, tempRoot);
  return finalTarballPath;
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

const readOpenClawPluginsConfig = (runner?: OpenClawCommandRunner, homeDir?: string) => {
  try {
    const pluginsOutput = runOpenClawCommand(buildOpenClawPluginsConfigGetCommand(), runner);
    return parseOpenClawPluginsConfig(pluginsOutput).config;
  } catch {
    return readOpenClawConfigFile(homeDir);
  }
};

const readOpenClawPluginEntryConfig = (runner?: OpenClawCommandRunner) => {
  try {
    const output = runOpenClawCommand(buildOpenClawConfigGetCommand("experienceengine"), runner);
    return parseOpenClawPluginEntryConfig(output).entry?.config ?? null;
  } catch {
    return null;
  }
};

type OpenClawFileSnapshot = {
  path: string;
  existed: boolean;
  content: Buffer | null;
};

const captureFileSnapshot = (path: string): OpenClawFileSnapshot => ({
  path,
  existed: existsSync(path),
  content: existsSync(path) ? readFileSync(path) : null
});

const restoreFileSnapshot = (snapshot: OpenClawFileSnapshot): void => {
  if (!snapshot.existed) {
    rmSync(snapshot.path, { force: true });
    return;
  }
  mkdirSync(dirname(snapshot.path), { recursive: true });
  writeFileSync(snapshot.path, snapshot.content ?? Buffer.alloc(0));
};

type OpenClawInstallDirectoryBackup = {
  installPath: string;
  backupPath: string | null;
  mode: "none" | "copied" | "moved";
};

const backupOpenClawInstallDirectory = (options: {
  installPath: string;
  packageRoot: string;
  transactionRoot: string;
  installAction: OpenClawInstallAction;
  homeDir?: string;
}): OpenClawInstallDirectoryBackup => {
  const installPath = resolve(expandHomePath(options.installPath, options.homeDir));
  if (!existsSync(installPath)) {
    return { installPath, backupPath: null, mode: "none" };
  }
  protectOpenClawReinstallPath(installPath, options.packageRoot, options.homeDir);
  const backupPath = join(options.transactionRoot, "previous-plugin");
  if (options.installAction === "update") {
    cpSync(installPath, backupPath, { recursive: true });
    return { installPath, backupPath, mode: "copied" };
  }
  renameSync(installPath, backupPath);
  return { installPath, backupPath, mode: "moved" };
};

const restoreOpenClawInstallDirectory = (
  backup: OpenClawInstallDirectoryBackup
): void => {
  if (!backup.backupPath || backup.mode === "none") {
    rmSync(backup.installPath, { recursive: true, force: true });
    return;
  }
  rmSync(backup.installPath, { recursive: true, force: true });
  mkdirSync(dirname(backup.installPath), { recursive: true });
  if (backup.mode === "moved") {
    renameSync(backup.backupPath, backup.installPath);
  } else {
    cpSync(backup.backupPath, backup.installPath, { recursive: true });
  }
};

const discardOpenClawInstallDirectoryBackup = (
  backup: OpenClawInstallDirectoryBackup
): void => {
  if (backup.backupPath) {
    rmSync(backup.backupPath, { recursive: true, force: true });
  }
};

const defaultPostInstallVerifier = (input: {
  installPath: string;
  expectedVersion: string;
  runner?: OpenClawCommandRunner;
}): void => {
  const info = parseOpenClawPluginInfo(
    runOpenClawCommand(buildOpenClawInfoCommand("experienceengine"), input.runner)
  );
  if (info.version && info.version !== input.expectedVersion) {
    throw new OpenClawInstallError(
      "EE_OPENCLAW_INSTALLED_VERSION_MISMATCH",
      `OpenClaw installed version ${info.version}, expected ${input.expectedVersion}.`
    );
  }
  const installPath = info.installPath
    ? resolve(expandHomePath(info.installPath))
    : resolve(input.installPath);
  if (!existsSync(installPath)) {
    throw new OpenClawInstallError(
      "EE_OPENCLAW_INSTALLED_CLOSURE_INVALID",
      "OpenClaw did not expose an installed ExperienceEngine directory after installation."
    );
  }
  assertOpenClawPackageClosure(installPath);
};

const probeOpenClawVersion = (
  runner?: OpenClawCommandRunner
): string | null => {
  try {
    const output = runOpenClawCommand({
      bin: "openclaw",
      args: ["--version"],
      description: "Read the exact OpenClaw version for install evidence"
    }, runner).trim();
    return output || null;
  } catch {
    return null;
  }
};

const runOpenClawInstallTransactionCommands = (options: {
  installSource: string;
  installAction: OpenClawInstallAction;
  pluginConfig: OpenClawInstallReport["pluginConfig"];
  approveHostSecurityScan: boolean;
  runner?: OpenClawCommandRunner;
  now: () => Date;
}): {
  commands: OpenClawCommand[];
  securityApproval: RuntimeInstallSecurityApproval;
} => {
  const baseCommands = buildOpenClawInstallCommands(
    options.installSource,
    "experienceengine",
    options.installAction,
    options.pluginConfig
  );
  let scanDigest: string | null = null;
  try {
    runOpenClawCommand(baseCommands[0], options.runner);
  } catch (error) {
    if (!isOpenClawSecurityApprovalRequired(error)) {
      throw error;
    }
    scanDigest = digestOpenClawSecurityScanSummary(error);
    if (!options.approveHostSecurityScan) {
      throw new OpenClawInstallError(
        "EE_OPENCLAW_SECURITY_APPROVAL_REQUIRED",
        "OpenClaw requires explicit approval for the candidate security scan. Re-run with --approve-host-security-scan after reviewing the host findings.",
        {
          scan_summary_digest: scanDigest,
          scan_summary: normalizeOpenClawSecurityScanSummary(error)
        }
      );
    }
    const approvedCommands = buildOpenClawInstallCommands(
      options.installSource,
      "experienceengine",
      options.installAction,
      options.pluginConfig,
      { approveHostSecurityScan: true }
    );
    runOpenClawCommand(approvedCommands[0], options.runner);
    baseCommands[0] = approvedCommands[0];
  }
  for (const command of baseCommands.slice(1)) {
    runOpenClawCommand(command, options.runner);
  }
  return {
    commands: baseCommands,
    securityApproval: scanDigest
      ? {
          scan_status: "approved",
          scan_summary_digest: scanDigest,
          approval_method: "explicit_cli",
          approved_at: options.now().toISOString()
        }
      : {
          scan_status: "not_required",
          scan_summary_digest: null,
          approval_method: null,
          approved_at: null
        }
  };
};

export const installOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport => {
  const env = options.env ?? (options.homeDir ? isolatePathEnvForHomeDir(process.env) : process.env);
  const resolvedConfig = loadConfig({}, { env, homeDir: options.homeDir });
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env,
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

  const existingPluginsConfig = readOpenClawPluginsConfig(options.runner, options.homeDir);
  const expectedInstallPath =
    existingPluginsConfig?.installs?.experienceengine?.installPath ??
    join(dirname(paths.compatibilityHome), "extensions", "experienceengine");
  const installAction = inferOpenClawInstallAction(existingPluginsConfig, packageRoot, expectedInstallPath);
  const installSource = (options.packageSourceBuilder ?? createOpenClawInstallTarball)(packageRoot, paths);
  const runtimeManifest = readOpenClawRuntimeClosureManifest(packageRoot);
  const installOrigin = options.installOrigin ?? "local_pack";
  const registryRecordIdentity = options.registryRecordIdentity ?? null;
  if (
    (installOrigin === "published_npm_attested" ||
      installOrigin === "published_clawhub_attested") &&
    (!options.artifactIntegrity || !registryRecordIdentity)
  ) {
    throw new OpenClawInstallError(
      "EE_OPENCLAW_PUBLISHED_ATTESTATION_REQUIRED",
      "Published install origin requires exact artifact integrity and registry identity."
    );
  }
  const artifactIntegrity = options.artifactIntegrity ??
    `sha256:${runtimeManifest.closure_manifest_digest}`;
  const now = options.now ?? (() => new Date());
  const transactionRoot = mkdtempSync(join(
    resolveProductStateDir(paths),
    "openclaw-install-transaction-"
  ));
  const configSnapshot = captureFileSnapshot(resolveOpenClawConfigPath(options.homeDir));
  const installStateSnapshot = captureFileSnapshot(paths.installStatePath);
  const installDirectoryBackup = backupOpenClawInstallDirectory({
    installPath: expectedInstallPath,
    packageRoot,
    transactionRoot,
    installAction,
    homeDir: options.homeDir
  });
  try {
    const transaction = runOpenClawInstallTransactionCommands({
      installSource,
      installAction,
      pluginConfig,
      approveHostSecurityScan: options.approveHostSecurityScan === true,
      runner: options.runner,
      now
    });
    const verifier = options.postInstallVerifier ??
      (options.runner ? undefined : defaultPostInstallVerifier);
    verifier?.({
      installPath: expectedInstallPath,
      expectedVersion: installedVersion,
      runner: options.runner
    });
    cleanupOpenClawWarningSources(existingPluginsConfig, expectedInstallPath, options.runner);

    const payload: PersistedOpenClawInstallState = {
      adapter: "openclaw",
      installedAt: now().toISOString(),
      installedVersion,
      packageRoot,
      installSource,
      installMode:
        installAction === "update"
          ? "updated-plugin"
          : installAction === "reinstall"
            ? "reinstalled-packaged-plugin"
            : "packaged-plugin",
      installOrigin,
      artifactIntegrity,
      registryRecordIdentity,
      openClawVersion: options.openClawVersion ??
        (options.runner ? null : probeOpenClawVersion(options.runner)),
      securityApproval: transaction.securityApproval,
      hostWiring: {
        wired: true,
        restartRecommended: true
      },
      ...pluginConfig
    };

    mkdirSync(dirname(paths.installStatePath), { recursive: true });
    writeFileSync(paths.installStatePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    discardOpenClawInstallDirectoryBackup(installDirectoryBackup);
    rmSync(transactionRoot, { recursive: true, force: true });

    return {
      adapter: "openclaw",
      installed: true,
      paths,
      packageRoot,
      installSource,
      installedVersion,
      installOrigin,
      securityApproval: transaction.securityApproval,
      hostWiring: {
        wired: true,
        commands: transaction.commands,
        restartRecommended: true
      },
      pluginConfig
    };
  } catch (error) {
    try {
      restoreOpenClawInstallDirectory(installDirectoryBackup);
      restoreFileSnapshot(configSnapshot);
      restoreFileSnapshot(installStateSnapshot);
    } finally {
      rmSync(transactionRoot, { recursive: true, force: true });
    }
    throw error;
  }
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

  const hostRestartSatisfied =
    hostState.status === "loaded" &&
    hostState.enabled !== false &&
    hostState.configMatches &&
    hostState.driftDetected !== true &&
    !hostState.error;

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
    installEvidence: {
      origin: state?.installOrigin ?? null,
      artifactIntegrity: state?.artifactIntegrity ?? null,
      registryRecordIdentity: state?.registryRecordIdentity ?? null,
      openClawVersion: state?.openClawVersion ?? null,
      securityScanStatus: state?.securityApproval?.scan_status ?? null,
      securityScanSummaryDigest:
        state?.securityApproval?.scan_summary_digest ?? null
    },
    hostWiring: {
      wired: state?.hostWiring?.wired ?? false,
      restartRecommended: Boolean(state?.hostWiring?.restartRecommended) && !hostRestartSatisfied
    },
    runtimeDefaults,
    workspace,
    hostState
  };
};

export const repairOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport =>
  installOpenClawAdapter(options);
