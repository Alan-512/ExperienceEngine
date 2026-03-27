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

type ClaudeHookPayload = {
  session_id?: string;
  hook_event_name?: string;
  transcript_path?: string;
  cwd?: string;
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

const createClaudeRuntime = async (options: ClaudeHookOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const { ExperienceRuntimeService } = await import("../../runtime/service.js");

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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const extractTranscriptPrompt = (transcriptPath: string): { cwd?: string; promptText?: string } | null => {
  try {
    const lines = readFileSync(transcriptPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    let latestPrompt: { cwd?: string; promptText?: string } | null = null;

    for (const line of lines) {
      const record = asRecord(JSON.parse(line));
      if (!record) {
        continue;
      }

      const message = asRecord(record.message);
      const role = typeof message?.role === "string" ? message.role : undefined;
      const content = message?.content;
      const promptText =
        typeof content === "string"
          ? content.trim()
          : Array.isArray(content)
            ? content
                .map((entry) => {
                  if (typeof entry === "string") {
                    return entry.trim();
                  }

                  const item = asRecord(entry);
                  const text = typeof item?.text === "string" ? item.text.trim() : undefined;
                  return text ?? "";
                })
                .filter(Boolean)
                .join("\n")
            : undefined;

      if (role === "user" && promptText) {
        latestPrompt = {
          cwd: typeof record.cwd === "string" ? record.cwd : undefined,
          promptText
        };
      }
    }

    return latestPrompt;
  } catch {
    return null;
  }

  return null;
};

const recoverClaudePromptContext = (
  payload: ClaudeHookPayload | null,
  sessionId: string
): {
  sessionId: string;
  cwd?: string;
  userMessage: string;
  taskSummary: string;
} | null => {
  const transcriptPath = typeof payload?.transcript_path === "string" ? payload.transcript_path : undefined;
  if (!transcriptPath) {
    return null;
  }

  const recovered = extractTranscriptPrompt(transcriptPath);
  if (!recovered?.promptText) {
    return null;
  }

  return {
    sessionId,
    cwd: typeof payload?.cwd === "string" ? payload.cwd : recovered.cwd,
    userMessage: recovered.promptText,
    taskSummary: recovered.promptText
  };
};

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
    const runtime = await createClaudeRuntime(options);
    const promptResult = await runtime.beforePromptBuild({
      ...promptContext,
      host: "claude-code"
    });
    const rememberedContext = {
      ...promptContext,
      host: "claude-code" as const,
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
    const promptContext = stored?.promptContext ?? recoverClaudePromptContext(payload as ClaudeHookPayload | null, event.sessionId);
    if (promptContext) {
      const runtime = await createClaudeRuntime(options);
      for (const pendingToolResult of stored?.toolResults ?? []) {
        await runtime.persistToolResult(pendingToolResult);
      }
      await runtime.finalizeTask({
        ...promptContext,
        host: "claude-code"
      });
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
