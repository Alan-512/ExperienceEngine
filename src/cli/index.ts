#!/usr/bin/env node
import { runClaudeHookCommand } from "./commands/claude-hook.js";
import { runCodexMcpServerCommand } from "./commands/codex-mcp-server.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInstallCommand } from "./commands/install.js";
import { runRepairCommand } from "./commands/repair.js";
import { runUpgradeCommand } from "./commands/upgrade.js";
import { runDisableCommand } from "./commands/disable.js";
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
    case "doctor":
      await runDoctorCommand(args[0]);
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
    case "inspect":
      runInspectCommand();
      break;
    case "disable":
      runDisableCommand();
      break;
    case "remember":
      runRememberCommand(args.join(" ").trim());
      break;
    default:
      console.log(
        "Usage: ee <install openclaw|claude-code|codex|upgrade openclaw|claude-code|codex|repair openclaw|claude-hook|codex-mcp-server|doctor [claude-code|codex]|stats|inspect|disable|remember>"
      );
  }
};

await main();
