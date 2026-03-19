import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";
import {
  buildClaudeMcpServerCommandForTarget,
  ensureClaudeLaunchers,
  resolveClaudeRuntimeTarget,
  type ClaudeRuntimeTarget
} from "./claude-runtime-target.js";

export type ClaudeCommand = {
  bin: string;
  args: string[];
  description: string;
  env?: NodeJS.ProcessEnv;
};

export type ClaudeCommandRunner = (command: ClaudeCommand) => string | void;

export type ClaudeMcpServerInfo = {
  name?: string;
  scope?: string;
  status?: string;
  connected?: boolean;
  transport?: string;
  command?: string;
  args?: string;
  commandDisplay?: string;
  env?: string[];
  removeCommand?: string;
};

export const CLAUDE_EXPERIENCEENGINE_SERVER = "experienceengine";

export const buildExperienceEngineMcpServerCommand = (
  packageRoot = resolveExperienceEnginePackageRoot(),
  options: {
    productHome?: string;
    runtimeTarget?: ClaudeRuntimeTarget;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
  } = {}
): string[] => {
  if (!options.productHome) {
    return ["node", "--no-warnings", join(packageRoot, "dist/cli/index.js"), "mcp-server"];
  }

  const launchers = ensureClaudeLaunchers({
    productHome: options.productHome,
    packageRoot
  });
  const runtimeTarget = resolveClaudeRuntimeTarget({
    requested: options.runtimeTarget,
    env: options.env,
    platform: options.platform
  });

  return buildClaudeMcpServerCommandForTarget(runtimeTarget, launchers);
};

export const buildClaudeAddCommand = (
  packageRoot: string,
  experienceEngineHome: string,
  cliEnv?: NodeJS.ProcessEnv,
  runtimeTarget?: ClaudeRuntimeTarget
): ClaudeCommand => ({
  bin: "claude",
  args: [
    "mcp",
    "add",
    "-s",
    "project",
    CLAUDE_EXPERIENCEENGINE_SERVER,
    "-e",
    `EXPERIENCE_ENGINE_HOME=${experienceEngineHome}`,
    "--",
    ...buildExperienceEngineMcpServerCommand(packageRoot, {
      productHome: experienceEngineHome,
      runtimeTarget,
      env: cliEnv
    })
  ],
  description: "Register the ExperienceEngine MCP server with Claude Code",
  env: cliEnv
});

export const buildClaudeGetCommand = (cliEnv?: NodeJS.ProcessEnv): ClaudeCommand => ({
  bin: "claude",
  args: ["mcp", "get", CLAUDE_EXPERIENCEENGINE_SERVER],
  description: "Inspect the ExperienceEngine MCP server registration in Claude Code",
  env: cliEnv
});

export const buildClaudeRemoveCommand = (cliEnv?: NodeJS.ProcessEnv): ClaudeCommand => ({
  bin: "claude",
  args: ["mcp", "remove", CLAUDE_EXPERIENCEENGINE_SERVER],
  description: "Remove the existing ExperienceEngine MCP server registration from Claude Code",
  env: cliEnv
});

export const defaultClaudeCommandRunner: ClaudeCommandRunner = (command) =>
  execFileSync(command.bin, command.args, {
    stdio: "pipe",
    encoding: "utf8",
    env: command.env ? { ...process.env, ...command.env } : process.env
  });

export const runClaudeCommand = (
  command: ClaudeCommand,
  runner: ClaudeCommandRunner = defaultClaudeCommandRunner
): string => {
  const result = runner(command);
  return typeof result === "string" ? result : "";
};

const readField = (output: string, label: string): string | undefined => {
  const match = output.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
};

export const parseClaudeMcpServerInfo = (output: string): ClaudeMcpServerInfo => {
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .find((line) => line.trim().length > 0);

  const command = readField(output, "Command");
  const args = readField(output, "Args");
  const envLines = [...output.matchAll(/^\s{4}([A-Z0-9_]+=.+)$/gm)].map((match) => match[1].trim());
  const status = readField(output, "Status");

  return {
    name: firstLine?.replace(/:$/, "").trim(),
    scope: readField(output, "Scope"),
    status,
    connected: status ? !status.includes("Failed") && !status.includes("Error") : undefined,
    transport: readField(output, "Type"),
    command,
    args,
    commandDisplay: [command, args].filter(Boolean).join(" "),
    env: envLines,
    removeCommand: readField(output, "To remove this server, run")
  };
};
