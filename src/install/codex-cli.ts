import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";

export type CodexCommand = {
  bin: string;
  args: string[];
  description: string;
  env?: NodeJS.ProcessEnv;
};

export type CodexCommandRunner = (command: CodexCommand) => string | void;

export type CodexMcpServerInfo = {
  name?: string;
  enabled?: boolean;
  transport?: string;
  command?: string;
  args?: string;
  commandDisplay?: string;
  env?: string;
  cwd?: string;
  status?: string;
  startupTimeoutSec?: number;
  removeCommand?: string;
};

export const CODEX_EXPERIENCEENGINE_SERVER = "experienceengine";
export const CODEX_EXPERIENCEENGINE_STARTUP_TIMEOUT_SEC = 60;

export const buildCodexMcpServerCommand = (packageRoot = resolveExperienceEnginePackageRoot()): string[] => [
  "node",
  "--no-warnings",
  join(packageRoot, "dist/cli/index.js"),
  "codex-mcp-server"
];

export const buildCodexAddCommand = (
  packageRoot: string,
  experienceEngineHome: string,
  cliEnv?: NodeJS.ProcessEnv,
  serverEnv: Array<[string, string]> = []
): CodexCommand => ({
  bin: "codex",
  args: [
    "mcp",
    "add",
    CODEX_EXPERIENCEENGINE_SERVER,
    "--env",
    `EXPERIENCE_ENGINE_HOME=${experienceEngineHome}`,
    ...serverEnv.flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    "--",
    ...buildCodexMcpServerCommand(packageRoot)
  ],
  description: "Register the ExperienceEngine MCP server with Codex",
  env: cliEnv
});

export const buildCodexRemoveCommand = (cliEnv?: NodeJS.ProcessEnv): CodexCommand => ({
  bin: "codex",
  args: ["mcp", "remove", CODEX_EXPERIENCEENGINE_SERVER],
  description: "Remove the existing ExperienceEngine MCP server registration from Codex",
  env: cliEnv
});

export const buildCodexGetCommand = (cliEnv?: NodeJS.ProcessEnv): CodexCommand => ({
  bin: "codex",
  args: ["mcp", "get", CODEX_EXPERIENCEENGINE_SERVER],
  description: "Inspect the ExperienceEngine MCP server registration in Codex",
  env: cliEnv
});

export const resolveCodexConfigPath = (homeDir?: string): string =>
  join(homeDir ?? homedir(), ".codex", "config.toml");

export const ensureCodexMcpServerStartupTimeout = (
  serverName: string,
  timeoutSec = CODEX_EXPERIENCEENGINE_STARTUP_TIMEOUT_SEC,
  options: { homeDir?: string } = {}
): string => {
  const configPath = resolveCodexConfigPath(options.homeDir);
  const sectionHeader = `[mcp_servers.${serverName}]`;
  const timeoutLine = `startup_timeout_sec = ${timeoutSec.toFixed(1)}`;
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";

  if (!existing.includes(sectionHeader)) {
    const prefix = existing.trimEnd();
    const next = prefix
      ? `${prefix}\n\n${sectionHeader}\n${timeoutLine}\n`
      : `${sectionHeader}\n${timeoutLine}\n`;
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, "utf8");
    return configPath;
  }

  const lines = existing.split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => line.trim() === sectionHeader);
  let insertIndex = lines.length;
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[index])) {
      insertIndex = index;
      break;
    }
  }

  const timeoutIndex = lines.findIndex(
    (line, index) =>
      index > sectionIndex &&
      index < insertIndex &&
      /^\s*startup_timeout_sec\s*=/.test(line)
  );

  if (timeoutIndex >= 0) {
    lines[timeoutIndex] = timeoutLine;
  } else {
    lines.splice(insertIndex, 0, timeoutLine);
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${lines.join("\n").replace(/\n*$/, "\n")}`, "utf8");
  return configPath;
};

export const defaultCodexCommandRunner: CodexCommandRunner = (command) =>
  execFileSync(command.bin, command.args, {
    stdio: "pipe",
    encoding: "utf8",
    env: command.env ? { ...process.env, ...command.env } : process.env
  });

export const runCodexCommand = (
  command: CodexCommand,
  runner: CodexCommandRunner = defaultCodexCommandRunner
): string => {
  const result = runner(command);
  return typeof result === "string" ? result : "";
};

const readField = (output: string, label: string): string | undefined => {
  const match = output.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
};

export const parseCodexMcpServerInfo = (output: string): CodexMcpServerInfo => {
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .find((line) => line.trim().length > 0);

  const command = readField(output, "command");
  const args = readField(output, "args");

  return {
    name: firstLine?.trim(),
    enabled: readField(output, "enabled") === "true",
    transport: readField(output, "transport"),
    command,
    args,
    commandDisplay: [command, args].filter(Boolean).join(" "),
    env: readField(output, "env"),
    cwd: readField(output, "cwd"),
    status: readField(output, "status"),
    startupTimeoutSec: Number(readField(output, "startup_timeout_sec") ?? Number.NaN) || undefined,
    removeCommand: readField(output, "remove")
  };
};
