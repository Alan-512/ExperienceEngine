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
  distillerProvider?: string;
  distillerModel?: string;
  hybridEnabled?: boolean;
  hybridSyncExplainEnabled?: boolean;
  hybridAsyncPostmortemEnabled?: boolean;
  hybridAsyncPostmortemLlmEnabled?: boolean;
  hybridExplainLlmEnabled?: boolean;
  hybridExplainProviderMode?: string;
  hybridExplainModelProfileVersion?: string;
  hybridPostmortemProviderMode?: string;
  hybridPostmortemModelProfileVersion?: string;
};

export type OpenClawInstallAction = "install" | "reinstall" | "update";

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

export type OpenClawPluginsConfig = {
  allow?: string[];
  load?: {
    paths?: string[];
  };
  entries?: Record<string, OpenClawPluginEntryConfig>;
  installs?: Record<
    string,
    {
      source?: string;
      sourcePath?: string;
      installPath?: string;
      version?: string;
      installedAt?: string;
    }
  >;
};

export const resolveExperienceEnginePackageRoot = (): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const buildOpenClawInstallCommands = (
  installSource: string,
  pluginId: string,
  installAction: OpenClawInstallAction,
  pluginConfig: OpenClawConfigPayload
): OpenClawCommand[] => {
  const commands: OpenClawCommand[] = [
    {
      bin: "openclaw",
      args:
        installAction === "update"
          ? ["plugins", "update", pluginId]
          : ["plugins", "install", installSource],
      description:
        installAction === "update"
          ? "Update the existing ExperienceEngine plugin install in OpenClaw"
          : installAction === "reinstall"
            ? "Reinstall the ExperienceEngine package into OpenClaw from the current package root"
            : "Install the ExperienceEngine package into OpenClaw"
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

  return commands;
};

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

export const buildOpenClawPluginsConfigGetCommand = (): OpenClawCommand => ({
  bin: "openclaw",
  args: ["config", "get", "plugins"],
  description: "Query the full OpenClaw plugins config"
});

export const buildOpenClawWorkspaceGetCommand = (): OpenClawCommand => ({
  bin: "openclaw",
  args: ["config", "get", "agents.defaults.workspace"],
  description: "Query the default OpenClaw agent workspace"
});

export const buildOpenClawLoadPathsSetCommand = (paths: string[]): OpenClawCommand => ({
  bin: "openclaw",
  args: ["config", "set", "plugins.load.paths", JSON.stringify(paths), "--json"],
  description: "Update OpenClaw plugin load paths"
});

export const buildOpenClawAllowSetCommand = (pluginIds: string[]): OpenClawCommand => ({
  bin: "openclaw",
  args: ["config", "set", "plugins.allow", JSON.stringify(pluginIds), "--json"],
  description: "Update OpenClaw plugin allow list"
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

const normalizeWarningLine = (line: string): string => {
  const withoutBox = line
    .replace(/^[\s│┃║┆┊┋╎╏┆┊┌┐└┘├┤┬┴┼╭╮╰╯◇◆]+/, "")
    .replace(/[\s│┃║┆┊┋╎╏┌┐└┘├┤┬┴┼╭╮╰╯]+$/, "")
    .trim();

  return withoutBox.replace(/\s+/g, " ");
};

const isWarningFrameLine = (line: string): boolean => {
  const normalized = normalizeWarningLine(line);
  return (
    normalized.length === 0 ||
    normalized === "Config warnings" ||
    normalized.startsWith("Config warnings ") ||
    /^[─━═\-]+$/.test(normalized)
  );
};

const normalizeWarningLines = (lines: string[]): string[] => {
  const warnings: string[] = [];

  for (const line of lines) {
    const normalized = normalizeWarningLine(line);
    if (isWarningFrameLine(line)) {
      continue;
    }

    if (normalized.startsWith("Config warnings:")) {
      const rest = normalized.slice("Config warnings:".length).trim();
      if (rest) {
        warnings.push(rest.replace(/^-+\s*/, ""));
      }
      continue;
    }

    if (normalized.startsWith("- ")) {
      warnings.push(normalized.slice(2).trim());
      continue;
    }

    if (warnings.length > 0) {
      warnings[warnings.length - 1] = `${warnings[warnings.length - 1]} ${normalized}`.trim();
    } else {
      warnings.push(normalized);
    }
  }

  return warnings;
};

export const splitWarningPrefixedOutput = (output: string): { warnings: string[]; body: string } => {
  const normalizedOutput = output.includes("\n")
    ? output
    : output.replace(/^Config warnings:\\n/, "Config warnings:\n");
  const lines = normalizedOutput
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
    return { warnings: normalizeWarningLines(lines), body: "" };
  }

  return {
    warnings: normalizeWarningLines(lines.slice(0, bodyStart)),
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
  const parsed = parseWarningPrefixedJson<OpenClawPluginEntryConfig>(output);
  return {
    warnings: parsed.warnings,
    entry: parsed.value
  };
};

export const parseWarningPrefixedJson = <T>(output: string): {
  warnings: string[];
  value: T | null;
} => {
  const { warnings, body } = splitWarningPrefixedOutput(output);
  const jsonStart = body.indexOf("{");
  if (jsonStart < 0) {
    return { warnings, value: null };
  }

  const jsonText = body.slice(jsonStart);
  return {
    warnings,
    value: JSON.parse(jsonText) as T
  };
};

export const parseOpenClawPluginsConfig = (output: string): {
  warnings: string[];
  config: OpenClawPluginsConfig | null;
} => {
  const parsed = parseWarningPrefixedJson<OpenClawPluginsConfig>(output);
  return {
    warnings: parsed.warnings,
    config: parsed.value
  };
};
