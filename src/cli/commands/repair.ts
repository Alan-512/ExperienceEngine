import { repairOpenClawAdapter } from "../../install/openclaw-installer.js";

export const runRepairCommand = (target?: string): void => {
  if (!target) {
    console.log("Repair summary:");
    console.log("- OpenClaw: automated repair is available with `ee repair openclaw` when doctor reports host drift.");
    console.log("- Codex: re-run `ee install codex` if MCP wiring is missing or stale.");
    console.log("- Claude Code: re-run the marketplace install flow if hooks or MCP wiring are missing.");
    return;
  }

  if (target !== "openclaw") {
    console.log("Usage: ee repair [openclaw]");
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
