import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type OpenClawCommand = {
  bin: string;
  args: string[];
  description: string;
};

export type OpenClawCommandRunner = (command: OpenClawCommand) => string | void;

export type OpenClawConfigPayload = {
  dataDir: string;
  sqlitePath: string;
  captureDir: string;
};

export type OpenClawPluginInfo = {
  warnings: string[];
  name?: string;
  pluginId?: string;
  status?: string;
  source?: string;
  origin?: string;
  version?: string;
  error?: string;
  installKind?: string;
  sourcePath?: string;
  installPath?: string;
};

export type OpenClawPluginEntryConfig = {
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export const resolveExperienceEnginePackageRoot = (): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const buildOpenClawInstallCommands = (
  packageRoot: string,
  pluginId: string,
  pluginConfig: OpenClawConfigPayload
): OpenClawCommand[] => [
  {
    bin: "openclaw",
    args: ["plugins", "install", "-l", packageRoot],
    description: "Link the ExperienceEngine package into OpenClaw"
  },
  {
    bin: "openclaw",
    args: ["plugins", "enable", pluginId],
    description: "Enable the ExperienceEngine plugin in OpenClaw"
  },
  {
    bin: "openclaw",
    args: [
      "config",
      "set",
      `plugins.entries.${pluginId}.config`,
      JSON.stringify(pluginConfig),
      "--json"
    ],
    description: "Write ExperienceEngine plugin config into OpenClaw"
  }
];

export const buildOpenClawInfoCommand = (pluginId: string): OpenClawCommand => ({
  bin: "openclaw",
  args: ["plugins", "info", pluginId],
  description: "Query the live OpenClaw plugin status"
});

export const buildOpenClawConfigGetCommand = (pluginId: string): OpenClawCommand => ({
  bin: "openclaw",
  args: ["config", "get", `plugins.entries.${pluginId}`],
  description: "Query the live OpenClaw plugin entry config"
});

export const defaultOpenClawCommandRunner: OpenClawCommandRunner = (command) => {
  return execFileSync(command.bin, command.args, {
    stdio: "pipe",
    encoding: "utf8"
  });
};

export const runOpenClawCommands = (
  commands: OpenClawCommand[],
  runner: OpenClawCommandRunner = defaultOpenClawCommandRunner
): void => {
  for (const command of commands) {
    runner(command);
  }
};

export const runOpenClawCommand = (
  command: OpenClawCommand,
  runner: OpenClawCommandRunner = defaultOpenClawCommandRunner
): string => {
  const result = runner(command);
  return typeof result === "string" ? result : "";
};

const splitWarningPrefixedOutput = (output: string): { warnings: string[]; body: string } => {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const bodyStart = lines.findIndex((line) => {
    const trimmed = line.trimStart();
    return (
      trimmed.startsWith("{") ||
      trimmed.startsWith("ExperienceEngine") ||
      trimmed.startsWith("id:") ||
      trimmed.startsWith("Status:")
    );
  });

  if (bodyStart < 0) {
    return { warnings: lines, body: "" };
  }

  return {
    warnings: lines.slice(0, bodyStart),
    body: lines.slice(bodyStart).join("\n")
  };
};

const readInfoField = (body: string, label: string): string | undefined => {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "m");
  const match = body.match(pattern);
  return match?.[1]?.trim();
};

export const parseOpenClawPluginInfo = (output: string): OpenClawPluginInfo => {
  const { warnings, body } = splitWarningPrefixedOutput(output);
  const lines = body.split(/\r?\n/).filter(Boolean);

  const info: OpenClawPluginInfo = {
    warnings
  };

  if (lines[0] && !lines[0].includes(":")) {
    info.name = lines[0].trim();
  }

  const descriptionLine = lines[1];
  if (descriptionLine && !descriptionLine.includes(":")) {
    info.source = descriptionLine.trim();
  }

  info.pluginId = readInfoField(body, "id");
  info.status = readInfoField(body, "Status");
  info.origin = readInfoField(body, "Origin");
  info.version = readInfoField(body, "Version");
  info.error = readInfoField(body, "Error");
  info.installKind = readInfoField(body, "Install");
  info.sourcePath = readInfoField(body, "Source path");
  info.installPath = readInfoField(body, "Install path");

  return info;
};

export const parseOpenClawPluginEntryConfig = (output: string): {
  warnings: string[];
  entry: OpenClawPluginEntryConfig | null;
} => {
  const { warnings, body } = splitWarningPrefixedOutput(output);
  const jsonStart = body.indexOf("{");
  if (jsonStart < 0) {
    return { warnings, entry: null };
  }

  const jsonText = body.slice(jsonStart);
  return {
    warnings,
    entry: JSON.parse(jsonText) as OpenClawPluginEntryConfig
  };
};
