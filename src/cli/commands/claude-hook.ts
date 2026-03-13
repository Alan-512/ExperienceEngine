import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeClaudeHookPayload } from "../../adapters/claude-code/hook-normalizer.js";
import { persistClaudeNormalizedEvent } from "../../adapters/claude-code/event-store.js";
import {
  appendClaudeToolResult,
  clearClaudeSession,
  loadClaudeSession,
  rememberClaudePromptContext
} from "../../adapters/claude-code/session-store.js";
import { toClaudePromptContext, toClaudeToolResult } from "../../adapters/claude-code/runtime-projection.js";
import { loadConfig } from "../../config/load-config.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { ExperienceRuntimeService } from "../../runtime/service.js";

type ClaudeHookPayload = {
  session_id?: string;
  hook_event_name?: string;
  [key: string]: unknown;
};

type ClaudeHookOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export type ClaudeHookCommandResult = {
  capturePath: string | null;
  hookOutput?: string;
  notice?: string;
};

const sanitizeSegment = (value: string | undefined, fallback: string): string =>
  (value ?? fallback).replace(/[^a-zA-Z0-9_.-]+/g, "_");

const createClaudeRuntime = (options: ClaudeHookOptions = {}): ExperienceRuntimeService => {
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });

  return new ExperienceRuntimeService(
    loadConfig(
      {
        dataDir: paths.dataDir,
        sqlitePath: paths.sqlitePath,
        captureDir: paths.captureDir
      },
      {
        env: options.env ?? process.env,
        homeDir: options.homeDir
      }
    )
  );
};

const buildClaudeHookOutput = (additionalContext: string): string =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext
    }
  });

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
    env: options.env ?? process.env,
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

export const processClaudeHookPayload = async (
  rawInput: string,
  options: ClaudeHookOptions = {}
): Promise<ClaudeHookCommandResult> => {
  const capturePath = persistClaudeHookCapture(rawInput, options);
  if (!capturePath) {
    return { capturePath: null };
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    payload = null;
  }

  const event = normalizeClaudeHookPayload(payload);
  persistClaudeNormalizedEvent(event, options);

  const promptContext = toClaudePromptContext(event);
  if (promptContext) {
    const runtime = createClaudeRuntime(options);
    const promptResult = await runtime.beforePromptBuild(promptContext);
    const rememberedContext = {
      ...promptContext,
      injectedNodeIds: promptResult.input.injected_node_ids
    };
    rememberClaudePromptContext(rememberedContext, options);

    return {
      capturePath,
      notice: promptResult.notice,
      hookOutput:
        promptResult.text && promptResult.mode !== "skip"
          ? buildClaudeHookOutput(promptResult.text)
          : undefined
    };
  }

  const toolResult = toClaudeToolResult(event);
  if (toolResult) {
    appendClaudeToolResult(toolResult, options);
  }

  if (event.eventName === "SessionEnd" && event.sessionId) {
    const stored = loadClaudeSession(event.sessionId, options);
    if (stored?.promptContext) {
      const runtime = createClaudeRuntime(options);
      for (const pendingToolResult of stored.toolResults) {
        await runtime.persistToolResult(pendingToolResult);
      }
      await runtime.finalizeTask(stored.promptContext);
    }

    clearClaudeSession(event.sessionId, options);
  }

  return { capturePath };
};

export const runClaudeHookCommand = async (): Promise<void> => {
  const rawInput = readFileSync(0, "utf8");
  const result = await processClaudeHookPayload(rawInput);
  if (result.notice) {
    process.stderr.write(`${result.notice}\n`);
  }
  if (result.hookOutput) {
    process.stdout.write(`${result.hookOutput}\n`);
  }
};
