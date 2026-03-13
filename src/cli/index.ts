#!/usr/bin/env node
import { runClaudeHookCommand } from "./commands/claude-hook.js";
import { runCoolCommand } from "./commands/cool.js";
import { runConfigCommand } from "./commands/config.js";
import { runCodexMcpServerCommand } from "./commands/codex-mcp-server.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInstallCommand } from "./commands/install.js";
import { runMcpServerCommand } from "./commands/mcp-server.js";
import { runRepairCommand } from "./commands/repair.js";
import { runRetireCommand } from "./commands/retire.js";
import { runUpgradeCommand } from "./commands/upgrade.js";
import { runDisableCommand } from "./commands/disable.js";
import { runEnableCommand } from "./commands/enable.js";
import { runFeedbackCommand } from "./commands/feedback.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runRememberCommand } from "./commands/remember.js";
import { runStatsCommand } from "./commands/stats.js";

const main = async (): Promise<void> => {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "install":
      runInstallCommand(args[0]);
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
    case "config":
      runConfigCommand(args[0], args[1], args[2]);
      break;
    case "repair":
      runRepairCommand(args[0]);
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
    case "inspect":
      runInspectCommand(
        args[0] === "node" && args[1] ? `node:${args[1]}` : args[0],
        args[0] === "node" ? args[2] : args[1],
        args[0] === "node" ? args[3] : args[2]
      );
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
    case "remember":
      runRememberCommand(args.join(" ").trim());
      break;
    default:
      console.log(
        "Usage: ee <install openclaw|claude-code|codex|upgrade openclaw|claude-code|codex|repair openclaw|claude-hook|codex-mcp-server|doctor [claude-code|codex]|stats|inspect|feedback|disable|enable|cool|retire|remember>"
        + " | mcp-server"
        + " | config <get|set> notices.inline [true|false]"
      );
  }
};

await main();
