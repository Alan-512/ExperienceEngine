#!/usr/bin/env node
import { runClaudeHookCommand } from "./commands/claude-hook.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInstallCommand } from "./commands/install.js";
import { runRepairCommand } from "./commands/repair.js";
import { runDisableCommand } from "./commands/disable.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runRememberCommand } from "./commands/remember.js";
import { runStatsCommand } from "./commands/stats.js";

const [, , command, ...args] = process.argv;

switch (command) {
  case "install":
    runInstallCommand(args[0]);
    break;
  case "claude-hook":
    runClaudeHookCommand();
    break;
  case "doctor":
    runDoctorCommand();
    break;
  case "repair":
    runRepairCommand(args[0]);
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
      "Usage: ee <install openclaw|claude-code|repair openclaw|claude-hook|doctor|stats|inspect|disable|remember>"
    );
}
