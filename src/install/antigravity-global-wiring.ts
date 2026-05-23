import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import {
  buildAntigravityHookLauncher,
  buildAntigravityHooksConfig,
  runAntigravityHookSpikeVerification,
  type AntigravityLifecycleMode,
  type AntigravityOptions
} from "./antigravity-project-wiring.js";

export type AntigravityGlobalActivationState = "unsupported" | "supported" | "unknown";

export type AntigravityGlobalWiringReport = {
  lifecycleMode: AntigravityLifecycleMode;
  agentDesktopGlobalActivation: AntigravityGlobalActivationState;
  agentDesktopPluginDir: string;
  agentDesktopPluginRegistered: boolean;
  agyCliPluginDir: string;
  agyCliPluginRegistered: boolean;
  mcpConfigPath: string;
  mcpRegistered: boolean;
  hooksRegistered: boolean;
  hookContractSpikePassed: boolean;
  serverName: string;
  serverCommand: string;
};

const resolveAntigravityHome = (homeDir?: string): string => resolve(homeDir ?? homedir());

const getAgentDesktopPluginDir = (homeDir?: string): string =>
  join(resolveAntigravityHome(homeDir), ".gemini", "config", "plugins", "experienceengine");

const getAgyCliPluginDir = (homeDir?: string): string =>
  join(resolveAntigravityHome(homeDir), ".gemini", "antigravity-cli", "plugins", "experienceengine");

const getAgentDesktopMcpConfigPath = (homeDir?: string): string =>
  join(resolveAntigravityHome(homeDir), ".gemini", "antigravity", "mcp_config.json");

const getSharedMcpConfigPath = (homeDir?: string): string =>
  join(resolveAntigravityHome(homeDir), ".gemini", "config", "mcp_config.json");

