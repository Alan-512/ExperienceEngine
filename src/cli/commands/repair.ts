import { repairOpenClawAdapter } from "../../install/openclaw-installer.js";

export const runRepairCommand = (target?: string): void => {
  if (target !== "openclaw") {
    console.log("Usage: ee repair openclaw");
    return;
  }

  const report = repairOpenClawAdapter();
  console.log(`Repaired ${report.adapter} adapter wiring.`);
  console.log(`Linked package root: ${report.packageRoot}`);
  console.log(`Install source: ${report.installSource}`);
  console.log(`Active data root: ${report.paths.activeHome}`);
  if (report.hostWiring.restartRecommended) {
    console.log("OpenClaw gateway restart recommended.");
  }
};
