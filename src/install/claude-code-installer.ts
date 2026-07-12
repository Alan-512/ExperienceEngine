import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "../config/load-config.js";
import {
  isolatePathEnvForHomeDir,
  resolveExperienceEnginePaths,
  resolveProductStateDir,
  type ResolvedPathInfo
} from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import {
  buildClaudeAddCommand,
  buildClaudeGetCommand,
  buildClaudeRemoveCommand,
  parseClaudeMcpServerInfo,
  runClaudeCommand,
  type ClaudeCommandRunner
} from "./claude-cli.js";
import { readCurrentPackageVersion } from "../version/package-version.js";
import {
  buildClaudeHookCommandForTarget,
  buildCrossRuntimeClaudeHookCommand,
  ensureClaudeLaunchers,
  resolveClaudeRuntimeTarget,
  type ClaudeRuntimeTarget
} from "./claude-runtime-target.js";
import { setHybridSettings } from "../config/settings-store.js";
import {
  buildEnvWithRecordedExperienceHome,
  describeExperienceHomeResolution,
  extractEnvValue,
  type ExperienceHomeResolution
} from "./experience-home.js";

type ClaudeHookCommand = {
  type: "command";
  command: string;
  timeout?: number;
};

type ClaudeHookMatcher = {
  matcher?: string;
  hooks: ClaudeHookCommand[];
};

type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookMatcher[]>;
  [key: string]: unknown;
};

type ClaudeGlobalSettings = {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
};

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  projectDir?: string;
  cliEnv?: NodeJS.ProcessEnv;
  runner?: ClaudeCommandRunner;
  runtimeTarget?: ClaudeRuntimeTarget | string;
};

export type ClaudeCodeInstallReport = {
  adapter: "claude-code";
  installed: true;
  paths: ResolvedPathInfo;
  packageRoot: string;
  installedVersion: string;
  projectDir: string;
  settingsPath: string;
  captureDir: string;
  serverName: string;
  serverCommand: string;
  runtimeTarget: ClaudeRuntimeTarget;
  launcherPaths: {
    hook: string;
    mcpServer: string;
  };
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
    scope?: string;
    status?: string;
  };
  homeResolution?: ExperienceHomeResolution;
};

const readJsonFile = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf8").trim();
    if (!content) {
      return null;
    }
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

const readClaudeGlobalSettings = (homeDir?: string): { path: string; settings: ClaudeGlobalSettings } => {
  const root = resolve(homeDir ?? homedir());
  const path = join(root, ".claude", "settings.json");
  return {
    path,
    settings: readJsonFile<ClaudeGlobalSettings>(path) ?? {}
  };
};

const disableMarketplaceExperienceEnginePlugin = (settings: ClaudeGlobalSettings): ClaudeGlobalSettings => {
  const enabledPlugins = { ...(settings.enabledPlugins ?? {}) };
  if (enabledPlugins["experienceengine@experienceengine"] !== true) {
    return settings;
  }

  enabledPlugins["experienceengine@experienceengine"] = false;
  return {
    ...settings,
    enabledPlugins
  };
};

const isExperienceEngineHookCommand = (command: ClaudeHookCommand): boolean =>
  command.type === "command" &&
  (command.command.includes("experienceengine-claude-hook") ||
    (command.command.includes("dist/cli/index.js") && command.command.includes("claude-hook")));

const removeStaleExperienceEngineHooks = (
  hooks: Record<string, ClaudeHookMatcher[]>,
  eventName: string,
  matcher: string | undefined
): void => {
  const entries = hooks[eventName] ?? [];
  hooks[eventName] = entries
    .map((entry) => {
      if ((entry.matcher ?? "") !== (matcher ?? "")) {
        return entry;
      }

      return {
        ...entry,
        hooks: entry.hooks.filter((hook) => !isExperienceEngineHookCommand(hook))
      };
    })
    .filter((entry) => entry.hooks.length > 0);
};

const upsertHookMatcher = (
  hooks: Record<string, ClaudeHookMatcher[]>,
  eventName: string,
  matcher: string | undefined,
  command: ClaudeHookCommand
): void => {
  const entries = hooks[eventName] ?? [];
  const existing = entries.find((entry) => (entry.matcher ?? "") === (matcher ?? ""));

  if (existing) {
    if (!existing.hooks.some((hook) => hook.type === command.type && hook.command === command.command)) {
      existing.hooks.push(command);
    }
  } else {
    entries.push({
      ...(matcher ? { matcher } : {}),
      hooks: [command]
    });
  }

  hooks[eventName] = entries;
};