const readJsonObject = (path: string): any => {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const text = readFileSync(path, "utf8").trim();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const buildServerConfig = (cliScript: string): Record<string, unknown> => ({
  command: "node",
  args: [cliScript, "mcp-server"],
  env: {
    EXPERIENCE_ENGINE_ADAPTER: "antigravity"
  }
});

const writePlugin = (pluginDir: string, cliScript: string, productHome: string): void => {
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    join(pluginDir, "plugin.json"),
    `${JSON.stringify(
      {
        name: "experienceengine",
        description: "ExperienceEngine lifecycle hooks and MCP server for Antigravity.",
        disabled: false
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  writeFileSync(
    join(pluginDir, "mcp_config.json"),
    `${JSON.stringify({ mcpServers: { experienceengine: buildServerConfig(cliScript) } }, null, 2)}\n`,
    "utf8"
  );

  const launcherPath = join(pluginDir, "experienceengine-antigravity-hook.mjs");
  writeFileSync(
    launcherPath,
    buildAntigravityHookLauncher(cliScript, productHome.replace(/\\/g, "/")),
    "utf8"
  );

  const hookCommand = "node experienceengine-antigravity-hook.mjs";
  writeFileSync(
    join(pluginDir, "hooks.json"),
    `${JSON.stringify(buildAntigravityHooksConfig(hookCommand), null, 2)}\n`,
    "utf8"
  );
};

const upsertAgentDesktopMcpConfig = (mcpConfigPath: string, cliScript: string): void => {
  mkdirSync(dirname(mcpConfigPath), { recursive: true });
  const config = readJsonObject(mcpConfigPath);
  config.mcpServers = {
    ...(config.mcpServers ?? {}),
    experienceengine: buildServerConfig(cliScript)
  };
  writeFileSync(mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
};

const pluginHasExperienceEngine = (pluginDir: string): boolean => {
  const pluginPath = join(pluginDir, "plugin.json");
  const hooksPath = join(pluginDir, "hooks.json");
  const mcpPath = join(pluginDir, "mcp_config.json");
  if (!existsSync(pluginPath) || !existsSync(hooksPath) || !existsSync(mcpPath)) {
    return false;
  }

  const plugin = readJsonObject(pluginPath);
  const hooks = readJsonObject(hooksPath);
  const mcp = readJsonObject(mcpPath);
  return Boolean(
    plugin.name === "experienceengine"
      && plugin.disabled !== true
      && hooks.experienceengine?.PreInvocation?.length
      && hooks.experienceengine?.PreToolUse?.length
      && hooks.experienceengine?.PostToolUse?.length
      && hooks.experienceengine?.Stop?.length
      && mcp.mcpServers?.experienceengine
  );
};

const mcpConfigHasExperienceEngine = (mcpConfigPath: string): boolean => {
  const config = readJsonObject(mcpConfigPath);
  return Boolean(config.mcpServers?.experienceengine);
};

export const inspectAntigravityGlobalWiring = (options: AntigravityOptions = {}): AntigravityGlobalWiringReport => {
  const packageRoot = resolveExperienceEnginePackageRoot();
  const cliScript = join(packageRoot, "dist/cli/index.js").replace(/\\/g, "/");
  const agentDesktopPluginDir = getAgentDesktopPluginDir(options.homeDir);
  const agyCliPluginDir = getAgyCliPluginDir(options.homeDir);
  const mcpConfigPath = getAgentDesktopMcpConfigPath(options.homeDir);
  const agentDesktopPluginRegistered = pluginHasExperienceEngine(agentDesktopPluginDir);
  const agyCliPluginRegistered = pluginHasExperienceEngine(agyCliPluginDir);
  const sharedMcpConfigPath = getSharedMcpConfigPath(options.homeDir);
  const mcpRegistered =
    mcpConfigHasExperienceEngine(mcpConfigPath)
    || mcpConfigHasExperienceEngine(sharedMcpConfigPath)
    || agentDesktopPluginRegistered
    || agyCliPluginRegistered;
  const hooksRegistered = agentDesktopPluginRegistered && agyCliPluginRegistered;
  const lifecycleMode: AntigravityLifecycleMode = hooksRegistered ? "host_native_hooks_validated" : "mcp_only";

  return {
    lifecycleMode,
    agentDesktopGlobalActivation: hooksRegistered ? "supported" : "unknown",
    agentDesktopPluginDir,
    agentDesktopPluginRegistered,
    agyCliPluginDir,
    agyCliPluginRegistered,
    mcpConfigPath,
    mcpRegistered,
    hooksRegistered,
    hookContractSpikePassed: hooksRegistered,
    serverName: "experienceengine",
    serverCommand: `node ${cliScript} mcp-server`
  };
};

export const ensureAntigravityGlobalWiring = async (
  options: AntigravityOptions = {}
): Promise<AntigravityGlobalWiringReport> => {
  const paths = resolveExperienceEnginePaths({
    adapter: "antigravity",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const cliScript = join(packageRoot, "dist/cli/index.js").replace(/\\/g, "/");
  let mcpOnly = options.mcpOnly ?? false;
  let hookContractSpikePassed = false;

  if (!mcpOnly) {
    const spike = await runAntigravityHookSpikeVerification();
    if (spike.success) {
      hookContractSpikePassed = true;
    } else {
      mcpOnly = true;
      console.warn("[ExperienceEngine] Antigravity native hook spike verification failed. Falling back to global mcp_only mode.");
      for (const err of spike.errors) {
        console.warn(`  - ${err}`);
      }
    }
  }

  const mcpConfigPath = getAgentDesktopMcpConfigPath(options.homeDir);
  upsertAgentDesktopMcpConfig(mcpConfigPath, cliScript);
  upsertAgentDesktopMcpConfig(getSharedMcpConfigPath(options.homeDir), cliScript);

  if (!mcpOnly) {
    writePlugin(getAgentDesktopPluginDir(options.homeDir), cliScript, paths.productHome);
    writePlugin(getAgyCliPluginDir(options.homeDir), cliScript, paths.productHome);
  }

  return {
    ...inspectAntigravityGlobalWiring(options),
    hookContractSpikePassed,
    lifecycleMode: mcpOnly ? "mcp_only" : "host_native_hooks_validated",
    agentDesktopGlobalActivation: mcpOnly ? "unknown" : "supported",
    hooksRegistered: !mcpOnly,
    mcpRegistered: true
  };
};
