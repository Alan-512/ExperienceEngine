import { nowIso } from "../../utils/clock.js";

export type ClaudeNormalizedEvent = {
  adapter: "claude-code";
  capturedAt: string;
  sessionId?: string;
  eventName: string;
  cwd?: string;
  promptText?: string;
  toolName?: string;
  toolInputSummary?: string;
  toolOutputSummary?: string;
  toolStatus?: "success" | "failure" | "unknown";
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readString = (record: UnknownRecord | undefined, keys: string[]): string | undefined => {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const direct = asString(record[key]);
    if (direct) {
      return direct;
    }
  }

  return undefined;
};

const readNestedString = (
  record: UnknownRecord | undefined,
  parentKeys: string[],
  childKeys: string[]
): string | undefined => {
  if (!record) {
    return undefined;
  }

  for (const parentKey of parentKeys) {
    const nested = asRecord(record[parentKey]);
    const value = readString(nested, childKeys);
    if (value) {
      return value;
    }
  }

  return undefined;
};

const readPathString = (
  record: UnknownRecord | undefined,
  paths: string[][]
): string | undefined => {
  if (!record) {
    return undefined;
  }

  for (const path of paths) {
    let current: unknown = record;
    let resolved: string | undefined;

    for (let index = 0; index < path.length; index += 1) {
      const key = path[index];
      const next =
        index === 0 && current && typeof current === "object" && !Array.isArray(current)
          ? (current as UnknownRecord)[key]
          : asRecord(current)?.[key];

      if (index === path.length - 1) {
        resolved = asString(next);
      } else {
        current = next;
      }
    }

    if (resolved) {
      return resolved;
    }
  }

  return undefined;
};

const readPathBoolean = (
  record: UnknownRecord | undefined,
  paths: string[][]
): boolean | undefined => {
  if (!record) {
    return undefined;
  }

  for (const path of paths) {
    let current: unknown = record;
    let resolved: boolean | undefined;

    for (let index = 0; index < path.length; index += 1) {
      const key = path[index];
      const next =
        index === 0 && current && typeof current === "object" && !Array.isArray(current)
          ? (current as UnknownRecord)[key]
          : asRecord(current)?.[key];

      if (index === path.length - 1) {
        resolved = typeof next === "boolean" ? next : undefined;
      } else {
        current = next;
      }
    }

    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
};

const truncate = (value: string | undefined, limit = 400): string | undefined => {
  if (!value) {
    return undefined;
  }

  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
};

const resolveToolStatus = (payload: UnknownRecord | undefined): ClaudeNormalizedEvent["toolStatus"] => {
  const eventName = readString(payload, ["hook_event_name", "event_name", "event"])?.toLowerCase();
  if (eventName === "posttoolusefailure") {
    return "failure";
  }

  const value = readString(payload, ["tool_status", "status", "result"]);
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (["success", "succeeded", "ok", "completed"].includes(normalized)) {
    return "success";
  }

  if (["failure", "failed", "error", "errored"].includes(normalized)) {
    return "failure";
  }

  if (["unknown"].includes(normalized)) {
    return "unknown";
  }

  return "unknown";
};

const resolveToolOutputSummary = (payload: UnknownRecord | undefined): string | undefined => {
  const direct = readString(payload, ["tool_output", "output", "tool_response", "error"]);
  if (direct) {
    return truncate(direct);
  }

  const pathValue = readPathString(payload, [
    ["payload", "tool_result", "output"],
    ["payload", "tool_result", "content"],
    ["payload", "tool_result", "response"],
    ["payload", "error"],
    ["payload", "tool_response", "stdout"],
    ["payload", "tool_response", "stderr"],
    ["tool_result", "output"],
    ["tool_result", "content"],
    ["tool_result", "response"],
    ["error"],
    ["tool_response", "stdout"],
    ["tool_response", "stderr"]
  ]);

  return truncate(pathValue);
};

const resolveFallbackToolStatus = (
  payload: UnknownRecord | undefined
): ClaudeNormalizedEvent["toolStatus"] => {
  const eventName = readString(payload, ["hook_event_name", "event_name", "event"])?.toLowerCase();
  if (eventName === "posttoolusefailure") {
    return "failure";
  }

  const interrupted = readPathBoolean(payload, [
    ["payload", "tool_response", "interrupted"],
    ["tool_response", "interrupted"]
  ]);

  if (interrupted === true) {
    return "failure";
  }

  const hasToolResponse =
    asRecord(payload?.tool_response) !== undefined ||
    asRecord(asRecord(payload?.payload)?.tool_response) !== undefined;

  if (hasToolResponse) {
    return "success";
  }

  return undefined;
};

export const normalizeClaudeHookPayload = (payload: unknown): ClaudeNormalizedEvent => {
  const record = asRecord(payload) ?? {};
  const eventName = readString(record, ["hook_event_name", "event_name", "event"]) ?? "unknown";

  return {
    adapter: "claude-code",
    capturedAt: nowIso(),
    sessionId: readString(record, ["session_id", "sessionId"]),
    eventName,
    cwd: readString(record, ["cwd", "workspace", "workspace_path"]),
    promptText: truncate(
      readString(record, ["prompt", "user_prompt", "message"]) ??
        readNestedString(record, ["input", "payload"], ["prompt", "user_prompt", "message"])
    ),
    toolName:
      readString(record, ["tool_name", "tool"]) ??
      readNestedString(record, ["tool_input", "tool_result"], ["tool_name", "tool"]),
    toolInputSummary: truncate(
      readString(record, ["tool_input", "input"]) ??
        readPathString(record, [
          ["payload", "tool_input", "input"],
          ["payload", "tool_input", "content"],
          ["payload", "tool_input", "command"],
          ["tool_input", "input"],
          ["tool_input", "content"],
          ["tool_input", "command"]
        ])
    ),
    toolOutputSummary: resolveToolOutputSummary(record),
    toolStatus: resolveToolStatus(record) ?? resolveFallbackToolStatus(record)
  };
};
