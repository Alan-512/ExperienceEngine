import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
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
  ensureClaudeLaunchers,
  resolveClaudeRuntimeTarget,
  type ClaudeRuntimeTarget
} from "./claude-runtime-target.js";

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
};

const readJsonFile = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
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

  removeStaleExperienceEngineHooks(next.hooks!, "UserPromptSubmit", undefined);
  removeStaleExperienceEngineHooks(next.hooks!, "PreToolUse", "*");
  removeStaleExperienceEngineHooks(next.hooks!, "PostToolUse", "*");
  removeStaleExperienceEngineHooks(next.hooks!, "PostToolUseFailure", "*");
  removeStaleExperienceEngineHooks(next.hooks!, "SessionEnd", undefined);

  upsertHookMatcher(next.hooks!, "UserPromptSubmit", undefined, command);
  upsertHookMatcher(next.hooks!, "PreToolUse", "*", command);
  upsertHookMatcher(next.hooks!, "PostToolUse", "*", command);
  upsertHookMatcher(next.hooks!, "PostToolUseFailure", "*", command);
  upsertHookMatcher(next.hooks!, "SessionEnd", undefined, command);

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

export const installClaudeCodeAdapter = (options: InstallerOptions = {}): ClaudeCodeInstallReport => {
  const runner = options.runner ?? ((command) => runClaudeCommand(command)) as ClaudeCommandRunner;
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const installedVersion = readCurrentPackageVersion(packageRoot);
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const settingsPath = join(projectDir, ".claude", "settings.local.json");
  const runtimeTarget = resolveClaudeRuntimeTarget({
    requested: options.runtimeTarget,
    env: options.env ?? process.env
  });
  const launcherPaths = ensureClaudeLaunchers({
    productHome: paths.productHome,
    packageRoot
  });
  const hookCommand = buildClaudeHookCommandForTarget(runtimeTarget, launcherPaths);
  const settings = readJsonFile<ClaudeSettings>(settingsPath) ?? {};
  const mergedSettings = mergeExperienceEngineHooks(settings, hookCommand);
  const globalSettings = disableMarketplaceExperienceEnginePlugin(readClaudeGlobalSettings(options.homeDir).settings);
  const globalSettingsPath = readClaudeGlobalSettings(options.homeDir).path;
  const existingHost = inspectClaudeHost(runner, options.cliEnv);

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });
  mkdirSync(dirname(settingsPath), { recursive: true });
  mkdirSync(dirname(globalSettingsPath), { recursive: true });

  writeFileSync(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, "utf8");
  writeFileSync(globalSettingsPath, `${JSON.stringify(globalSettings, null, 2)}\n`, "utf8");

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
    }
  };
};
