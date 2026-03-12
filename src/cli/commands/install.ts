import { installOpenClawAdapter } from "../../install/openclaw-installer.js";

export const runInstallCommand = (target?: string): void => {
  if (target !== "openclaw") {
    console.log("Usage: ee install openclaw");
    return;
  }

  const report = installOpenClawAdapter();
  console.log(`Installed ${report.adapter} adapter.`);
  console.log(`Linked package root: ${report.packageRoot}`);
  console.log(`Active data root: ${report.paths.activeHome}`);
  console.log(`SQLite path: ${report.pluginConfig.sqlitePath}`);
  console.log(`Capture path: ${report.pluginConfig.captureDir}`);
  if (report.hostWiring.restartRecommended) {
    console.log("OpenClaw gateway restart recommended.");
  }
};
