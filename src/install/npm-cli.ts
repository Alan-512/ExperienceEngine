import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const resolveNpmCliPath = (): string | null => {
  const lifecycleNpmCli = process.env.npm_execpath?.trim();
  if (
    lifecycleNpmCli &&
    /(?:^|[/\\])npm-cli\.(?:c?js)$/i.test(lifecycleNpmCli) &&
    existsSync(lifecycleNpmCli)
  ) {
    return lifecycleNpmCli;
  }
  if (process.platform !== "win32") {
    return null;
  }
  const npmCommandPaths = execFileSync("where.exe", ["npm.cmd"], {
    stdio: "pipe",
    encoding: "utf8"
  }).split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
  for (const npmCommandPath of npmCommandPaths) {
    const npmCliPath = join(dirname(npmCommandPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (existsSync(npmCliPath)) {
      return npmCliPath;
    }
  }
  throw new Error("EE_NPM_CLI_NOT_FOUND: unable to resolve npm-cli.js from npm.cmd");
};

export const runNpmCli = (args: string[], cwd: string): string => {
  const npmCliPath = resolveNpmCliPath();
  return execFileSync(npmCliPath ? process.execPath : "npm", npmCliPath ? [npmCliPath, ...args] : args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8"
  });
};
