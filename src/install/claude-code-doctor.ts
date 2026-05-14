import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import { buildVersionStatus } from "../version/package-version.js";
import { loadConfig } from "../config/load-config.js";
import {
  buildClaudeGetCommand,
  parseClaudeMcpServerInfo,
  runClaudeCommand,
  type ClaudeMcpServerInfo,
  type ClaudeCommandRunner
} from "./claude-cli.js";
import {
  extractClaudeHostEnvValue,
  readClaudeMarketplaceRuntimeState,
  type ClaudeMarketplaceRuntimeState
} from "./claude-marketplace-state.js";
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

type ClaudeGlobalSettings = {
  enabledPlugins?: Record<string, boolean>;
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

type ClaudeHookSource = "project-local" | "marketplace" | "missing";
const CLAUDE_MARKETPLACE_HOOK_SOURCE = "EXPERIENCE_ENGINE_CLAUDE_HOOK_SOURCE=marketplace";

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
      (entry.hooks ?? []).some(
        (hook) =>
          hook.type === "command" &&
          (hook.command === expectedCommand ||
            Boolean(hook.command?.includes("dist/cli/index.js") && hook.command.includes("claude-hook")))
      )
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

const readClaudeGlobalSettings = (homeDir?: string): ClaudeGlobalSettings | null => {
  const path = join(resolve(homeDir ?? homedir()), ".claude", "settings.json");
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8")) as ClaudeGlobalSettings;
};

const isMarketplaceManagedClaudeHost = (hostInfo: ClaudeMcpServerInfo | null): boolean => {
  if (hostInfo?.env?.includes(CLAUDE_MARKETPLACE_HOOK_SOURCE)) {
    return true;
  }

  const commandDisplay = hostInfo?.commandDisplay?.replace(/\\/g, "/") ?? "";
  return commandDisplay.includes("/node_modules/@alan512/experienceengine/dist/cli/index.js mcp-server");
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
  const expectedCommand = buildClaudeHookCommandForTarget(runtimeTarget, {
    hook: resolvedLauncherPaths.hook,
    mcpServer: resolvedLauncherPaths.mcpServer,
    windowsHook: resolvedLauncherPaths.hook,
    windowsMcpServer: resolvedLauncherPaths.mcpServer
  });
  const hostInfo = inspectClaudeHost(runner, options.cliEnv);
  const marketplaceHome = extractClaudeHostEnvValue(hostInfo?.env, "EXPERIENCE_ENGINE_HOME");
  const marketplaceState = readClaudeMarketplaceRuntimeState(marketplaceHome);
  const globalSettings = readClaudeGlobalSettings(options.homeDir);
  const marketplacePluginEnabled = globalSettings?.enabledPlugins?.["experienceengine@experienceengine"] === true;
  const hooksPresent = {
    userPromptSubmit: hasHookCommand(settings, "UserPromptSubmit", undefined, expectedCommand),
    preToolUse: hasHookCommand(settings, "PreToolUse", "*", expectedCommand),
    postToolUse: hasHookCommand(settings, "PostToolUse", "*", expectedCommand),
    postToolUseFailure: hasHookCommand(settings, "PostToolUseFailure", "*", expectedCommand),
    sessionEnd: hasHookCommand(settings, "SessionEnd", undefined, expectedCommand)
  };
  const hasLocalManagedHooks =
    hooksPresent.userPromptSubmit &&
    hooksPresent.preToolUse &&
    hooksPresent.postToolUse &&
    hooksPresent.postToolUseFailure &&
    hooksPresent.sessionEnd;
  const marketplaceManaged =
    isMarketplaceManagedClaudeHost(hostInfo) ||
    (marketplacePluginEnabled && marketplaceState?.install_mode === "marketplace");
  const duplicateHookSources = hasLocalManagedHooks && marketplaceManaged;
  const hookSource: ClaudeHookSource = hasLocalManagedHooks
    ? "project-local"
    : marketplaceManaged
      ? "marketplace"
      : "missing";
  const interactionReady = duplicateHookSources
    ? false
    : hasLocalManagedHooks ||
      Boolean(marketplaceState?.last_hook_seen_at || marketplaceState?.last_mcp_seen_at) ||
      (Boolean(hostInfo?.commandDisplay) && hookSource !== "missing");
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
    installed: paths.usedInstallState || interactionReady,
    versionStatus: buildVersionStatus(paths.usedInstallState || interactionReady, installState?.installedVersion),
    packageRoot,
    projectDir,
    settingsPath,
    captureDir: paths.captureDir,
    serverName: installState?.serverName ?? "experienceengine",
    runtimeTarget,
    launcherPaths: resolvedLauncherPaths,
    hooksPresent,
    hookSource,
    duplicateHookSources,
    interactionReady,
    marketplaceState: marketplaceState as ClaudeMarketplaceRuntimeState | null,
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
