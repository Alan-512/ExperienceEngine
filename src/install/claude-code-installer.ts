import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  projectDir?: string;
  cliEnv?: NodeJS.ProcessEnv;
  runner?: ClaudeCommandRunner;
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

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const buildClaudeHookCommand = (packageRoot: string): string =>
  `node --no-warnings ${shellQuote(join(packageRoot, "dist/cli/index.js"))} claude-hook`;

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

const mergeExperienceEngineHooks = (settings: ClaudeSettings, packageRoot: string): ClaudeSettings => {
  const next: ClaudeSettings = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  const command: ClaudeHookCommand = {
    type: "command",
    command: buildClaudeHookCommand(packageRoot),
    timeout: 30
  };

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
  const settings = readJsonFile<ClaudeSettings>(settingsPath) ?? {};
  const mergedSettings = mergeExperienceEngineHooks(settings, packageRoot);
  const existingHost = inspectClaudeHost(runner, options.cliEnv);

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });
  mkdirSync(dirname(settingsPath), { recursive: true });

  writeFileSync(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, "utf8");

  if (existingHost?.name === "experienceengine") {
    runClaudeCommand(buildClaudeRemoveCommand(options.cliEnv), runner);
  }

  runClaudeCommand(buildClaudeAddCommand(packageRoot, paths.productHome, options.cliEnv), runner);
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
