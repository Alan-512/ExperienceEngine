import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildCodexAddCommand,
  buildCodexGetCommand,
  buildCodexMcpServerCommand,
  buildCodexRemoveCommand,
  CODEX_EXPERIENCEENGINE_STARTUP_TIMEOUT_SEC,
  defaultCodexCommandRunner,
  ensureCodexMcpServerStartupTimeout,
  removeProjectCodexMcpServerSections,
  parseCodexMcpServerInfo,
  runCodexCommand,
  type CodexCommandRunner,
  type CodexMcpServerInfo
} from "./codex-cli.js";
import {
  buildCodexProjectHookCommand,
  ensureCodexLaunchers,
  ensureCodexProjectHookLauncher,
  resolveCodexLauncherPaths,
  resolveCodexRuntimeTarget,
  type CodexRuntimeTarget
} from "./codex-runtime-target.js";
import {
  inspectCodexProjectHooks,
  repairCodexProjectHooks,
  type CodexHookInspection,
  type CodexHookRepairResult
} from "./codex-hooks.js";
import {
  CODEX_EXPERIENCEENGINE_INSTRUCTION_END,
  CODEX_EXPERIENCEENGINE_INSTRUCTION_START,
  renderCodexExperienceEngineInstruction
} from "../adapters/codex/instruction-template.js";
import {
  resolveExperienceEnginePaths,
  resolveProductStateDir,
  type ResolvedPathInfo
} from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import { resolveDistillationResolution } from "../distillation/host-llm.js";
import { loadConfig } from "../config/load-config.js";
import { buildVersionStatus, readCurrentPackageVersion } from "../version/package-version.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import { resolveScope } from "../input/scope-resolver.js";

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  cliEnv?: NodeJS.ProcessEnv;
  runner?: CodexCommandRunner;
  runtimeTarget?: CodexRuntimeTarget | string;
  cwd?: string;
};

export type CodexInstallReport = {
  adapter: "codex";
  installed: true;
  paths: ResolvedPathInfo;
  packageRoot: string;
  installedVersion: string;
  serverName: string;
  serverCommand: string;
  runtimeTarget: CodexRuntimeTarget;
  launcherPaths: {
    mcpServer: string;
    hook: string;
  };
  hooks: CodexHookRepairResult;
  captureDir: string;
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
  };
  instruction?: {
    path: string;
    state: "present";
  };
  distillationStatus?: {
    distillationMode: "llm" | "rule" | "disabled";
    distillationSource: string;
    provider: string;
    authMode?: string;
    authDiagnostics?: {
      status: string;
      message: string;
    };
    reason: string;
    diagnostics: {
      configured: boolean;
      provider: string;
      model?: string;
      baseUrl: string;
      missingEnv: string[];
      authMode?: string;
      authDiagnostics?: {
        status: string;
        message: string;
      };
    };
  };
};

type CodexInstallState = {
  adapter: "codex";
  installedAt: string;
  installedVersion?: string;
  packageRoot: string;
  serverName: string;
  serverCommand: string;
  runtimeTarget?: CodexRuntimeTarget;
  launcherPaths?: {
    mcpServer?: string;
    hook?: string;
  };
  captureDir: string;
  hostWiring: {
    wired: boolean;
    command?: string;
    transport?: string;
  };
  instruction?: {
    path: string;
  };
  hooks?: CodexHookRepairResult | CodexHookInspection;
};

export type CodexInstructionStatus = {
  path: string;
  present: boolean;
  current: boolean;
  state: "missing" | "present" | "drifted";
};

export type CodexLearningLoopStatus = {
  instructionState: CodexInstructionStatus["state"];
  recentTaskRuns: number;
  state: "tools_only" | "instruction_installed" | "learning_loop_active";
};

export type CodexCliFallbackStatus = {
  command: "ee";
  available: boolean;
  path?: string;
  recommendation?: string;
};

const resolveCodexInstructionPath = (cwd = process.cwd()): string => join(cwd, "AGENTS.md");

const renderManagedInstructionBlock = (): string =>
  [CODEX_EXPERIENCEENGINE_INSTRUCTION_START, renderCodexExperienceEngineInstruction(), CODEX_EXPERIENCEENGINE_INSTRUCTION_END].join(
    "\n"
  );

