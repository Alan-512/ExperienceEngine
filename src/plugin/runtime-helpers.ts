import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import type { HostPromptContext, HostToolResult } from "../types/plugin.js";
import { normalizeWhitespace, truncate } from "../utils/text.js";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const readString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const readNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
};

const summarizeUnknown = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return truncate(normalizeWhitespace(value), 240);
  }

  if (Array.isArray(value) || isRecord(value)) {
    return truncate(JSON.stringify(value), 240);
  }

  return undefined;
};

const readNested = (payload: UnknownRecord, path: string[]): unknown => {
  let current: unknown = payload;
  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
};

const pathExists = (path: string): boolean => {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
};

const discoverProjectRoot = (path: string): string => {
  let current = resolve(path);
  const root = parse(current).root;

  while (current !== root) {
    if (
      pathExists(join(current, ".git")) ||
      pathExists(join(current, "AGENTS.md")) ||
      pathExists(join(current, "package.json")) ||
      pathExists(join(current, "openspec"))
    ) {
      return current;
    }

    current = dirname(current);
  }

  return path;
};

const isOpenClawGlobalWorkspace = (path: string): boolean => /(^|[/\\])\.openclaw[/\\]workspace[/\\]?$/.test(path);

const sanitizeScopeSegment = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "global";

const isolateUnresolvedOpenClawWorkspace = (workspacePath: string, payload: UnknownRecord): string =>
  `${workspacePath.replace(/[\\/]+$/, "")}/.experienceengine-unscoped/${sanitizeScopeSegment(extractSessionKey(payload))}`;

const resolvePromptCwd = (payload: UnknownRecord): string | undefined => {
  const explicitProjectRoot = readString(
    payload.projectRoot,
    payload.repoRoot,
    payload.projectDir,
    payload.projectPath,
    payload.rootPath,
    readNested(payload, ["project", "root"]),
    readNested(payload, ["repo", "root"]),
    readNested(payload, ["repository", "root"]),
    readNested(payload, ["workspace", "projectRoot"]),
    readNested(payload, ["context", "projectRoot"]),
    readNested(payload, ["context", "repoRoot"]),
    readNested(payload, ["context", "projectDir"]),
    readNested(payload, ["context", "project", "root"]),
    readNested(payload, ["context", "repo", "root"])
  );

  if (explicitProjectRoot) {
    return explicitProjectRoot;
  }

  const workspacePath = readString(
    payload.cwd,
    payload.workspaceDir,
    payload.workspacePath,
    readNested(payload, ["workspace", "cwd"]),
    readNested(payload, ["context", "cwd"]),
    readNested(payload, ["context", "workspaceDir"])
  );

  if (!workspacePath) {
    return undefined;
  }

  const discoveredRoot = pathExists(workspacePath) ? discoverProjectRoot(workspacePath) : workspacePath;
  if (discoveredRoot === workspacePath && isOpenClawGlobalWorkspace(workspacePath)) {
    return isolateUnresolvedOpenClawWorkspace(workspacePath, payload);
  }

  return discoveredRoot;
};

const extractContentText = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const text = value
    .flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }

      const blockText = readString(item.text, readNested(item, ["content", "text"]));
      return blockText ? [blockText] : [];
    })
    .join("\n")
    .trim();

  return text || undefined;
};

const extractMessages = (payload: UnknownRecord): unknown[] => {
  if (Array.isArray(payload.messages)) {
    return payload.messages;
  }

  const nested = readNested(payload, ["payload", "messages"]);
  return Array.isArray(nested) ? nested : [];
};

