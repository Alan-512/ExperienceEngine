import { installClaudeCodeAdapter } from "../../install/claude-code-installer.js";
import { installCodexAdapter } from "../../install/codex-installer.js";
import { installOpenClawAdapter } from "../../install/openclaw-installer.js";
import { buildHostPostInstallOrientation } from "../../install/public-install.js";
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

const readClaudeRuntimeTarget = (args: string[]): string | undefined => {
  const flagIndex = args.findIndex((value) => value === "--runtime-target");
  if (flagIndex >= 0) {
    return args[flagIndex + 1];
  }

  return undefined;
};

const readCodexRuntimeTarget = (args: string[]): string | undefined => {
  const flagIndex = args.findIndex((value) => value === "--runtime-target");
  if (flagIndex >= 0) {
    return args[flagIndex + 1];
  }

  return undefined;
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

const logFirstValueGuidance = (): void => {
  console.log("[ExperienceEngine] Capture is now active for this host.");
  console.log(
    "[ExperienceEngine] First value usually appears after a few similar tasks in the same repo, once repeated evidence is strong enough to promote a formal hint."
  );
};

const logPostInstallOrientation = (host: keyof ReturnType<typeof buildHostPostInstallOrientation>): void => {
  const orientation = buildHostPostInstallOrientation()[host];
  console.log(`[ExperienceEngine] Setup state: ${orientation.setupState}.`);
  console.log(`[ExperienceEngine] Next step: ${orientation.nextStep}`);
};

export const runInstallCommand = (
  target?: string,
  argsOrDeps: string[] | InstallDeps = [],
  maybeDeps: InstallDeps = {}
): void => {
  const args = Array.isArray(argsOrDeps) ? argsOrDeps : [];
  const deps = Array.isArray(argsOrDeps) ? maybeDeps : argsOrDeps;
  const registryHealth = (deps.readRegistryHealth ?? readRegistryHealth)();
  if (target === "openclaw") {
    const report = (deps.installOpenClawAdapter ?? installOpenClawAdapter)();
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Installed version: ${report.installedVersion}`);
    console.log(`Linked package root: ${report.packageRoot}`);
    console.log(`Install source: ${report.installSource}`);
    console.log(`Active data root: ${report.paths.activeHome}`);
    console.log(`SQLite path: ${report.pluginConfig.sqlitePath}`);
    console.log(`Capture path: ${report.pluginConfig.captureDir}`);
    if (report.hostWiring.restartRecommended) {
      console.log("OpenClaw gateway restart recommended.");
    }
    logRegistryHealth(registryHealth);
    logPostInstallOrientation("openclaw");
    logFirstValueGuidance();
    return;
  }

  if (target === "claude-code") {
    const report = (deps.installClaudeCodeAdapter ?? installClaudeCodeAdapter)({
      runtimeTarget: readClaudeRuntimeTarget(args)
    });
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Installed version: ${report.installedVersion}`);
    console.log(`Package root: ${report.packageRoot}`);
    console.log(`Runtime target: ${report.runtimeTarget}`);
    console.log(`Project settings: ${report.settingsPath}`);
    console.log(`Server name: ${report.serverName}`);
    console.log(`Server command: ${report.serverCommand}`);
    console.log(`Capture path: ${report.captureDir}`);
    logRegistryHealth(registryHealth);
    logPostInstallOrientation("claude-code");
    logFirstValueGuidance();
    return;
  }

  if (target === "codex") {
    const report = (deps.installCodexAdapter ?? installCodexAdapter)({
      runtimeTarget: readCodexRuntimeTarget(args)
    });
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Installed version: ${report.installedVersion}`);
    console.log(`Package root: ${report.packageRoot}`);
    console.log(`Runtime target: ${report.runtimeTarget}`);
    console.log(`Server name: ${report.serverName}`);
    console.log(`Server command: ${report.serverCommand}`);
    console.log(`Codex hooks: ${report.hooks.state}`);
    console.log(`Codex hook launcher: ${report.launcherPaths.hook}`);
    console.log(`Capture path: ${report.captureDir}`);
    logRegistryHealth(registryHealth);
    logPostInstallOrientation("codex");
    logFirstValueGuidance();
    return;
  }

  console.log("Usage: ee install openclaw|claude-code|codex [--runtime-target posix|windows]");
};