const upsertManagedInstructionBlock = (path: string): CodexInstructionStatus => {
  const managedBlock = renderManagedInstructionBlock();
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const blockPattern = new RegExp(
    `${CODEX_EXPERIENCEENGINE_INSTRUCTION_START}[\\s\\S]*?${CODEX_EXPERIENCEENGINE_INSTRUCTION_END}`,
    "m"
  );
  const next = existing.match(blockPattern)
    ? existing.replace(blockPattern, managedBlock)
    : existing.trimEnd()
      ? `${existing.trimEnd()}\n\n${managedBlock}\n`
      : `${managedBlock}\n`;

  if (next !== existing) {
    writeFileSync(path, next, "utf8");
  }

  return {
    path,
    present: true,
    current: true,
    state: "present"
  };
};

const inspectManagedInstructionBlock = (path: string): CodexInstructionStatus => {
  if (!existsSync(path)) {
    return {
      path,
      present: false,
      current: false,
      state: "missing"
    };
  }

  const existing = readFileSync(path, "utf8");
  const blockPattern = new RegExp(
    `${CODEX_EXPERIENCEENGINE_INSTRUCTION_START}[\\s\\S]*?${CODEX_EXPERIENCEENGINE_INSTRUCTION_END}`,
    "m"
  );
  const match = existing.match(blockPattern);
  if (!match) {
    return {
      path,
      present: false,
      current: false,
      state: "missing"
    };
  }

  const current = match[0] === renderManagedInstructionBlock();
  return {
    path,
    present: true,
    current,
    state: current ? "present" : "drifted"
  };
};

const inspectCodexLearningLoop = (options: {
  config: ReturnType<typeof loadConfig>;
  cwd?: string;
  instruction: CodexInstructionStatus;
}): CodexLearningLoopStatus => {
  const db = openDatabase(options.config);
  bootstrapDatabase(db);
  const taskRunRepo = new TaskRunRepository(db);
  const scope = resolveScope(options.cwd);
  const recentTaskRuns = taskRunRepo.countByScopeAndHost(scope.scope_id, "codex");
  const state =
    recentTaskRuns > 0
      ? "learning_loop_active"
      : options.instruction.present
        ? "instruction_installed"
        : "tools_only";

  return {
    instructionState: options.instruction.state,
    recentTaskRuns,
    state
  };
};

const inspectCodexHost = (
  runner: CodexCommandRunner,
  cliEnv?: NodeJS.ProcessEnv
): CodexMcpServerInfo | null => {
  try {
    return parseCodexMcpServerInfo(runCodexCommand(buildCodexGetCommand(cliEnv), runner));
  } catch {
    return null;
  }
};

const inspectCliFallback = (env: NodeJS.ProcessEnv = process.env): CodexCliFallbackStatus => {
  const result = spawnSync("sh", ["-c", "command -v ee"], {
    encoding: "utf8",
    env
  });
  const path = result.status === 0 ? result.stdout.trim() : "";

  if (path) {
    return {
      command: "ee",
      available: true,
      path
    };
  }

  return {
    command: "ee",
    available: false,
    recommendation:
      "Codex MCP can still run ExperienceEngine, but CLI fallback commands like `ee inspect --last` need the `ee` binary on PATH or an explicit npx invocation."
  };
};

