import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  canonicalJson,
  sha256Text
} from "../../../dist/runtime/package/package-generation.js";

export const digest = (value) => sha256Text(canonicalJson(value));

export const sha256File = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

export const writeJson = (path, value, mode = 0o600) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode
  });
};

export const runOpenClawCommand = (command, commandArgs, options = {}) => {
  const started = Date.now();
  const executable = typeof command === "string" ? command : command.executable;
  const prefixArgs = typeof command === "string" ? [] : command.args ?? [];
  if (typeof executable !== "string" || executable.trim().length === 0) {
    throw new TypeError("OpenClaw command requires a non-empty executable path.");
  }
  if (!Array.isArray(prefixArgs) || prefixArgs.some((value) => typeof value !== "string")) {
    throw new TypeError("OpenClaw command prefix args must be strings.");
  }
  const result = spawnSync(executable, [...prefixArgs, ...commandArgs], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 600_000,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    windowsHide: true,
    shell: options.shell ?? false
  });
  return {
    exitCode: result.status ?? (result.error?.code === "ETIMEDOUT" ? 124 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? `${result.error.name}: ${result.error.message}` : ""),
    durationMs: Date.now() - started,
    timedOut: result.error?.code === "ETIMEDOUT"
  };
};

export const findProjectMarkerAncestor = (startPath) => {
  let current = resolve(startPath);
  while (true) {
    for (const marker of [".git", "AGENTS.md", "package.json", "openspec"]) {
      if (existsSync(join(current, marker))) {
        return { directory: current, marker };
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

export const parseOpenClawAgentJson = (stdout) => {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  return null;
};

export const prepareOpenClawHostTemplate = (options) => {
  const sourceConfig = JSON.parse(readFileSync(options.sourceConfigPath, "utf8"));
  const primaryModel = sourceConfig?.agents?.defaults?.model?.primary;
  if (typeof primaryModel !== "string" || primaryModel.length === 0) {
    throw new Error("Source OpenClaw config does not declare agents.defaults.model.primary.");
  }

  const templateState = join(options.runtimeRoot, "template-state");
  const templateAgentDir = join(templateState, "agents", "main", "agent");
  mkdirSync(templateAgentDir, { recursive: true });
  const templateConfig = {
    agents: {
      defaults: {
        model: { primary: primaryModel },
        workspace: join(options.runtimeRoot, "template-workspace")
      }
    },
    session: sourceConfig.session ?? {},
    tools: sourceConfig.tools ?? {},
    models: {
      mode: "merge",
      providers: {
        openrouter: { baseUrl: options.openrouterBaseUrl }
      }
    },
    plugins: {
      allow: [],
      entries: {},
      load: {}
    }
  };
  mkdirSync(templateConfig.agents.defaults.workspace, { recursive: true });
  const templateConfigPath = join(templateState, "openclaw.json");
  writeJson(templateConfigPath, templateConfig, 0o600);
  cpSync(options.sourceAuthPath, join(templateAgentDir, "auth-profiles.json"));

  const commonEnv = {
    ...process.env,
    npm_config_registry: options.npmRegistry,
    NPM_CONFIG_REGISTRY: options.npmRegistry,
    NO_COLOR: "1"
  };
  const templateEnv = {
    ...commonEnv,
    OPENCLAW_STATE_DIR: templateState,
    OPENCLAW_CONFIG_PATH: templateConfigPath
  };
  const doctor = runOpenClawCommand(options.openclawExecutable, [
    "doctor",
    "--non-interactive",
    "--yes",
    "--no-workspace-suggestions"
  ], { env: templateEnv, timeoutMs: 180_000 });
  if (doctor.exitCode !== 0) {
    throw new Error(`OpenClaw auth migration failed: ${doctor.stderr || doctor.stdout}`);
  }

  return {
    primaryModel,
    templateState,
    templateConfigPath,
    commonEnv
  };
};

export const createOpenClawArmRuntimeSet = (options) => Object.fromEntries(
  options.arms.map((arm) => {
    const root = join(options.blockRuntimeRoot, arm);
    const stateDir = join(root, "openclaw-state");
    const workspace = join(root, "workspace");
    const eeHome = join(root, "ee-home");
    const artifactRoot = join(root, "artifacts");
    cpSync(options.templateState, stateDir, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    mkdirSync(artifactRoot, { recursive: true });
    const configPath = join(stateDir, "openclaw.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.agents.defaults.workspace = workspace;
    config.models = {
      mode: "merge",
      providers: { openrouter: { baseUrl: options.openrouterBaseUrl } }
    };
    if (arm === "no_ee") {
      config.plugins = { allow: [], entries: {}, load: {} };
    }
    writeJson(configPath, config, 0o600);
    return [arm, {
      root,
      stateDir,
      configPath,
      workspace,
      eeHome,
      artifactRoot,
      sessionId: options.sessionIdForArm(arm),
      installed: false
    }];
  })
);

export const createOpenClawArmEnv = (options) => {
  const runtime = options.armRuntime[options.arm];
  return {
    ...options.commonEnv,
    OPENCLAW_STATE_DIR: runtime.stateDir,
    OPENCLAW_CONFIG_PATH: runtime.configPath,
    EXPERIENCE_ENGINE_EVALUATION_MODE: options.arm === "forced_holdout" ? "holdout" : "live",
    EXPERIENCE_ENGINE_HOLDOUT_RATE: options.arm === "forced_holdout" ? "1" : "0",
    EXPERIENCE_ENGINE_EMBEDDING_PROVIDER: "legacy",
    EXPERIENCE_ENGINE_TRIGGER_THRESHOLD: String(options.triggerThreshold ?? 0.05),
    EXPERIENCE_ENGINE_MAX_HINTS: String(options.maxHints ?? 1),
    EXPERIENCE_ENGINE_INLINE_NOTICES: "false",
    EXPERIENCE_ENGINE_LOG_LEVEL: "error"
  };
};

export const patchOpenClawArmConfig = (options) => {
  const runtime = options.armRuntime[options.arm];
  const config = JSON.parse(readFileSync(runtime.configPath, "utf8"));
  config.agents.defaults.workspace = runtime.workspace;
  if (options.arm !== "no_ee") {
    const entry = config.plugins?.entries?.experienceengine ?? {};
    config.plugins = config.plugins ?? {};
    config.plugins.entries = config.plugins.entries ?? {};
    config.plugins.entries.experienceengine = {
      ...entry,
      enabled: true,
      config: {
        ...(entry.config ?? {}),
        dataDir: runtime.eeHome,
        sqlitePath: join(runtime.eeHome, "sqlite", "experienceengine.db"),
        captureDir: join(runtime.eeHome, "captures"),
        hybridEnabled: false,
        hybridSyncExplainEnabled: false,
        hybridAsyncPostmortemEnabled: false
      }
    };
  } else {
    config.plugins = { allow: [], entries: {}, load: {} };
  }
  writeJson(runtime.configPath, config, 0o600);
};