const mergeExperienceEngineHooks = (
  settings: ClaudeSettings,
  hookCommand: string
): ClaudeSettings => {
  const next: ClaudeSettings = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  const command: ClaudeHookCommand = {
    type: "command",
    command: hookCommand,
    timeout: 30
  };
  const sessionEndCommand: ClaudeHookCommand = {
    ...command,
    timeout: 120
  };

  removeStaleExperienceEngineHooks(next.hooks!, "UserPromptSubmit", undefined);
  removeStaleExperienceEngineHooks(next.hooks!, "PreToolUse", "*");
  removeStaleExperienceEngineHooks(next.hooks!, "PostToolUse", "*");
  removeStaleExperienceEngineHooks(next.hooks!, "PostToolUseFailure", "*");
  removeStaleExperienceEngineHooks(next.hooks!, "SessionEnd", undefined);

  upsertHookMatcher(next.hooks!, "UserPromptSubmit", undefined, command);
  upsertHookMatcher(next.hooks!, "PreToolUse", "*", command);
  upsertHookMatcher(next.hooks!, "PostToolUse", "*", command);
  upsertHookMatcher(next.hooks!, "PostToolUseFailure", "*", command);
  upsertHookMatcher(next.hooks!, "SessionEnd", undefined, sessionEndCommand);

  return next;
};

const inspectClaudeHost = (
  runner: ClaudeCommandRunner,
  cliEnv?: NodeJS.ProcessEnv
) => {
  try {
    return parseClaudeMcpServerInfo(runClaudeCommand(buildClaudeGetCommand(cliEnv), runner));
  } catch {
    return null;
  }
};

const extractClaudeHostHome = (hostInfo: ReturnType<typeof inspectClaudeHost>): string | undefined =>
  extractEnvValue(hostInfo?.env, "EXPERIENCE_ENGINE_HOME");

