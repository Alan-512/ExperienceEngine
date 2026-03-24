const usageText =
  "Usage: ee <install openclaw|claude-code|codex|upgrade openclaw|claude-code|codex|repair [openclaw]|claude-hook|codex-mcp-server|doctor [openclaw|claude-code|codex]|status|stats|inspect|feedback|disable|enable|cool|retire>"
  + " | helped|harmed"
  + " | pack <list|inspect|draft create|review|publish|compile [version] [agents|codex]|rollback>"
  + " | backup|export|import <snapshot-path>|rollback <backup-id>"
  + " | maintenance embeddings-reset|embedding-smoke|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>"
  + " | evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]"
  + " | evaluate openclaw-scenarios --pack high-confidence [--repo-root PATH] [--output-dir PATH] [--dry-run]"
  + " | mcp-server"
  + " | init <distillation|secret|show>"
  + " | models list <provider> [query]"
  + " | config <get|set> notices.inline|distillation.provider|distillation.model [value]";

export const printCliUsage = (): void => {
  console.log(usageText);
};

export const runCliCommand = async (command: string | undefined, args: string[]): Promise<void> => {
  switch (command) {
    case "install": {
      const { runInstallCommand } = await import("./commands/install.js");
      runInstallCommand(args[0], args.slice(1));
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
      await runDoctorCommand(args[0]);
      break;
    }
    case "evaluate": {
      const { runEvaluateCommand } = await import("./commands/evaluate.js");
      runEvaluateCommand(args[0], args.slice(1));
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
      runRepairCommand(args[0]);
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
      runUpgradeCommand(args[0], args.slice(1));
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
        args[0] === "node" ? args[3] : args[2]
      );
      break;
    }
    case "maintenance": {
      const { runMaintenanceCommand } = await import("./commands/maintenance.js");
      await runMaintenanceCommand(args[0], args.slice(1));
      break;
    }
    case "pack": {
      const { runPackCommand } = await import("./commands/pack.js");
      runPackCommand(args);
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
