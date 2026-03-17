import { installClaudeCodeAdapter } from "../../install/claude-code-installer.js";
import { installCodexAdapter } from "../../install/codex-installer.js";
import { installOpenClawAdapter } from "../../install/openclaw-installer.js";
import {
  buildRegistryRecommendationCommands,
  readRegistryHealth,
  type RegistryHealth
} from "../../install/registry-health.js";

type InstallDeps = {
  installOpenClawAdapter?: typeof installOpenClawAdapter;
  installClaudeCodeAdapter?: typeof installClaudeCodeAdapter;
  installCodexAdapter?: typeof installCodexAdapter;
  readRegistryHealth?: typeof readRegistryHealth;
};

const logRegistryHealth = (health: RegistryHealth): void => {
  if (!health.hasNonOfficialRegistry) {
    return;
  }

  for (const warning of health.warnings) {
    console.log(`[ExperienceEngine] Registry advisory: ${warning}`);
  }

  for (const command of buildRegistryRecommendationCommands(health)) {
    console.log(`[ExperienceEngine] Recommended next step: ${command}`);
  }
};

export const runInstallCommand = (target?: string, deps: InstallDeps = {}): void => {
  const registryHealth = (deps.readRegistryHealth ?? readRegistryHealth)();
  if (target === "openclaw") {
    const report = (deps.installOpenClawAdapter ?? installOpenClawAdapter)();
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Installed version: ${report.installedVersion}`);
    console.log(`Linked package root: ${report.packageRoot}`);
    console.log(`Active data root: ${report.paths.activeHome}`);
    console.log(`SQLite path: ${report.pluginConfig.sqlitePath}`);
    console.log(`Capture path: ${report.pluginConfig.captureDir}`);
    if (report.hostWiring.restartRecommended) {
      console.log("OpenClaw gateway restart recommended.");
    }
    logRegistryHealth(registryHealth);
    return;
  }

  if (target === "claude-code") {
    const report = (deps.installClaudeCodeAdapter ?? installClaudeCodeAdapter)();
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Installed version: ${report.installedVersion}`);
    console.log(`Package root: ${report.packageRoot}`);
    console.log(`Project settings: ${report.settingsPath}`);
    console.log(`Server name: ${report.serverName}`);
    console.log(`Server command: ${report.serverCommand}`);
    console.log(`Capture path: ${report.captureDir}`);
    logRegistryHealth(registryHealth);
    return;
  }

  if (target === "codex") {
    const report = (deps.installCodexAdapter ?? installCodexAdapter)();
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Installed version: ${report.installedVersion}`);
    console.log(`Package root: ${report.packageRoot}`);
    console.log(`Server name: ${report.serverName}`);
    console.log(`Server command: ${report.serverCommand}`);
    console.log(`Capture path: ${report.captureDir}`);
    logRegistryHealth(registryHealth);
    return;
  }

  console.log("Usage: ee install openclaw|claude-code|codex");
};
