import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CLAUDE_MARKETPLACE_STATE_FILENAME = "claude-marketplace-state.json";

export type ClaudeMarketplaceRuntimeState = {
  adapter: "claude-code";
  install_mode: "marketplace";
  hook_source: "marketplace";
  package_version?: string;
  written_at?: string;
  last_hook_seen_at?: string;
  last_mcp_seen_at?: string;
};

export const resolveClaudeMarketplaceStatePath = (experienceEngineHome: string): string =>
  join(experienceEngineHome, CLAUDE_MARKETPLACE_STATE_FILENAME);

export const readClaudeMarketplaceRuntimeState = (
  experienceEngineHome?: string
): ClaudeMarketplaceRuntimeState | null => {
  if (!experienceEngineHome) {
    return null;
  }

  const path = resolveClaudeMarketplaceStatePath(experienceEngineHome);
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as ClaudeMarketplaceRuntimeState;
  } catch {
    return null;
  }
};

export const extractClaudeHostEnvValue = (
  envLines: string[] | undefined,
  key: string
): string | undefined => {
  const prefix = `${key}=`;
  return envLines?.find((line) => line.startsWith(prefix))?.slice(prefix.length);
};

export const touchClaudeMarketplaceHeartbeat = (
  experienceEngineHome: string | undefined,
  source: "hook" | "mcp",
  timestamp = new Date().toISOString()
): ClaudeMarketplaceRuntimeState | null => {
  if (!experienceEngineHome) {
    return null;
  }

  const path = resolveClaudeMarketplaceStatePath(experienceEngineHome);
  const existing = readClaudeMarketplaceRuntimeState(experienceEngineHome) ?? {
    adapter: "claude-code" as const,
    install_mode: "marketplace" as const,
    hook_source: "marketplace" as const
  };
  const next: ClaudeMarketplaceRuntimeState = {
    ...existing,
    adapter: "claude-code",
    install_mode: "marketplace",
    hook_source: "marketplace",
    ...(source === "hook"
      ? { last_hook_seen_at: timestamp }
      : { last_mcp_seen_at: timestamp })
  };

  mkdirSync(experienceEngineHome, { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
};
