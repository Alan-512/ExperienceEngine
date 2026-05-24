import {
  buildClaudeMarketplaceAddCommand,
  buildClaudePluginInstallCommand,
  buildCodexPublicInstallCommand,
  buildOpenClawPublicInstallCommand
} from "../install/public-install.js";
import { SURFACE_TIER_DEFINITIONS } from "../interaction/surface-tiers.js";

const usageText =
  "Usage: ee <install openclaw|claude-code|codex|antigravity|upgrade openclaw|claude-code|codex|antigravity|repair [openclaw|codex|antigravity]|claude-hook|codex-hook|antigravity-hook|codex <exec ...>|agy <exec ...>|antigravity <activate-project ...>|codex-mcp-server|doctor [openclaw|claude-code|codex|antigravity]|status|stats|inspect|feedback|disable|enable|cool|retire>"
  + " | helped|harmed"
  + " | backup|export|import <snapshot-path>|rollback <backup-id>"
  + " | maintenance embeddings-reset|embedding-smoke|governance drain|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>"
  + " | evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]"
  + " | evaluate openclaw-scenarios --pack high-confidence [--repo-root PATH] [--output-dir PATH] [--dry-run]"
  + " | evaluate codex-lifecycle [--repo-root PATH] [--output-dir PATH]"
  + " | mcp-server"
  + " | init [distillation|embedding|secret|show]"
  + " | models list <provider> [query]"
  + " | config <get|set|unset> notices.inline|distillation.provider|distillation.auth_mode|distillation.model|embedding.provider|embedding.api_provider|embedding.model|embedding.dtype|secret.<ENV_KEY> [value]";

export const printCliUsage = (): void => {
  console.log("ExperienceEngine CLI");
  console.log("Get started:");
  console.log(`- OpenClaw (host-native plugin): ${buildOpenClawPublicInstallCommand()}`);
  console.log(`- Claude Code (host-native marketplace): ${buildClaudeMarketplaceAddCommand()}`);
  console.log(`- Then install the plugin: ${buildClaudePluginInstallCommand()}`);
  console.log(`- Codex (EE-managed wiring): ${buildCodexPublicInstallCommand()}`);
  console.log("- Initialize shared state: ee init");
  console.log(`${SURFACE_TIER_DEFINITIONS.routine.label} workflows:`);
  console.log("- Host-first review/feedback: ask OpenClaw, Codex, or Claude Code what ExperienceEngine injected and mark helped/harmed in-session.");
  console.log("- CLI fallback: ee status | ee doctor <openclaw|claude-code|codex|antigravity> | ee inspect --last | ee helped | ee harmed");
  console.log(`${SURFACE_TIER_DEFINITIONS.operator.label} workflows:`);
  console.log("- Host setup and repair: ee install|upgrade|repair <openclaw|claude-code|codex|antigravity>");
  console.log("- Antigravity CLI wrapper: ee agy exec -C <project> \"<prompt>\"");
  console.log("- Read-only review: ee inspect review | ee inspect hygiene | ee inspect export-drafts | ee inspect repo");
  console.log("- Managed state: ee backup | ee export | ee import <snapshot-path> | ee rollback <backup-id>");
  console.log(`${SURFACE_TIER_DEFINITIONS.advanced.label} workflows:`);
  console.log("- Maintenance, raw evaluation, Codex broker internals, and developer diagnostics are advanced/experimental.");
  console.log("Full command reference:");
  console.log(usageText);
};

