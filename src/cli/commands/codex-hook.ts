import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import type { createCodexBehaviorLoop } from "../../adapters/codex/behavior-loop.js";

type CodexHookEventName = "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop" | string;

type CodexHookPayload = {
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  hook_event_name?: CodexHookEventName;
  prompt?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  last_assistant_message?: string | null;
};

type CodexBehaviorLoop = ReturnType<typeof createCodexBehaviorLoop>;
type CodexQueuedHookEvent = "PostToolUse" | "Stop";

type CodexHookQueueItem = {
  id: string;
  event: CodexQueuedHookEvent;
  payload: CodexHookPayload;
  enqueuedAt: string;
};

type CodexHookSession = {
  prompt?: string;
  cwd?: string;
  injectedNodeIds: string[];
};

const toSessionId = (payload: CodexHookPayload): string =>
  payload.turn_id || payload.session_id || "codex_hook_global";

const sessionPath = (sessionId: string): string => {
  const paths = resolveExperienceEnginePaths({ adapter: "codex" });
  const dir = join(paths.dataDir, "hook-sessions");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${sessionId.replace(/[^a-zA-Z0-9_.-]/g, "_")}.json`);
};

const queueDir = (): string => {
  const paths = resolveExperienceEnginePaths({ adapter: "codex" });
  const dir = join(paths.dataDir, "hook-queue");
  mkdirSync(dir, { recursive: true });
  return dir;
};

const readSession = (sessionId: string): CodexHookSession => {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) {
    return { injectedNodeIds: [] };
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as CodexHookSession;
  } catch {
    return { injectedNodeIds: [] };
  }
};

const writeSession = (sessionId: string, session: CodexHookSession): void => {
  writeFileSync(sessionPath(sessionId), `${JSON.stringify(session, null, 2)}\n`, "utf8");
};

const stableJson = (value: unknown): string => {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
};

const hashJson = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 16);

const codexHookTracePath = (): string | undefined => {
  const explicitPath = process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }
  if (process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE === "1") {
    const paths = resolveExperienceEnginePaths({ adapter: "codex" });
    mkdirSync(paths.dataDir, { recursive: true });
    return join(paths.dataDir, "hook-trace.jsonl");
  }
  return undefined;
};

const traceCodexHookPayload = (payload: CodexHookPayload, queued: boolean): void => {
  const tracePath = codexHookTracePath();
  if (!tracePath) {
    return;
  }

  mkdirSync(dirname(tracePath), { recursive: true });
  const event = payload.hook_event_name ?? "unknown";
  const record = {
    ts: new Date().toISOString(),
    event,
    sessionId: payload.session_id,
    turnId: payload.turn_id,
    cwd: payload.cwd,
    toolName: payload.tool_name,
    toolUseId: payload.tool_use_id,
    queued,
    fingerprint: hashJson({
      event,
      sessionId: payload.session_id,
      turnId: payload.turn_id,
      toolName: payload.tool_name,
      toolUseId: payload.tool_use_id,
      toolInput: payload.tool_input,
      toolResponse: payload.hook_event_name === "PostToolUse" ? payload.tool_response : undefined
    })
  };
  appendFileSync(tracePath, `${JSON.stringify(record)}\n`, "utf8");
};

const summarizeJson = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.slice(0, 2000);
  }

  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value).slice(0, 2000);
  }
};

const inferToolStatus = (toolResponse: unknown): "success" | "failure" | "unknown" => {
  if (!toolResponse || typeof toolResponse !== "object") {
    return "unknown";
  }

  const response = toolResponse as Record<string, unknown>;
  if (typeof response.exit_code === "number") {
    return response.exit_code === 0 ? "success" : "failure";
  }
  if (typeof response.exitCode === "number") {
    return response.exitCode === 0 ? "success" : "failure";
  }
  if (typeof response.status === "string") {
    if (response.status === "success" || response.status === "failure") {
      return response.status;
    }
  }

  return "unknown";
};

const inferExitCode = (toolResponse: unknown): number | undefined => {
  if (!toolResponse || typeof toolResponse !== "object") {
    return undefined;
  }
  const response = toolResponse as Record<string, unknown>;
  return typeof response.exit_code === "number"
    ? response.exit_code
    : typeof response.exitCode === "number"
      ? response.exitCode
      : undefined;
};

const createDefaultBehaviorLoop = async (): Promise<CodexBehaviorLoop> => {
  const { createCodexBehaviorLoop } = await import("../../adapters/codex/behavior-loop.js");
  return createCodexBehaviorLoop();
};

const enqueueHookPayload = (event: CodexQueuedHookEvent, payload: CodexHookPayload): void => {
  const id = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const item: CodexHookQueueItem = {
    id,
    event,
    payload,
    enqueuedAt: new Date().toISOString()
  };
  writeFileSync(join(queueDir(), `${id}.json`), `${JSON.stringify(item)}\n`, "utf8");
};

const spawnQueueDrain = (): void => {
  const child = spawn(process.execPath, [process.argv[1] ?? "", "codex-hook", "--drain-queue"], {
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
};

const runUserPromptSubmit = async (
  payload: CodexHookPayload,
  behaviorLoop: CodexBehaviorLoop
): Promise<Record<string, unknown>> => {
  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return {};
  }

  const lookup = await behaviorLoop.lookupHints({
    cwd: payload.cwd,
    prompt,
    sessionId: toSessionId(payload)
  });
  writeSession(toSessionId(payload), {
    prompt,
    cwd: payload.cwd,
    injectedNodeIds: lookup.injectedNodeIds
  });

  if (!lookup.text) {
    return {};
  }

  const additionalContext = [
    lookup.notice,
    "ExperienceEngine guidance:",
    lookup.text
  ].filter(Boolean).join("\n");

  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext
    }
  };
};

const runPreToolUse = async (
  payload: CodexHookPayload,
  behaviorLoop: CodexBehaviorLoop
): Promise<Record<string, unknown>> => {
  await behaviorLoop.recordToolResult({
    sessionId: toSessionId(payload),
    toolName: `pre:${payload.tool_name ?? "unknown"}`,
    inputSummary: summarizeJson(payload.tool_input),
    status: "unknown"
  });
  return {};
};

const runPostToolUse = async (
  payload: CodexHookPayload,
  behaviorLoop: CodexBehaviorLoop
): Promise<Record<string, unknown>> => {
  await behaviorLoop.recordToolResult({
    sessionId: toSessionId(payload),
    toolName: payload.tool_name ?? "unknown",
    inputSummary: summarizeJson(payload.tool_input),
    outputSummary: summarizeJson(payload.tool_response),
    exitCode: inferExitCode(payload.tool_response),
    status: inferToolStatus(payload.tool_response)
  });
  return {};
};

const runStop = async (
  payload: CodexHookPayload,
  behaviorLoop: CodexBehaviorLoop
): Promise<Record<string, unknown>> => {
  await behaviorLoop.finalizeTask({
    sessionId: toSessionId(payload),
    cwd: payload.cwd ?? readSession(toSessionId(payload)).cwd,
    prompt: readSession(toSessionId(payload)).prompt ?? "",
    contextSummary: payload.last_assistant_message ?? undefined,
    injectedNodeIds: readSession(toSessionId(payload)).injectedNodeIds
  });
  return {};
};

const processQueuedItem = async (
  item: CodexHookQueueItem,
  behaviorLoop: CodexBehaviorLoop
): Promise<void> => {
  if (item.event === "PostToolUse") {
    await runPostToolUse(item.payload, behaviorLoop);
    return;
  }
  if (item.event === "Stop") {
    await runStop(item.payload, behaviorLoop);
  }
};

export const drainCodexHookQueue = async (
  behaviorLoop?: CodexBehaviorLoop
): Promise<{ processed: number; failed: number }> => {
  const dir = queueDir();
  const loop = behaviorLoop ?? await createDefaultBehaviorLoop();
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
      const item = JSON.parse(readFileSync(processing, "utf8")) as CodexHookQueueItem;
      await processQueuedItem(item, loop);
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

export const handleCodexHookPayload = async (
  payload: CodexHookPayload,
  behaviorLoop?: CodexBehaviorLoop
): Promise<Record<string, unknown>> => {
  const willQueue = !behaviorLoop && (payload.hook_event_name === "PostToolUse" || payload.hook_event_name === "Stop");
  traceCodexHookPayload(payload, willQueue);

  switch (payload.hook_event_name) {
    case "UserPromptSubmit":
      return runUserPromptSubmit(payload, behaviorLoop ?? await createDefaultBehaviorLoop());
    case "PreToolUse":
      return runPreToolUse(payload, behaviorLoop ?? await createDefaultBehaviorLoop());
    case "PostToolUse":
      if (behaviorLoop) {
        return runPostToolUse(payload, behaviorLoop);
      }
      enqueueHookPayload("PostToolUse", payload);
      spawnQueueDrain();
      return {};
    case "Stop":
      if (behaviorLoop) {
        return runStop(payload, behaviorLoop);
      }
      enqueueHookPayload("Stop", payload);
      spawnQueueDrain();
      return {};
    default:
      return {};
  }
};

export const runCodexHookCommand = async (): Promise<void> => {
  try {
    if (process.argv.includes("--drain-queue")) {
      await drainCodexHookQueue();
      return;
    }

    const raw = readFileSync(0, "utf8");
    const payload = raw.trim() ? JSON.parse(raw) as CodexHookPayload : {};
    const output = await handleCodexHookPayload(payload);
    if (Object.keys(output).length > 0 || payload.hook_event_name === "Stop") {
      process.stdout.write(`${JSON.stringify(output)}\n`);
    }
  } catch (error) {
    process.stderr.write(`[ExperienceEngine] Codex hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
};
