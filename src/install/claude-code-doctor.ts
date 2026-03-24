import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import { buildVersionStatus } from "../version/package-version.js";
import { loadConfig } from "../config/load-config.js";
import {
  buildClaudeGetCommand,
  parseClaudeMcpServerInfo,
  runClaudeCommand,
  type ClaudeCommandRunner
} from "./claude-cli.js";
import { resolveDistillationResolution } from "../distillation/host-llm.js";
import {
  buildClaudeHookCommandForTarget,
  ensureClaudeLaunchers,
  resolveClaudeRuntimeTarget,
  type ClaudeRuntimeTarget
} from "./claude-runtime-target.js";

type ClaudeHookMatcher = {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
};

type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookMatcher[]>;
};

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  projectDir?: string;
  cliEnv?: NodeJS.ProcessEnv;
  runner?: ClaudeCommandRunner;
};

type ClaudeInstallState = {
  installedVersion?: string;
  serverName?: string;
  serverCommand?: string;
  runtimeTarget?: ClaudeRuntimeTarget;
  launcherPaths?: {
    hook?: string;
    mcpServer?: string;
  };
  hostWiring?: {
    wired?: boolean;
    command?: string;
    transport?: string;
    scope?: string;
    status?: string;
  };
};

const hasHookCommand = (
  settings: ClaudeSettings | null,
  eventName: string,
  matcher: string | undefined,
  expectedCommand: string
): boolean => {
  const entries = settings?.hooks?.[eventName] ?? [];
  return entries.some(
    (entry) =>
      (entry.matcher ?? undefined) === matcher &&
      (entry.hooks ?? []).some((hook) => hook.type === "command" && hook.command === expectedCommand)
  );
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

export const inspectClaudeCodeInstall = (options: InstallerOptions = {}) => {
  const runner = options.runner ?? ((command) => runClaudeCommand(command)) as ClaudeCommandRunner;
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const settingsPath = join(projectDir, ".claude", "settings.local.json");
  const settings =
    existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, "utf8")) as ClaudeSettings) : null;
  const installState = paths.usedInstallState
    ? (JSON.parse(readFileSync(paths.installStatePath, "utf8")) as ClaudeInstallState)
    : null;
  const runtimeTarget = installState?.runtimeTarget ?? resolveClaudeRuntimeTarget({ env: options.env ?? process.env });
  const launcherPaths = ensureClaudeLaunchers({
    productHome: paths.productHome,
    packageRoot
  });
  const resolvedLauncherPaths = {
    hook: installState?.launcherPaths?.hook ?? (runtimeTarget === "windows" ? launcherPaths.windowsHook : launcherPaths.hook),
    mcpServer:
      installState?.launcherPaths?.mcpServer ??
      (runtimeTarget === "windows" ? launcherPaths.windowsMcpServer : launcherPaths.mcpServer)
  };
  const expectedCommand = buildClaudeHookCommandForTarget(runtimeTarget, launcherPaths);
  const hostInfo = inspectClaudeHost(runner, options.cliEnv);
  const config = loadConfig({}, { env: options.env ?? process.env, homeDir: options.homeDir });
  const resolutionEnv: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    EXPERIENCE_ENGINE_ADAPTER: "claude-code"
  };
  const distillationResolution = resolveDistillationResolution({
    env: resolutionEnv,
    homeDir: options.homeDir,
    configProvider: config.distillerProvider,
    configAuthMode: config.distillationAuthMode,
    configModel: config.distillerModel,
    distillationMode: config.distillationMode,
    allowRuleFallback: config.distillationAllowPassthrough
  });

  return {
    adapter: "claude-code" as const,
    installed: paths.usedInstallState,
    versionStatus: buildVersionStatus(paths.usedInstallState, installState?.installedVersion),
    packageRoot,
    projectDir,
    settingsPath,
    captureDir: paths.captureDir,
    serverName: installState?.serverName ?? "experienceengine",
    runtimeTarget,
    launcherPaths: resolvedLauncherPaths,
    hooksPresent: {
      userPromptSubmit: hasHookCommand(settings, "UserPromptSubmit", undefined, expectedCommand),
      preToolUse: hasHookCommand(settings, "PreToolUse", "*", expectedCommand),
      postToolUse: hasHookCommand(settings, "PostToolUse", "*", expectedCommand),
      postToolUseFailure: hasHookCommand(settings, "PostToolUseFailure", "*", expectedCommand),
      sessionEnd: hasHookCommand(settings, "SessionEnd", undefined, expectedCommand)
    },
    hostWiring: {
      wired: Boolean(hostInfo?.commandDisplay),
      command: hostInfo?.commandDisplay ?? installState?.hostWiring?.command,
      transport: hostInfo?.transport ?? installState?.hostWiring?.transport,
      scope: hostInfo?.scope ?? installState?.hostWiring?.scope,
      status: hostInfo?.status ?? installState?.hostWiring?.status
    },
    distillationStatus: {
      distillationMode: distillationResolution.distillationMode,
      distillationSource: distillationResolution.distillationSource,
      provider: distillationResolution.provider,
      authMode: distillationResolution.diagnostics.authMode,
      authDiagnostics: distillationResolution.diagnostics.authDiagnostics,
      reason: distillationResolution.reason,
      diagnostics: distillationResolution.diagnostics
    },
    hostState: hostInfo
  };
};
