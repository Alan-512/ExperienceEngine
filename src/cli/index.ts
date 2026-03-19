#!/usr/bin/env node
import { runClaudeHookCommand } from "./commands/claude-hook.js";
import { runCoolCommand } from "./commands/cool.js";
import { runConfigCommand } from "./commands/config.js";
import { runCodexMcpServerCommand } from "./commands/codex-mcp-server.js";
import { runBackupCommand } from "./commands/backup.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runEvaluateCommand } from "./commands/evaluate.js";
import { runExportCommand } from "./commands/export.js";
import { runImportCommand } from "./commands/import.js";
import { runInstallCommand } from "./commands/install.js";
import { runMcpServerCommand } from "./commands/mcp-server.js";
import { runRepairCommand } from "./commands/repair.js";
import { runRollbackCommand } from "./commands/rollback.js";
import { runRetireCommand } from "./commands/retire.js";
import { runUpgradeCommand } from "./commands/upgrade.js";
import { runDisableCommand } from "./commands/disable.js";
import { runEnableCommand } from "./commands/enable.js";
import { runFeedbackCommand, runQuickFeedbackCommand } from "./commands/feedback.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runMaintenanceCommand } from "./commands/maintenance.js";
import { runPackCommand } from "./commands/pack.js";
import { runStatsCommand } from "./commands/stats.js";

const main = async (): Promise<void> => {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "install":
      runInstallCommand(args[0]);
      break;
    case "backup":
      runBackupCommand();
      break;
    case "claude-hook":
      await runClaudeHookCommand();
      break;
    case "codex-mcp-server":
      await runCodexMcpServerCommand();
      break;
    case "mcp-server":
      await runMcpServerCommand();
      break;
    case "doctor":
      await runDoctorCommand(args[0]);
      break;
    case "evaluate":
      runEvaluateCommand(args[0], args.slice(1));
      break;
    case "config":
      runConfigCommand(args[0], args[1], args[2]);
      break;
    case "repair":
      runRepairCommand(args[0]);
      break;
    case "export":
      runExportCommand();
      break;
    case "import":
      runImportCommand(args[0]);
      break;
    case "rollback":
      runRollbackCommand(args[0]);
      break;
    case "upgrade":
      runUpgradeCommand(args[0]);
      break;
    case "stats":
      runStatsCommand();
      break;
    case "feedback":
      runFeedbackCommand(args[0], args[1], args[2]);
      break;
    case "helped":
      runQuickFeedbackCommand("helped");
      break;
    case "harmed":
      runQuickFeedbackCommand("harmed");
      break;
    case "inspect":
      runInspectCommand(
        args[0] === "node" && args[1] ? `node:${args[1]}` : args[0],
        args[0] === "node" ? args[2] : args[1],
        args[0] === "node" ? args[3] : args[2]
      );
      break;
    case "maintenance":
      await runMaintenanceCommand(args[0]);
      break;
    case "pack":
      runPackCommand(args);
      break;
    case "disable":
      runDisableCommand(args[0], args[1]);
      break;
    case "enable":
      runEnableCommand(args[0]);
      break;
    case "cool":
      runCoolCommand(args[0], args[1]);
      break;
    case "retire":
      runRetireCommand(args[0], args[1]);
      break;
    default:
      console.log(
        "Usage: ee <install openclaw|claude-code|codex|upgrade openclaw|claude-code|codex|repair openclaw|claude-hook|codex-mcp-server|doctor [claude-code|codex]|stats|inspect|feedback|disable|enable|cool|retire>"
        + " | helped|harmed"
        + " | pack <list|inspect|draft create|review|publish|rollback>"
        + " | backup|export|import <snapshot-path>|rollback <backup-id>"
        + " | maintenance embeddings-reset|redistill-rule-nodes"
        + " | evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]"
        + " | evaluate openclaw-scenarios --pack high-confidence [--repo-root PATH] [--output-dir PATH] [--dry-run]"
        + " | mcp-server"
        + " | config <get|set> notices.inline [true|false]"
      );
  }
};

await main();
