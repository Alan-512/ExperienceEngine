import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type OpenClawCommand = {
  bin: string;
  args: string[];
  description: string;
};

export type OpenClawCommandRunner = (command: OpenClawCommand) => void;

export type OpenClawConfigPayload = {
  dataDir: string;
  sqlitePath: string;
  captureDir: string;
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

export const defaultOpenClawCommandRunner: OpenClawCommandRunner = (command) => {
  execFileSync(command.bin, command.args, {
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
