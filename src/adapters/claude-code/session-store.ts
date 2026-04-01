import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveExperienceEnginePaths, resolveProductStateDir } from "../../config/path-resolver.js";
import type { HostPromptContext, HostToolResult } from "../../types/plugin.js";

export type ClaudeStoredSession = {
  sessionId: string;
  promptContext?: HostPromptContext;
  toolResults: HostToolResult[];
};

type SessionStoreOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

const sanitizeSessionId = (sessionId: string): string =>
  sessionId.replace(/[^a-zA-Z0-9_.-]+/g, "_");

const resolveSessionDir = (options: SessionStoreOptions = {}): string => {
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  return join(resolveProductStateDir(paths), "sessions");
};

const resolveSessionPath = (sessionId: string, options: SessionStoreOptions = {}): string =>
  join(resolveSessionDir(options), `${sanitizeSessionId(sessionId)}.json`);

const listClaudeSessionPaths = (options: SessionStoreOptions = {}): string[] => {
  const dir = resolveSessionDir(options);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => join(dir, entry));
};

export const loadClaudeSession = (
  sessionId: string,
  options: SessionStoreOptions = {}
): ClaudeStoredSession | null => {
  const filePath = resolveSessionPath(sessionId, options);
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as ClaudeStoredSession;
};

const writeClaudeSession = (session: ClaudeStoredSession, options: SessionStoreOptions = {}): void => {
  const dir = resolveSessionDir(options);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolveSessionPath(session.sessionId, options), `${JSON.stringify(session, null, 2)}\n`, "utf8");
};

export const rememberClaudePromptContext = (
  context: HostPromptContext,
  options: SessionStoreOptions = {}
): void => {
  const sessionId = context.sessionId;
  if (!sessionId) {
    return;
  }

  const current = loadClaudeSession(sessionId, options) ?? {
    sessionId,
    toolResults: []
  };

  writeClaudeSession(
    {
      ...current,
      promptContext: context
    },
    options
  );
};

export const appendClaudeToolResult = (
  result: HostToolResult,
  options: SessionStoreOptions = {}
): void => {
  const sessionId = result.sessionId;
  if (!sessionId) {
    return;
  }

  const current = loadClaudeSession(sessionId, options) ?? {
    sessionId,
    toolResults: []
  };

  current.toolResults.push(result);
  writeClaudeSession(current, options);
};

export const clearClaudeSession = (sessionId: string, options: SessionStoreOptions = {}): void => {
  const filePath = resolveSessionPath(sessionId, options);
  rmSync(filePath, { force: true });
};

export const findClaudeSessionByCwd = (
  cwd: string,
  options: SessionStoreOptions = {}
): ClaudeStoredSession | null => {
  const matches = listClaudeSessionPaths(options)
    .map((filePath) => ({
      filePath,
      mtimeMs: statSync(filePath).mtimeMs,
      session: JSON.parse(readFileSync(filePath, "utf8")) as ClaudeStoredSession
    }))
    .filter((entry) => entry.session.promptContext?.cwd === cwd)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (matches.length !== 1) {
    return null;
  }

  return matches[0]?.session ?? null;
};