const summarizePriorMessages = (payload: UnknownRecord): string | undefined => {
  const messages = extractMessages(payload).filter(isRecord);
  if (messages.length === 0) {
    return undefined;
  }

  const userMessages = messages
    .filter((message) => readString(message.role, message.author) === "user")
    .map((message) => readString(message.content, message.text, readNested(message, ["content", "text"])) ?? extractContentText(message.content))
    .filter((message): message is string => Boolean(message));

  const assistantMessages = messages
    .filter((message) => readString(message.role, message.author) === "assistant")
    .map((message) => extractContentText(message.content) ?? readString(message.content, message.text))
    .filter((message): message is string => Boolean(message))
    .filter((message) => !/^I('|’)ll\b/i.test(message));

  const parts: string[] = [];
  const lastUser = userMessages.at(-1);
  const lastAssistant = assistantMessages.at(-1);

  if (!lastAssistant && userMessages.length < 2) {
    return undefined;
  }

  if (lastUser) {
    parts.push(`Previous user request: ${truncate(normalizeWhitespace(lastUser), 240)}`);
  }

  if (lastAssistant) {
    parts.push(`Previous assistant summary: ${truncate(normalizeWhitespace(lastAssistant), 240)}`);
  }

  return parts.length > 0 ? parts.join("\n") : undefined;
};

const normalizeToolStatus = (...values: unknown[]): HostToolResult["status"] => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    if (["success", "completed", "complete", "ok", "passed"].includes(normalized)) {
      return "success";
    }

    if (["failure", "failed", "error", "errored"].includes(normalized)) {
      return "failure";
    }

    if (normalized === "unknown") {
      return "unknown";
    }
  }

  return undefined;
};

const extractMessageText = (payload: UnknownRecord): string | undefined => {
  const direct = readString(
    payload.userMessage,
    payload.prompt,
    readNested(payload, ["payload", "prompt"]),
    payload.message,
    readNested(payload, ["message", "content"]),
    readNested(payload, ["message", "text"]),
    readNested(payload, ["input", "text"])
  ) ?? extractContentText(readNested(payload, ["message", "content"]));

  if (direct) {
    return direct;
  }

  const messages = extractMessages(payload);
  if (messages.length === 0) {
    return undefined;
  }

  const lastUser = [...messages]
    .reverse()
    .find((item) => isRecord(item) && readString(item.role, item.author) === "user");

  if (!isRecord(lastUser)) {
    return undefined;
  }

  return (
    readString(lastUser.content, lastUser.text, readNested(lastUser, ["content", "text"])) ??
    extractContentText(lastUser.content)
  );
};

export const extractSessionKey = (payload: unknown): string => {
  if (!isRecord(payload)) {
    return "global";
  }

  return (
    readString(
      payload.sessionKey,
      payload.sessionId,
      readNested(payload, ["session", "key"]),
      readNested(payload, ["session", "id"]),
      readNested(payload, ["context", "sessionId"]),
      readNested(payload, ["context", "sessionKey"]),
      readNested(payload, ["context", "session", "key"])
    ) ?? "global"
  );
};

export const mergeHookPayload = (payload: unknown, context?: unknown): UnknownRecord => {
  const merged: UnknownRecord = {};

  if (isRecord(payload)) {
    Object.assign(merged, payload);
  }

  if (isRecord(context)) {
    Object.assign(merged, context);
  }

  return merged;
};

export const normalizePromptPayload = (payload: unknown): HostPromptContext => {
  if (!isRecord(payload)) {
    return { userMessage: "" };
  }

  return {
    sessionId: extractSessionKey(payload),
    cwd: resolvePromptCwd(payload),
    userMessage: extractMessageText(payload) ?? "",
    taskSummary: readString(
      payload.taskSummary,
      payload.summary,
      readNested(payload, ["task", "summary"]),
      extractMessageText(payload)
    ),
    contextSummary: readString(
      payload.contextSummary,
      readNested(payload, ["context", "summary"]),
      readNested(payload, ["compaction", "summary"]),
      readNested(payload, ["workingContext", "summary"]),
      summarizePriorMessages(payload)
    )
  };
};

