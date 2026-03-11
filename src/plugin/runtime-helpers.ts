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

const extractMessageText = (payload: UnknownRecord): string | undefined => {
  const direct = readString(
    payload.userMessage,
    payload.prompt,
    payload.message,
    readNested(payload, ["message", "content"]),
    readNested(payload, ["message", "text"]),
    readNested(payload, ["input", "text"])
  );

  if (direct) {
    return direct;
  }

  const messages = payload.messages;
  if (!Array.isArray(messages)) {
    return undefined;
  }

  const lastUser = [...messages]
    .reverse()
    .find((item) => isRecord(item) && readString(item.role, item.author) === "user");

  if (!isRecord(lastUser)) {
    return undefined;
  }

  return readString(lastUser.content, lastUser.text, readNested(lastUser, ["content", "text"]));
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
      readNested(payload, ["context", "sessionKey"]),
      readNested(payload, ["context", "session", "key"])
    ) ?? "global"
  );
};

export const normalizePromptPayload = (payload: unknown): HostPromptContext => {
  if (!isRecord(payload)) {
    return { userMessage: "" };
  }

  return {
    sessionId: extractSessionKey(payload),
    cwd: readString(
      payload.cwd,
      payload.workspacePath,
      readNested(payload, ["workspace", "cwd"]),
      readNested(payload, ["context", "cwd"]),
      readNested(payload, ["repo", "root"])
    ),
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
      readNested(payload, ["workingContext", "summary"])
    )
  };
};

export const normalizeToolPayload = (payload: unknown): HostToolResult | null => {
  if (!isRecord(payload)) {
    return null;
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
    typeof payload.status === "string"
      ? payload.status
      : typeof success === "boolean"
        ? success
          ? "success"
          : "failure"
        : undefined;

  return {
    toolName,
    inputSummary: summarizeUnknown(payload.inputSummary ?? payload.args ?? readNested(payload, ["tool", "args"])),
    outputSummary: summarizeUnknown(
      payload.outputSummary ?? payload.result ?? readNested(payload, ["output", "summary"])
    ),
    exitCode,
    errorSignature: readString(
      payload.errorSignature,
      payload.error,
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
