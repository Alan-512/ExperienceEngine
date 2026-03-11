#!/usr/bin/env node
import { runDisableCommand } from "./commands/disable.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runRememberCommand } from "./commands/remember.js";
import { runStatsCommand } from "./commands/stats.js";

const [, , command, ...args] = process.argv;

switch (command) {
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
    console.log("Usage: ee <stats|inspect|disable|remember>");
}

