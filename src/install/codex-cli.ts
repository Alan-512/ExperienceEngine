import { execFileSync } from "node:child_process";
import { join } from "node:path";
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
  removeCommand?: string;
};

export const CODEX_EXPERIENCEENGINE_SERVER = "experienceengine";

export const buildCodexMcpServerCommand = (packageRoot = resolveExperienceEnginePackageRoot()): string[] => [
  "node",
  "--no-warnings",
  join(packageRoot, "dist/cli/index.js"),
  "codex-mcp-server"
];

export const buildCodexAddCommand = (
  packageRoot: string,
  experienceEngineHome: string,
  cliEnv?: NodeJS.ProcessEnv
): CodexCommand => ({
  bin: "codex",
  args: [
    "mcp",
    "add",
    CODEX_EXPERIENCEENGINE_SERVER,
    "--env",
    `EXPERIENCE_ENGINE_HOME=${experienceEngineHome}`,
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
    removeCommand: readField(output, "remove")
  };
};
