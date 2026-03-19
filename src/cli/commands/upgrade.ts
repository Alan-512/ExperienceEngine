import { inspectClaudeCodeInstall } from "../../install/claude-code-doctor.js";
import { installClaudeCodeAdapter } from "../../install/claude-code-installer.js";
import { inspectCodexInstall, installCodexAdapter } from "../../install/codex-installer.js";
import { inspectOpenClawInstall, installOpenClawAdapter } from "../../install/openclaw-installer.js";

type UpgradeDeps = {
  inspectOpenClawInstall?: typeof inspectOpenClawInstall;
  installOpenClawAdapter?: typeof installOpenClawAdapter;
  inspectClaudeCodeInstall?: typeof inspectClaudeCodeInstall;
  installClaudeCodeAdapter?: typeof installClaudeCodeAdapter;
  inspectCodexInstall?: typeof inspectCodexInstall;
  installCodexAdapter?: typeof installCodexAdapter;
};

const readClaudeRuntimeTarget = (args: string[]): string | undefined => {
  const flagIndex = args.findIndex((value) => value === "--runtime-target");
  if (flagIndex >= 0) {
    return args[flagIndex + 1];
  }

  return undefined;
};

export const runUpgradeCommand = (
  target?: string,
  argsOrDeps: string[] | UpgradeDeps = [],
  maybeDeps: UpgradeDeps = {}
): void => {
  const args = Array.isArray(argsOrDeps) ? argsOrDeps : [];
  const deps = Array.isArray(argsOrDeps) ? maybeDeps : argsOrDeps;
  if (target === "openclaw") {
    const inspect = deps.inspectOpenClawInstall ?? inspectOpenClawInstall;
    const install = deps.installOpenClawAdapter ?? installOpenClawAdapter;
    const before = inspect();
    const report = install();
    console.log(`Upgraded ${report.adapter} adapter.`);
    console.log(`Version: ${before.versionStatus.recordedVersion ?? "unknown"} -> ${report.installedVersion}`);
    console.log(`Linked package root: ${report.packageRoot}`);
    console.log(`Active data root: ${report.paths.activeHome}`);
    if (report.hostWiring.restartRecommended) {
      console.log("OpenClaw gateway restart recommended.");
    }
    return;
  }

  if (target === "claude-code") {
    const inspect = deps.inspectClaudeCodeInstall ?? inspectClaudeCodeInstall;
    const install = deps.installClaudeCodeAdapter ?? installClaudeCodeAdapter;
    const before = inspect();
    const report = install({ runtimeTarget: readClaudeRuntimeTarget(args) });
    console.log(`Upgraded ${report.adapter} adapter.`);
    console.log(`Version: ${before.versionStatus.recordedVersion ?? "unknown"} -> ${report.installedVersion}`);
    console.log(`Runtime target: ${report.runtimeTarget}`);
    console.log(`Project settings: ${report.settingsPath}`);
    console.log("New Claude Code sessions will use the updated hook command.");
    return;
  }

  if (target === "codex") {
    const inspect = deps.inspectCodexInstall ?? inspectCodexInstall;
    const install = deps.installCodexAdapter ?? installCodexAdapter;
    const before = inspect();
    const report = install();
    console.log(`Upgraded ${report.adapter} adapter.`);
    console.log(`Version: ${before.versionStatus.recordedVersion ?? "unknown"} -> ${report.installedVersion}`);
    console.log(`Server name: ${report.serverName}`);
    console.log("New Codex MCP connections will use the updated server command.");
    return;
  }

  console.log("Usage: ee upgrade openclaw|claude-code|codex [--runtime-target posix|windows]");
};