export const installClaudeCodeAdapter = (options: InstallerOptions = {}): ClaudeCodeInstallReport => {
  const runner = options.runner ?? ((command) => runClaudeCommand(command)) as ClaudeCommandRunner;
  const baseEnv = options.env ?? (
    options.homeDir ? isolatePathEnvForHomeDir(process.env) : process.env
  );
  const existingHost = inspectClaudeHost(runner, options.cliEnv);
  const hostHome = extractClaudeHostHome(existingHost);
  const env = buildEnvWithRecordedExperienceHome(baseEnv, hostHome);
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const installedVersion = readCurrentPackageVersion(packageRoot);
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const settingsPath = readClaudeGlobalSettings(options.homeDir).path;
  const runtimeTarget = resolveClaudeRuntimeTarget({
    requested: options.runtimeTarget,
    env
  });
  const launcherPaths = ensureClaudeLaunchers({
    productHome: paths.productHome,
    packageRoot
  });
  const hookCommand = buildCrossRuntimeClaudeHookCommand({
    packageRoot,
    productHome: paths.productHome
  });
  const settings = readJsonFile<ClaudeSettings>(settingsPath) ?? {};
  const disabledMarketplaceSettings = disableMarketplaceExperienceEnginePlugin(settings as ClaudeGlobalSettings);
  const mergedSettings = mergeExperienceEngineHooks(disabledMarketplaceSettings as ClaudeSettings, hookCommand);
  const effectiveConfig = loadConfig({}, { env, homeDir: options.homeDir });
  const defaultPaths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: { ...baseEnv, EXPERIENCE_ENGINE_HOME: undefined },
    homeDir: options.homeDir
  });
  const homeResolution = describeExperienceHomeResolution(baseEnv, paths.productHome, defaultPaths.productHome, hostHome);

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });
  mkdirSync(dirname(settingsPath), { recursive: true });

  // Clean up project-local .claude/settings.local.json
  const localSettingsPath = join(projectDir, ".claude", "settings.local.json");
  if (existsSync(localSettingsPath)) {
    try {
      const localSettings = readJsonFile<ClaudeSettings>(localSettingsPath);
      if (localSettings && localSettings.hooks) {
        removeStaleExperienceEngineHooks(localSettings.hooks, "UserPromptSubmit", undefined);
        removeStaleExperienceEngineHooks(localSettings.hooks, "PreToolUse", "*");
        removeStaleExperienceEngineHooks(localSettings.hooks, "PostToolUse", "*");
        removeStaleExperienceEngineHooks(localSettings.hooks, "PostToolUseFailure", "*");
        removeStaleExperienceEngineHooks(localSettings.hooks, "SessionEnd", undefined);
        const hasAnyHooks = Object.values(localSettings.hooks).some((entry) => entry.length > 0);
        if (!hasAnyHooks) {
          delete localSettings.hooks;
        }
      }
      if (localSettings && Object.keys(localSettings).length === 0) {
        unlinkSync(localSettingsPath);
      } else if (localSettings) {
        writeFileSync(localSettingsPath, `${JSON.stringify(localSettings, null, 2)}\n`, "utf8");
      }
    } catch {
      // Safe fallback
    }
  }

  // Clean up project-local .mcp.json
  const localMcpPath = join(projectDir, ".mcp.json");
  if (existsSync(localMcpPath) && projectDir !== packageRoot) {
    try {
      const localMcp = readJsonFile<any>(localMcpPath);
      if (localMcp && localMcp.mcpServers) {
        delete localMcp.mcpServers.experienceengine;
        if (Object.keys(localMcp.mcpServers).length === 0) {
          delete localMcp.mcpServers;
        }
      }
      if (localMcp && Object.keys(localMcp).length === 0) {
        unlinkSync(localMcpPath);
      } else if (localMcp) {
        writeFileSync(localMcpPath, `${JSON.stringify(localMcp, null, 2)}\n`, "utf8");
      }
    } catch {
      // Safe fallback
    }
  }

  setHybridSettings(
    {
      enabled: effectiveConfig.hybridEnabled,
      sync_explain_enabled: effectiveConfig.hybridSyncExplainEnabled,
      async_postmortem_enabled: effectiveConfig.hybridAsyncPostmortemEnabled,
      rollout_mode: effectiveConfig.hybridRolloutMode,
      canary_rate: effectiveConfig.hybridCanaryRate,
      kill_switch: effectiveConfig.hybridKillSwitch,
      route_policy_version: effectiveConfig.hybridRoutePolicyVersion,
      capsule_schema_version: effectiveConfig.hybridCapsuleSchemaVersion,
      explain_profile_version: effectiveConfig.hybridExplainDecisionProfileVersion,
      postmortem_profile_version: effectiveConfig.hybridPostmortemReviewProfileVersion,
      explain_llm_enabled: effectiveConfig.hybridExplainLlmEnabled,
      explain_provider_mode: effectiveConfig.hybridExplainProviderMode,
      explain_model_profile_version: effectiveConfig.hybridExplainModelProfileVersion,
      async_postmortem_llm_enabled: effectiveConfig.hybridAsyncPostmortemLlmEnabled,
      postmortem_provider_mode: effectiveConfig.hybridPostmortemProviderMode,
      postmortem_model_profile_version: effectiveConfig.hybridPostmortemModelProfileVersion
    },
    { env, homeDir: options.homeDir }
  );
  writeFileSync(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, "utf8");

  if (existingHost?.name === "experienceengine") {
    runClaudeCommand(buildClaudeRemoveCommand(options.cliEnv), runner);
  }

  runClaudeCommand(buildClaudeAddCommand(packageRoot, paths.productHome, options.cliEnv, runtimeTarget), runner);
  const hostInfo = inspectClaudeHost(runner, options.cliEnv);

  writeFileSync(
    paths.installStatePath,
    `${JSON.stringify(
      {
        adapter: "claude-code",
        installedAt: new Date().toISOString(),
        installedVersion,
        packageRoot,
        projectDir,
        settingsPath,
        captureDir: paths.captureDir,
        serverName: "experienceengine",
        runtimeTarget,
        launcherPaths: {
          hook: runtimeTarget === "windows" ? launcherPaths.windowsHook : launcherPaths.hook,
          mcpServer: runtimeTarget === "windows" ? launcherPaths.windowsMcpServer : launcherPaths.mcpServer
        },
        serverCommand: hostInfo?.commandDisplay,
        hostWiring: {
          wired: Boolean(hostInfo?.commandDisplay),
          command: hostInfo?.commandDisplay,
          transport: hostInfo?.transport,
          scope: hostInfo?.scope,
          status: hostInfo?.status
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    adapter: "claude-code",
    installed: true,
    paths,
    packageRoot,
    installedVersion,
    projectDir,
    settingsPath,
    captureDir: paths.captureDir,
    serverName: "experienceengine",
    runtimeTarget,
    launcherPaths: {
      hook: runtimeTarget === "windows" ? launcherPaths.windowsHook : launcherPaths.hook,
      mcpServer: runtimeTarget === "windows" ? launcherPaths.windowsMcpServer : launcherPaths.mcpServer
    },
    serverCommand: hostInfo?.commandDisplay ?? "",
    hostWiring: {
      wired: Boolean(hostInfo?.commandDisplay),
      command: hostInfo?.commandDisplay,
      transport: hostInfo?.transport,
      scope: hostInfo?.scope,
      status: hostInfo?.status
    },
    homeResolution
  };
};
