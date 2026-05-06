import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCodexBehaviorLoop } from "../../adapters/codex/mcp-server.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";

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

export const handleCodexHookPayload = async (
  payload: CodexHookPayload,
  behaviorLoop: CodexBehaviorLoop = createCodexBehaviorLoop()
): Promise<Record<string, unknown>> => {
  switch (payload.hook_event_name) {
    case "UserPromptSubmit":
      return runUserPromptSubmit(payload, behaviorLoop);
    case "PreToolUse":
      return runPreToolUse(payload, behaviorLoop);
    case "PostToolUse":
      return runPostToolUse(payload, behaviorLoop);
    case "Stop":
      return runStop(payload, behaviorLoop);
    default:
      return {};
  }
};

export const runCodexHookCommand = async (): Promise<void> => {
  try {
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
