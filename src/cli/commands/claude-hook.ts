import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";

type ClaudeHookPayload = {
  session_id?: string;
  hook_event_name?: string;
  [key: string]: unknown;
};

type ClaudeHookOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

const sanitizeSegment = (value: string | undefined, fallback: string): string =>
  (value ?? fallback).replace(/[^a-zA-Z0-9_.-]+/g, "_");

export const persistClaudeHookCapture = (
  rawInput: string,
  options: ClaudeHookOptions = {}
): string | null => {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? {},
    homeDir: options.homeDir
  });

  mkdirSync(paths.captureDir, { recursive: true });
  const receivedAt = new Date().toISOString();

  let payload: ClaudeHookPayload | null = null;
  try {
    payload = JSON.parse(trimmed) as ClaudeHookPayload;
  } catch {
    payload = null;
  }

  const sessionId = sanitizeSegment(payload?.session_id, "unknown-session");
  const eventName = sanitizeSegment(payload?.hook_event_name, "unknown-event");
  const capturePath = join(paths.captureDir, `${receivedAt}_${sessionId}_${eventName}.json`);

  mkdirSync(dirname(capturePath), { recursive: true });
  writeFileSync(
    capturePath,
    `${JSON.stringify(
      {
        receivedAt,
        payload,
        raw: trimmed
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return capturePath;
};

export const runClaudeHookCommand = (): void => {
  const rawInput = readFileSync(0, "utf8");
  persistClaudeHookCapture(rawInput);
};
