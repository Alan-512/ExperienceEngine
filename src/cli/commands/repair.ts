import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { repairCodexProjectHooks } from "../../install/codex-hooks.js";
import { resolveCodexRuntimeTarget, ensureCodexProjectHookLauncher } from "../../install/codex-runtime-target.js";
import { repairOpenClawAdapter } from "../../install/openclaw-installer.js";
import { resolveExperienceEnginePackageRoot } from "../../install/openclaw-cli.js";
import { resolveCodexInstructionPath, upsertManagedInstructionBlock } from "../../install/codex-installer.js";

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
    const paths = resolveExperienceEnginePaths({ adapter: "codex" });
    const packageRoot = resolveExperienceEnginePackageRoot();
    const runtimeTarget = resolveCodexRuntimeTarget();
    const hookLauncher = ensureCodexProjectHookLauncher({
      cwd: process.cwd(),
      packageRoot,
      productHome: paths.productHome
    });
    const hooks = repairCodexProjectHooks({
      cwd: process.cwd(),
      hookCommand: hookLauncher.command,
      runtimeTarget,
      includePreToolUse: process.env.EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED === "1"
    });
    const instruction = upsertManagedInstructionBlock(resolveCodexInstructionPath(process.cwd()));

    console.log("Repaired codex project wiring.");
    console.log(`Runtime target: ${runtimeTarget}`);
    console.log("MCP registration refreshed: skipped (project hooks/instructions only)");
    console.log(`Codex hooks feature enabled: ${hooks.featureEnabled ? "yes" : "no"}`);
    console.log(`Codex hook entries installed: ${hooks.installedEvents.join(", ") || "none"}`);
    console.log(`Invalid Claude hook entries removed: ${hooks.removedClaudeHookCommands.length}`);
    console.log(`Managed instructions updated: ${instruction.state === "present" ? "yes" : "unknown"}`);
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
