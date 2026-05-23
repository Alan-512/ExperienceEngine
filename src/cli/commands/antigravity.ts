import { resolve } from "node:path";
import { ensureAntigravityProjectWiring } from "../../install/antigravity.js";

type AntigravityCommandDeps = {
  ensureAntigravityProjectWiring?: typeof ensureAntigravityProjectWiring;
  cwd?: () => string;
  env?: () => NodeJS.ProcessEnv;
};

const printUsage = (): void => {
  console.log("Usage: ee antigravity activate-project [-C <project>]");
};

const resolveProjectCwd = (args: string[], currentWorkingDirectory: string): string => {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if ((token === "-C" || token === "--cd") && args[index + 1]) {
      return resolve(currentWorkingDirectory, args[index + 1] as string);
    }
    if (token?.startsWith("--cd=")) {
      return resolve(currentWorkingDirectory, token.slice("--cd=".length));
    }
  }

  return currentWorkingDirectory;
};

export const runAntigravityCommand = async (
  subcommand?: string,
  args: string[] = [],
  deps: AntigravityCommandDeps = {}
): Promise<void> => {
  if (subcommand !== "activate-project") {
    printUsage();
    return;
  }

  const cwd = resolveProjectCwd(args, (deps.cwd ?? (() => process.cwd()))());
  const env = (deps.env ?? (() => process.env))();
  const report = await (deps.ensureAntigravityProjectWiring ?? ensureAntigravityProjectWiring)({
    cwd,
    env
  });

  console.log("Activated Antigravity project wiring.");
  console.log(`Project: ${report.cwd}`);
  console.log("Install scope: user");
  console.log(`MCP registered: ${report.mcpRegistered ? "yes" : "no"}`);
  console.log(`Hooks registered: ${report.hooksRegistered ? "yes" : "no"}`);
  console.log(`Lifecycle mode: ${report.lifecycleMode}`);
  console.log("EE data remains user-level under the configured ExperienceEngine home.");
};
