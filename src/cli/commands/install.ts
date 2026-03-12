import { installClaudeCodeAdapter } from "../../install/claude-code-installer.js";
import { installOpenClawAdapter } from "../../install/openclaw-installer.js";

export const runInstallCommand = (target?: string): void => {
  if (target === "openclaw") {
    const report = installOpenClawAdapter();
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Linked package root: ${report.packageRoot}`);
    console.log(`Active data root: ${report.paths.activeHome}`);
    console.log(`SQLite path: ${report.pluginConfig.sqlitePath}`);
    console.log(`Capture path: ${report.pluginConfig.captureDir}`);
    if (report.hostWiring.restartRecommended) {
      console.log("OpenClaw gateway restart recommended.");
    }
    return;
  }

  if (target === "claude-code") {
    const report = installClaudeCodeAdapter();
    console.log(`Installed ${report.adapter} adapter.`);
    console.log(`Package root: ${report.packageRoot}`);
    console.log(`Project settings: ${report.settingsPath}`);
    console.log(`Capture path: ${report.captureDir}`);
    return;
  }

  console.log("Usage: ee install openclaw|claude-code");
};
