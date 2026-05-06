import { installCodexAdapter } from "../../install/codex-installer.js";
import { repairOpenClawAdapter } from "../../install/openclaw-installer.js";

export const runRepairCommand = (target?: string): void => {
  if (!target) {
    console.log("Repair summary:");
    console.log("- OpenClaw: automated repair is available with `ee repair openclaw` when doctor reports host drift.");
    console.log("- Codex: automated repair is available with `ee repair codex` for MCP, hooks, and runtime path drift.");
    console.log("- Claude Code: re-run the marketplace install flow if hooks or MCP wiring are missing.");
    return;
  }

  if (target !== "openclaw" && target !== "codex") {
    console.log("Usage: ee repair [openclaw|codex]");
    return;
  }

  if (target === "codex") {
    const report = installCodexAdapter();
    console.log(`Repaired ${report.adapter} adapter wiring.`);
    console.log(`Runtime target: ${report.runtimeTarget}`);
    console.log(`MCP registration refreshed: ${report.hostWiring.wired ? "yes" : "unknown"}`);
    console.log(`Codex hooks feature enabled: ${report.hooks.featureEnabled ? "yes" : "no"}`);
    console.log(`Codex hook entries installed: ${report.hooks.installedEvents.join(", ") || "none"}`);
    console.log(`Invalid Claude hook entries removed: ${report.hooks.removedClaudeHookCommands.length}`);
    console.log(`Managed instructions updated: ${report.instruction?.state === "present" ? "yes" : "unknown"}`);
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