export const runCliCommand = async (command: string | undefined, args: string[]): Promise<void> => {
  switch (command) {
    case "install": {
      const { runInstallCommand } = await import("./commands/install.js");
      await runInstallCommand(args[0], args.slice(1));
      break;
    }
    case "backup": {
      const { runBackupCommand } = await import("./commands/backup.js");
      runBackupCommand();
      break;
    }
    case "claude-hook": {
      const { runClaudeHookCommand } = await import("./commands/claude-hook.js");
      await runClaudeHookCommand();
      break;
    }
    case "codex-hook": {
      const { runCodexHookCommand } = await import("./commands/codex-hook.js");
      await runCodexHookCommand();
      break;
    }
    case "antigravity-hook": {
      const { runAntigravityHookCommand } = await import("./commands/antigravity-hook.js");
      await runAntigravityHookCommand(args[0]);
      break;
    }
    case "codex": {
      const { runCodexCommand } = await import("./commands/codex.js");
      await runCodexCommand(args[0], args.slice(1));
      break;
    }
    case "agy": {
      const { runAgyCommand } = await import("./commands/agy-exec.js");
      await runAgyCommand(args[0], args.slice(1));
      break;
    }
    case "antigravity": {
      const { runAntigravityCommand } = await import("./commands/antigravity.js");
      await runAntigravityCommand(args[0], args.slice(1));
      break;
    }
    case "codex-mcp-server": {
      const { runCodexMcpServerCommand } = await import("./commands/codex-mcp-server.js");
      await runCodexMcpServerCommand();
      break;
    }
    case "mcp-server": {
      const { runMcpServerCommand } = await import("./commands/mcp-server.js");
      await runMcpServerCommand();
      break;
    }
    case "doctor": {
      const { runDoctorCommand } = await import("./commands/doctor.js");
      await runDoctorCommand(args[0], undefined, args.slice(1));
      break;
    }
    case "evaluate": {
      const { runEvaluateCommand } = await import("./commands/evaluate.js");
      await runEvaluateCommand(args[0], args.slice(1));
      break;
    }
    case "config": {
      const { runConfigCommand } = await import("./commands/config.js");
      await runConfigCommand(args[0], args[1], args[2]);
      break;
    }
    case "models": {
      const { runModelsCommand } = await import("./commands/models.js");
      await runModelsCommand(args[0], args[1], args[2]);
      break;
    }
    case "init": {
      const { runInitCommand } = await import("./commands/init.js");
      await runInitCommand(args[0], args.slice(1));
      break;
    }
    case "repair": {
      const { runRepairCommand } = await import("./commands/repair.js");
      await runRepairCommand(args[0]);
      break;
    }
    case "status": {
      const { runStatusCommand } = await import("./commands/status.js");
      runStatusCommand();
      break;
    }
    case "export": {
      const { runExportCommand } = await import("./commands/export.js");
      runExportCommand();
      break;
    }
    case "import": {
      const { runImportCommand } = await import("./commands/import.js");
      runImportCommand(args[0]);
      break;
    }
    case "rollback": {
      const { runRollbackCommand } = await import("./commands/rollback.js");
      runRollbackCommand(args[0]);
      break;
    }
    case "upgrade": {
      const { runUpgradeCommand } = await import("./commands/upgrade.js");
      await runUpgradeCommand(args[0], args.slice(1));
      break;
    }
    case "stats": {
      const { runStatsCommand } = await import("./commands/stats.js");
      runStatsCommand();
      break;
    }
    case "feedback": {
      const { runFeedbackCommand } = await import("./commands/feedback.js");
      runFeedbackCommand(args[0], args[1], args[2]);
      break;
    }
    case "helped":
    case "harmed": {
      const { runQuickFeedbackCommand } = await import("./commands/feedback.js");
      runQuickFeedbackCommand(command);
      break;
    }
    case "inspect": {
      const { runInspectCommand } = await import("./commands/inspect.js");
      runInspectCommand(
        args[0] === "node" && args[1] ? `node:${args[1]}` : args[0],
        args[0] === "node" ? args[2] : args[1],
        args[0] === "node" ? args[3] : args[2],
        ...(args[0] === "node" ? args.slice(4) : args.slice(3))
      );
      break;
    }
    case "maintenance": {
      const { runMaintenanceCommand } = await import("./commands/maintenance.js");
      await runMaintenanceCommand(args[0], args.slice(1));
      break;
    }
    case "disable": {
      const { runDisableCommand } = await import("./commands/disable.js");
      runDisableCommand(args[0], args[1]);
      break;
    }
    case "enable": {
      const { runEnableCommand } = await import("./commands/enable.js");
      runEnableCommand(args[0]);
      break;
    }
    case "cool": {
      const { runCoolCommand } = await import("./commands/cool.js");
      runCoolCommand(args[0], args[1]);
      break;
    }
    case "retire": {
      const { runRetireCommand } = await import("./commands/retire.js");
      runRetireCommand(args[0], args[1]);
      break;
    }
    default:
      printCliUsage();
  }
};
