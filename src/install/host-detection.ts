import { spawnSync } from "node:child_process";

export type SupportedHostId = "codex" | "claude-code" | "openclaw" | "antigravity";

export type DetectedHost = {
  id: SupportedHostId;
  label: string;
  command: string;
};

const HOSTS: DetectedHost[] = [
  { id: "codex", label: "Codex", command: "codex" },
  { id: "claude-code", label: "Claude Code", command: "claude" },
  { id: "openclaw", label: "OpenClaw", command: "openclaw" },
  { id: "antigravity", label: "Google Antigravity", command: "agy" }
];

const commandExists = (command: string): boolean => {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookupCommand, [command], {
    stdio: "ignore"
  });

  return result.status === 0;
};

export const detectAvailableHosts = (): DetectedHost[] =>
  HOSTS.filter((host) => commandExists(host.command));

export const isSupportedHost = (value: string): value is SupportedHostId =>
  HOSTS.some((host) => host.id === value);
