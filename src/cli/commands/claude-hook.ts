import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { normalizeClaudeHookPayload } from "../../adapters/claude-code/hook-normalizer.js";
import { persistClaudeNormalizedEvent } from "../../adapters/claude-code/event-store.js";
import {
  appendClaudeToolResult,
  clearClaudeSession,
  findClaudeSessionByCwd,
  loadClaudeSession,
  rememberClaudePromptContext
} from "../../adapters/claude-code/session-store.js";
import { toClaudePromptContext, toClaudeToolResult } from "../../adapters/claude-code/runtime-projection.js";
import { loadConfig } from "../../config/load-config.js";
import { isolatePathEnvForHomeDir, resolveExperienceEnginePaths } from "../../config/path-resolver.js";

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

type ClaudeQueuedHookEvent = "SessionEnd";

type ClaudeHookQueueItem = {
  id: string;
  event: ClaudeQueuedHookEvent;
  rawInput: string;
  enqueuedAt: string;
};

const sanitizeSegment = (value: string | undefined, fallback: string): string =>
  (value ?? fallback).replace(/[^a-zA-Z0-9_.-]+/g, "_");

const createClaudeRuntime = async (options: ClaudeHookOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? (options.homeDir ? isolatePathEnvForHomeDir(process.env) : process.env),
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
        env: options.env ?? (options.homeDir ? isolatePathEnvForHomeDir(process.env) : process.env),
        homeDir: options.homeDir
      }
    ),
    undefined,
    {
      autonomousHygieneGovernance: {
        enabled: true
      }
    }
  );
};

const queueDir = (options: ClaudeHookOptions = {}): string => {
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? (options.homeDir ? isolatePathEnvForHomeDir(process.env) : process.env),
    homeDir: options.homeDir
  });
  const dir = join(paths.dataDir, "hook-queue");
  mkdirSync(dir, { recursive: true });
  return dir;
};

const enqueueClaudeHookPayload = (
  event: ClaudeQueuedHookEvent,
  rawInput: string,
  options: ClaudeHookOptions = {}
): void => {
  const id = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const item: ClaudeHookQueueItem = {
    id,
    event,
    rawInput,
    enqueuedAt: new Date().toISOString()
  };
  writeFileSync(join(queueDir(options), `${id}.json`), `${JSON.stringify(item)}\n`, "utf8");
};

const spawnQueueDrain = (): void => {
  const child = spawn(process.execPath, [process.argv[1] ?? "", "claude-hook", "--drain-queue"], {
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
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
    env: options.env ?? (options.homeDir ? isolatePathEnvForHomeDir(process.env) : process.env),
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
  const fileTimestamp = sanitizeSegment(receivedAt, "received-at");
  const capturePath = join(paths.captureDir, `${fileTimestamp}_${sessionId}_${eventName}.json`);

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
    enqueueClaudeHookPayload("SessionEnd", rawInput, options);
    spawnQueueDrain();
  }

  return { capturePath };
};

const finalizeClaudeSessionEnd = async (
  rawInput: string,
  options: ClaudeHookOptions = {}
): Promise<void> => {
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    payload = null;
  }

  const event = normalizeClaudeHookPayload(payload);
  if (event.eventName !== "SessionEnd" || !event.sessionId) {
    return;
  }

  const payloadRecord = payload as ClaudeHookPayload | null;
  const fallbackCwd = typeof payloadRecord?.cwd === "string" ? payloadRecord.cwd : undefined;
  const stored = loadClaudeSession(event.sessionId, options) ?? (fallbackCwd ? findClaudeSessionByCwd(fallbackCwd, options) : null);
  const resolvedSessionId = stored?.sessionId ?? event.sessionId;
  const promptContext = stored?.promptContext ?? recoverClaudePromptContext(payloadRecord, resolvedSessionId);
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

  clearClaudeSession(resolvedSessionId, options);
  if (resolvedSessionId !== event.sessionId) {
    clearClaudeSession(event.sessionId, options);
  }
};

const processQueuedItem = async (
  item: ClaudeHookQueueItem,
  options: ClaudeHookOptions = {}
): Promise<void> => {
  if (item.event === "SessionEnd") {
    await finalizeClaudeSessionEnd(item.rawInput, options);
  }
};

export const drainClaudeHookQueue = async (
  options: ClaudeHookOptions = {}
): Promise<{ processed: number; failed: number }> => {
  const dir = queueDir(options);
  let processed = 0;
  let failed = 0;

  for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".json")).sort()) {
    const source = join(dir, file);
    const processing = join(dir, `${file}.processing`);
    try {
      renameSync(source, processing);
    } catch {
      continue;
    }

    try {
      const item = JSON.parse(readFileSync(processing, "utf8")) as ClaudeHookQueueItem;
      await processQueuedItem(item, options);
      unlinkSync(processing);
      processed += 1;
    } catch {
      failed += 1;
      try {
        renameSync(processing, join(dir, `${file}.failed`));
      } catch {
        // Keep draining unrelated queue items.
      }
    }
  }

  return { processed, failed };
};

export const runClaudeHookCommand = async (): Promise<void> => {
  if (process.argv.includes("--drain-queue")) {
    await drainClaudeHookQueue();
    return;
  }

  const rawInput = readFileSync(0, "utf8");
  const result = await processClaudeHookPayload(rawInput);
  if (result.notice) {
    process.stderr.write(`${result.notice}\n`);
  }
  if (result.hookOutput) {
    process.stdout.write(`${result.hookOutput}\n`);
  }
};