export const installCodexAdapter = (options: InstallerOptions = {}): CodexInstallReport => {
  const runner = options.runner ?? defaultCodexCommandRunner;
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const installedVersion = readCurrentPackageVersion(packageRoot);
  const runtimeTarget = resolveCodexRuntimeTarget({
    requested: options.runtimeTarget,
    env: options.env ?? process.env
  });
  const launchers = ensureCodexLaunchers({
    productHome: paths.productHome,
    packageRoot
  });
  removeProjectCodexMcpServerSections("experienceengine", {
    cwd: options.cwd
  });
  const existing = inspectCodexHost(runner, options.cliEnv);
  const instructionPath = resolveCodexInstructionPath(options.cwd);
  const projectHookLauncher = ensureCodexProjectHookLauncher({
    cwd: options.cwd ?? process.cwd(),
    packageRoot,
    productHome: paths.productHome
  });
  const hookCommand = projectHookLauncher.command;

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });

  const serverEnv: Array<[string, string]> = [["EXPERIENCE_ENGINE_ADAPTER", "codex"]];

  if (existing?.name === "experienceengine") {
    runCodexCommand(buildCodexRemoveCommand(options.cliEnv), runner);
  }

  runCodexCommand(
    buildCodexAddCommand(packageRoot, paths.productHome, options.cliEnv, serverEnv, runtimeTarget),
    runner
  );
  ensureCodexMcpServerStartupTimeout("experienceengine", CODEX_EXPERIENCEENGINE_STARTUP_TIMEOUT_SEC, {
    homeDir: options.homeDir
  });
  const hooks = repairCodexProjectHooks({
    cwd: options.cwd,
    hookCommand,
    runtimeTarget
  });
  const instruction = upsertManagedInstructionBlock(instructionPath);

  const hostInfo = inspectCodexHost(runner, options.cliEnv);
  const state: CodexInstallState = {
    adapter: "codex",
    installedAt: new Date().toISOString(),
    installedVersion,
    packageRoot,
    serverName: "experienceengine",
    serverCommand:
      hostInfo?.commandDisplay ??
      buildCodexMcpServerCommand(packageRoot, {
        productHome: paths.productHome,
        runtimeTarget,
        env: options.cliEnv
      }).join(" "),
    runtimeTarget,
    launcherPaths: {
      mcpServer: runtimeTarget === "windows" ? launchers.windowsMcpServer : launchers.mcpServer,
      hook: runtimeTarget === "windows" ? launchers.windowsHook : launchers.hook
    },
    captureDir: paths.captureDir,
    hostWiring: {
      wired: Boolean(hostInfo?.commandDisplay),
      command: hostInfo?.commandDisplay,
      transport: hostInfo?.transport
    },
    instruction: {
      path: instruction.path
    },
    hooks
  };

  writeFileSync(paths.installStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  return {
    adapter: "codex",
    installed: true,
    paths,
    packageRoot,
    installedVersion,
    serverName: state.serverName,
    serverCommand: state.serverCommand,
    runtimeTarget,
    launcherPaths: {
      mcpServer: runtimeTarget === "windows" ? launchers.windowsMcpServer : launchers.mcpServer,
      hook: runtimeTarget === "windows" ? launchers.windowsHook : launchers.hook
    },
    hooks,
    captureDir: paths.captureDir,
    hostWiring: state.hostWiring
    ,
    instruction: {
      path: instruction.path,
      state: "present"
    }
  };
};

export const inspectCodexInstall = (options: InstallerOptions = {}) => {
  const runner = options.runner ?? defaultCodexCommandRunner;
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const installState = existsSync(paths.installStatePath)
    ? (JSON.parse(readFileSync(paths.installStatePath, "utf8")) as CodexInstallState)
    : null;
  const packageRoot = resolveExperienceEnginePackageRoot();
  const hostInfo = inspectCodexHost(runner, options.cliEnv);
  const runtimeTarget = resolveCodexRuntimeTarget({
    requested: options.runtimeTarget ?? installState?.runtimeTarget,
    env: options.env ?? process.env
  });
  const launchers = resolveCodexLauncherPaths({
    productHome: paths.productHome
  });
  const hookCommand = buildCodexProjectHookCommand(options.cwd ?? process.cwd());
  const hooks: CodexHookInspection = inspectCodexProjectHooks({
    cwd: options.cwd,
    hookCommand,
    runtimeTarget
  });
  const instructionPath = resolveCodexInstructionPath(options.cwd);
  const instruction = inspectManagedInstructionBlock(instructionPath);
  const config = loadConfig({}, { env: options.env ?? process.env, homeDir: options.homeDir });
  const learningLoop = inspectCodexLearningLoop({
    config,
    cwd: options.cwd,
    instruction
  });
  const cliFallback = inspectCliFallback(options.cliEnv ?? options.env ?? process.env);
  const resolutionEnv: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    EXPERIENCE_ENGINE_ADAPTER: "codex"
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
    adapter: "codex" as const,
    installed: Boolean(installState),
    versionStatus: buildVersionStatus(Boolean(installState), installState?.installedVersion),
    packageRoot,
    captureDir: paths.captureDir,
    serverName: installState?.serverName ?? "experienceengine",
    serverCommand: installState?.serverCommand,
    runtimeTarget,
    launcherPaths: {
      ...installState?.launcherPaths,
      mcpServer:
        installState?.launcherPaths?.mcpServer ??
        (runtimeTarget === "windows" ? launchers.windowsMcpServer : launchers.mcpServer),
      hook:
        installState?.launcherPaths?.hook ??
        (runtimeTarget === "windows" ? launchers.windowsHook : launchers.hook)
    },
    hooks,
    hostWiring: {
      wired: Boolean(hostInfo?.commandDisplay),
      command: hostInfo?.commandDisplay,
      transport: hostInfo?.transport,
      enabled: hostInfo?.enabled ?? false
    },
    cliFallback,
    instruction,
    learningLoop,
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