export const normalizeToolPayload = (payload: unknown): HostToolResult | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const toolResultMessage =
    readString(payload.role) === "toolResult"
      ? payload
      : isRecord(payload.message) && readString(payload.message.role) === "toolResult"
        ? payload.message
        : null;

  if (toolResultMessage) {
    const messageText =
      extractContentText(toolResultMessage.content) ??
      readString(readNested(toolResultMessage, ["details", "aggregated"]));

    return {
      sessionId: extractSessionKey(payload),
      toolCallId: readString(payload.toolCallId, toolResultMessage.toolCallId, toolResultMessage.id),
      toolName: readString(payload.toolName, toolResultMessage.toolName, toolResultMessage.name) ?? "unknown-tool",
      outputSummary: summarizeUnknown(messageText),
      exitCode: readNumber(payload.exitCode, readNested(toolResultMessage, ["details", "exitCode"])),
      errorSignature: readString(
        payload.errorSignature,
        toolResultMessage.error,
        readNested(toolResultMessage, ["details", "error"]),
        toolResultMessage.isError ? messageText : undefined
      ),
      status:
        normalizeToolStatus(payload.status, readNested(toolResultMessage, ["details", "status"])) ??
        (toolResultMessage.isError === true ? "failure" : undefined),
      startedAt: readString(payload.startedAt, toolResultMessage.startedAt, readNested(toolResultMessage, ["details", "startedAt"])),
      endedAt: readString(payload.endedAt, toolResultMessage.endedAt, readNested(toolResultMessage, ["details", "endedAt"]))
    };
  }

  const toolName = readString(
    payload.toolName,
    payload.name,
    readNested(payload, ["tool", "name"]),
    readNested(payload, ["result", "toolName"])
  );

  if (!toolName) {
    return null;
  }

  const exitCode = readNumber(payload.exitCode, readNested(payload, ["result", "exitCode"]));
  const success = payload.success;
  const status =
    normalizeToolStatus(payload.status, readNested(payload, ["message", "details", "status"])) ??
    (typeof success === "boolean" ? (success ? "success" : "failure") : undefined);

  return {
    sessionId: extractSessionKey(payload),
    toolCallId: readString(
      payload.toolCallId,
      readNested(payload, ["result", "toolCallId"]),
      readNested(payload, ["message", "toolCallId"])
    ),
    toolName,
    inputSummary: summarizeUnknown(payload.inputSummary ?? payload.args ?? readNested(payload, ["tool", "args"])),
    outputSummary: summarizeUnknown(
      payload.outputSummary ??
        readNested(payload, ["message", "details", "aggregated"]) ??
        extractContentText(readNested(payload, ["message", "content"])) ??
        payload.result ??
        readNested(payload, ["output", "summary"])
    ),
    exitCode: readNumber(exitCode, readNested(payload, ["message", "details", "exitCode"])),
    errorSignature: readString(
      payload.errorSignature,
      payload.error,
      readNested(payload, ["message", "error"]),
      readNested(payload, ["message", "details", "error"]),
      readNested(payload, ["result", "error"]),
      readNested(payload, ["error", "message"])
    ),
    status:
      status === "success" || status === "failure" || status === "unknown"
        ? status
        : undefined,
    startedAt: readString(payload.startedAt, readNested(payload, ["timing", "startedAt"])),
    endedAt: readString(payload.endedAt, readNested(payload, ["timing", "endedAt"]))
  };
};

export const extractToolResultsFromPayload = (payload: unknown): HostToolResult[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const messages = extractMessages(payload);

  return messages
    .filter((message): message is UnknownRecord => isRecord(message) && readString(message.role) === "toolResult")
    .map((message) => normalizeToolPayload(message))
    .filter((message): message is HostToolResult => Boolean(message));
};

export const applyInjectionToPayload = (payload: unknown, text: string): unknown => {
  if (!isRecord(payload) || !text.trim()) {
    return payload;
  }

  const existing = payload.prependContext;
  if (Array.isArray(existing)) {
    existing.unshift(text);
    return payload;
  }

  if (typeof existing === "string" && existing.trim()) {
    payload.prependContext = `${text}\n\n${existing}`;
    return payload;
  }

  payload.prependContext = text;
  return payload;
};
