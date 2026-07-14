import { dirname } from "node:path";
import { repairCodexProjectHooks } from "../../install/codex-hooks.js";
import { resolveCodexRuntimeTarget, ensureCodexProjectHookLauncher } from "../../install/codex-runtime-target.js";
import { repairOpenClawAdapter } from "../../install/openclaw-installer.js";
import { repairAntigravityAdapter } from "../../install/antigravity.js";
import { resolveExperienceEnginePackageRoot } from "../../install/openclaw-cli.js";
import {
  resolveCodexInstructionPath,
  resolveCodexInstallerPaths,
  upsertManagedInstructionBlock
} from "../../install/codex-installer.js";
import { buildCodexHookReviewGuidance } from "../../install/public-install.js";

export const runRepairCommand = async (
  target?: string,
  args: string[] = []
): Promise<void> => {
  if (!target) {
    console.log("Repair summary:");
    console.log("- OpenClaw: automated repair is available with `ee repair openclaw` when doctor reports host drift.");
    console.log("- Codex: automated repair is available with `ee repair codex` for MCP, hooks, and runtime path drift.");
    console.log("- Antigravity: automated repair is available with `ee repair antigravity` for hooks and MCP drift.");
    console.log("- Claude Code: re-run the marketplace install flow if hooks or MCP wiring are missing.");
    return;
  }

  if (target !== "openclaw" && target !== "codex" && target !== "antigravity") {
    console.log("Usage: ee repair [openclaw|codex|antigravity] [--approve-host-security-scan]");
    return;
  }

  if (target === "codex") {
    const paths = resolveCodexInstallerPaths();
    const packageRoot = resolveExperienceEnginePackageRoot();
    const runtimeTarget = resolveCodexRuntimeTarget();
    const hookLauncher = ensureCodexProjectHookLauncher({
      cwd: process.cwd(),
      packageRoot,
      productHome: paths.productHome,
      runtimeTarget
    });
    const hooks = repairCodexProjectHooks({
      cwd: process.cwd(),
      homeDir: dirname(paths.productHome),
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
    console.log(`[ExperienceEngine] Codex hook review: ${buildCodexHookReviewGuidance(hooks.installedEvents)}`);
    console.log(`Invalid Claude hook entries removed: ${hooks.removedClaudeHookCommands.length}`);
    console.log(`Managed instructions updated: ${instruction.state === "present" ? "yes" : "unknown"}`);
    return;
  }

  if (target === "antigravity") {
    const report = await repairAntigravityAdapter();
    console.log(`Repaired ${report.adapter} adapter wiring.`);
    console.log(`Install scope: ${report.installScope}`);
    console.log(`Installed version: ${report.installedVersion}`);
    console.log(`Package root: ${report.packageRoot}`);
    console.log(`Server name: ${report.serverName}`);
    console.log(`Server command: ${report.serverCommand}`);
    console.log(`Lifecycle mode: ${report.lifecycleMode}`);
    console.log(`Current project: ${report.projectWiring.cwd}`);
    console.log(`Current project MCP Registered: ${report.projectWiring.mcpRegistered ? "yes" : "no"}`);
    console.log(`Current project Hooks Registered: ${report.projectWiring.hooksRegistered ? "yes" : "no"}`);
    console.log(`Agent Desktop global activation: ${report.agentDesktopGlobalActivation}`);
    console.log(`Capture path: ${report.captureDir}`);
    return;
  }

  const report = repairOpenClawAdapter({
    approveHostSecurityScan: args.includes("--approve-host-security-scan")
  });
  console.log(`Repaired ${report.adapter} adapter wiring.`);
  console.log(`Linked package root: ${report.packageRoot}`);
  console.log(`Install source: ${report.installSource}`);
  console.log(`Active data root: ${report.paths.activeHome}`);
  if (report.hostWiring.restartRecommended) {
    console.log("OpenClaw gateway restart recommended.");
  }
};
