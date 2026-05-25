import type { TraceEvent, TraceEventSource } from "../types/domain.js";
import { redactSecrets } from "../utils/redaction.js";
import { hashText } from "../utils/hashing.js";

/**
 * Safely stringifies and redacts secret-like values from any input type.
 * Resilient against circular structures, BigInt types, and prevents info loss on Error objects.
 */
const redactAny = (val: any): string => {
  if (val === null || val === undefined) return "";

  // 1. Explicitly handle Error instances to avoid losing critical message/stack info
  if (val instanceof Error) {
    const errorMsg = `${val.name}: ${val.message}${val.stack ? `\n${val.stack}` : ""}`;
    return redactSecrets(errorMsg);
  }

  let str: string;
  try {
    // 2. Safe stringification try block
    str = typeof val === "object" ? JSON.stringify(val, (key, value) => typeof value === "bigint" ? value.toString() : value) : String(val);
  } catch (err) {
    // 3. Resilient fallback for circular references, BigInt, or Symbol types
    try {
      str = String(val);
    } catch {
      str = "[Unserializable Object]";
    }
  }

  return redactSecrets(str);
};

/**
 * Checks if a given tool/command represents a verification tool (test runner, linter, type checker).
 */
const isVerificationTool = (name: string, args: string): boolean => {
  const lowerName = String(name || "").toLowerCase();
  const lowerArgs = String(args || "").toLowerCase();
  return (
    lowerName.includes("test") ||
    lowerName.includes("lint") ||
    lowerName.includes("typecheck") ||
    lowerName.includes("vitest") ||
    lowerName.includes("jest") ||
    lowerName.includes("playwright") ||
    lowerName.includes("eslint") ||
    lowerName.includes("tsc") ||
    lowerArgs.includes("vitest") ||
    lowerArgs.includes("jest") ||
    lowerArgs.includes("playwright") ||
    lowerArgs.includes("eslint") ||
    lowerArgs.includes("tsc") ||
    lowerArgs.includes("test") ||
    lowerArgs.includes("lint")
  );
};

/**
 * Checks if a tool is a known file editor that represents a file change event.
 */
const isFileEditorTool = (name: string): boolean => {
  const lower = String(name || "").toLowerCase();
  return (
    lower.includes("write_file") ||
    lower.includes("replace_file") ||
    lower.includes("apply_patch") ||
    lower.includes("edit_file") ||
    lower.includes("multi_replace") ||
    lower.includes("str_replace_editor") ||
    lower.includes("create_file") ||
    lower.includes("save_file") ||
    lower.includes("delete_file")
  );
};

const getExitCode = (raw: any): number | undefined => {
  if (!raw) return undefined;
  if (typeof raw.exit_code === "number") return raw.exit_code;
  if (typeof raw.exitCode === "number") return raw.exitCode;
  return undefined;
};

/**
 * Extracts a robust timestamp from a raw event.
 */
const getRobustTimestamp = (raw: any): string => {
  return raw?.timestamp || raw?.capturedAt || raw?.ts || raw?.time || new Date().toISOString();
};

/**
 * Generates a deterministic fallback event ID.
 */
const getDeterministicId = (host: string, eventType: string, timestamp: string, raw: any): string => {
  if (raw?.id) return String(raw.id);
  const triggerText = raw?.toolName || raw?.eventName || raw?.type || raw?.message || "";
  const hash = hashText(`${eventType}_${timestamp}_${triggerText}`).slice(0, 12);
  return `${host}_ev_${hash}`;
};

/**
 * Normalizes a raw Claude Code hook event into a standard TraceEvent.
 */
export const normalizeClaudeEvent = (raw: any): TraceEvent => {
  if (!raw) {
    raw = {};
  }

  const eventName = String(raw.eventName || raw.event || "unknown").toLowerCase();
  let event_type: TraceEvent["event_type"] = "other";
  const payload: Record<string, any> = {};

  const source: TraceEventSource = {
    host: "claude-code",
    source_hook: raw.eventName || "unknown",
    adapter_version: "0.4.2",
    is_unstable: false
  };

  const timestamp = getRobustTimestamp(raw);

  const toolName = raw.toolName || "";
  const toolArgs = raw.toolInputSummary || "";

  if (eventName.includes("prompt") || eventName.includes("user_submit")) {
    event_type = "prompt";
    payload.prompt = redactAny(raw.promptText || raw.message || "");
  } else if (eventName.includes("correction") || eventName.includes("user_correction")) {
    event_type = "correction";
    payload.prompt = redactAny(raw.promptText || raw.message || "");
  } else if (eventName.includes("beforetooluse") || eventName.includes("tool_call")) {
    event_type = isVerificationTool(toolName, toolArgs) ? "verification" : "tool_call";
    payload.tool_call_id = raw.toolCallId || raw.id || "call_unknown";
    payload.tool_name = toolName || "unknown";
    payload.arguments = redactAny(toolArgs);
  } else if (eventName.includes("posttoolusesuccess") || eventName.includes("tool_success")) {
    if (isVerificationTool(toolName, toolArgs)) {
      event_type = "verification";
      payload.status = "success";
    } else if (isFileEditorTool(toolName)) {
      event_type = "file_change";
      payload.file_path = raw.filePath || raw.path || toolArgs || "";
      payload.action = raw.action || "write";
      payload.status = "success";
    } else {
      event_type = "tool_result";
      payload.status = "success";
    }
    payload.tool_call_id = raw.toolCallId || raw.id || "call_unknown";
    payload.result = redactAny(raw.toolOutputSummary || "");
  } else if (eventName.includes("posttoolusefailure") || eventName.includes("tool_failure")) {
    event_type = isVerificationTool(toolName, toolArgs) ? "verification" : "tool_failure";
    payload.tool_call_id = raw.toolCallId || raw.id || "call_unknown";
    payload.status = "failure";
    payload.error = redactAny(raw.toolOutputSummary || "Tool execution failed");
    payload.exit_code = getExitCode(raw) ?? 1;
  } else if (eventName.includes("file") || eventName.includes("write") || eventName.includes("edit")) {
    event_type = "file_change";
    payload.file_path = raw.filePath || raw.path || "";
    payload.action = raw.action || "write";
  } else if (eventName === "stop" || eventName === "session_end" || eventName === "done") {
    event_type = "task_completion";
    payload.reason = redactAny(raw.reason || "completed");
  } else if (eventName.includes("stop_failure") || eventName.includes("cancel")) {
    event_type = "stop_failure";
    payload.error = redactAny(raw.error || "Stop execution failed");
  }

  const id = getDeterministicId("claude", event_type, timestamp, raw);

  return {
    id,
    event_type,
    timestamp,
    source,
    payload
  };
};

/**
 * Normalizes a raw Codex event/hook into a standard TraceEvent.
 */
export const normalizeCodexEvent = (raw: any): TraceEvent => {
  if (!raw) {
    raw = {};
  }

  const eventType = String(raw.type || raw.event || "unknown").toLowerCase();
  let event_type: TraceEvent["event_type"] = "other";
  const payload: Record<string, any> = {};

  const source: TraceEventSource = {
    host: "codex",
    source_hook: raw.type || "unknown",
    adapter_version: "0.4.2",
    is_unstable: false
  };

  const timestamp = getRobustTimestamp(raw);

  const toolName = raw.toolName || raw.name || "";
  const toolArgs = raw.arguments || raw.args || "";

  if (eventType === "prompt" || eventType === "userpromptsubmit") {
    event_type = "prompt";
    payload.prompt = redactAny(raw.prompt || raw.message || "");
  } else if (eventType === "correction" || eventType === "user_correction") {
    event_type = "correction";
    payload.prompt = redactAny(raw.prompt || raw.message || "");
  } else if (eventType === "tool_call" || eventType === "pretooluse") {
    event_type = isVerificationTool(toolName, toolArgs) ? "verification" : "tool_call";
    payload.tool_call_id = raw.toolCallId || raw.callId || raw.id || "call_unknown";
    payload.tool_name = toolName || "unknown";
    payload.arguments = redactAny(toolArgs);
  } else if (eventType === "tool_result" || eventType === "posttooluse") {
    const exitCodeVal = getExitCode(raw) ?? 0;
    const isFail = raw.status === "failure" || exitCodeVal > 0 || raw.error;
    
    if (isVerificationTool(toolName, toolArgs)) {
      event_type = "verification";
      payload.status = isFail ? "failure" : "success";
    } else if (!isFail && isFileEditorTool(toolName)) {
      event_type = "file_change";
      payload.file_path = raw.filePath || raw.path || toolArgs || "";
      payload.action = raw.action || "write";
    } else {
      event_type = isFail ? "tool_failure" : "tool_result";
    }

    payload.tool_call_id = raw.toolCallId || raw.callId || raw.id || "call_unknown";
    if (isFail) {
      payload.error = redactAny(raw.error || raw.output || "Execution failed");
      payload.exit_code = getExitCode(raw) ?? 1;
    } else {
      payload.result = redactAny(raw.result || raw.output || "");
    }
  } else if (eventType === "permission_request" || eventType === "ask_permission") {
    event_type = "permission_request";
    payload.permission = raw.permission || "";
    payload.action = raw.action || "request";
  } else if (eventType === "subagent_lifecycle" || eventType === "subagent") {
    event_type = "subagent_lifecycle";
    payload.subagent_id = raw.subagentId || "";
    payload.action = raw.action || "invoke";
  } else if (eventType === "compaction" || eventType === "context_compaction") {
    event_type = "compaction";
    payload.before_size = raw.beforeSize || 0;
    payload.after_size = raw.afterSize || 0;
  } else if (eventType === "stop" || eventType === "finalize") {
    event_type = "stop";
    payload.reason = redactAny(raw.reason || "completed");
  }

  // Include best-effort transcript enrichment metadata if present (Task 4.2 & 4.5)
  if (raw.transcriptPath) {
    payload.transcript_path = raw.transcriptPath;
    source.is_unstable = true; 
  }

  const id = getDeterministicId("codex", event_type, timestamp, raw);

  return {
    id,
    event_type,
    timestamp,
    source,
    payload
  };
};

/**
 * Normalizes a raw Antigravity invocation/step event into a standard TraceEvent.
 */
export const normalizeAntigravityEvent = (raw: any): TraceEvent => {
  if (!raw) {
    raw = {};
  }

  const eventName = String(raw.name || raw.event || "unknown").toLowerCase();
  let event_type: TraceEvent["event_type"] = "other";
  const payload: Record<string, any> = {};

  const source: TraceEventSource = {
    host: "antigravity",
    source_hook: raw.name || "unknown",
    adapter_version: "0.4.2",
    is_unstable: false
  };

  const timestamp = getRobustTimestamp(raw);

  const toolName = raw.toolName || "";
  const toolArgs = raw.arguments || raw.args || "";

  if (eventName === "invocation" || eventName === "prompt") {
    event_type = "prompt";
    payload.prompt = redactAny(raw.prompt || "");
  } else if (eventName === "correction" || eventName === "user_correction") {
    event_type = "correction";
    payload.prompt = redactAny(raw.prompt || "");
  } else if (eventName === "tool_call" || eventName === "step_call") {
    event_type = isVerificationTool(toolName, toolArgs) ? "verification" : "tool_call";
    payload.tool_call_id = raw.toolCallId || raw.id || `call_${raw.stepIndex || "unknown"}`;
    payload.tool_name = toolName || "unknown";
    payload.arguments = redactAny(toolArgs);
    payload.step_index = raw.stepIndex;
  } else if (eventName === "tool_result" || eventName === "step_result") {
    const exitCodeVal = getExitCode(raw) ?? 0;
    const isFail = raw.status === "failure" || exitCodeVal > 0 || raw.error;
    
    if (isVerificationTool(toolName, toolArgs)) {
      event_type = "verification";
      payload.status = isFail ? "failure" : "success";
    } else if (!isFail && isFileEditorTool(toolName)) {
      event_type = "file_change";
      payload.file_path = raw.filePath || raw.path || toolArgs || "";
      payload.action = raw.action || "write";
    } else {
      event_type = isFail ? "tool_failure" : "tool_result";
    }

    payload.tool_call_id = raw.toolCallId || raw.id || `call_${raw.stepIndex || "unknown"}`;
    payload.status = isFail ? "failure" : "success";
    if (isFail) {
      payload.error = redactAny(raw.error || "Execution failed");
      payload.exit_code = getExitCode(raw) ?? 1;
    } else {
      payload.result = redactAny(raw.result || "");
    }
    payload.step_index = raw.stepIndex;
  } else if (eventName === "stop" || eventName === "complete") {
    event_type = "stop";
    payload.reason = redactAny(raw.reason || "completed");
  }

  // Handle transcript and artifact path metadata (Task 4.3 & 4.5)
  if (raw.transcriptPath) {
    payload.transcript_path = raw.transcriptPath;
    source.is_unstable = true;
  }
  if (raw.artifactPath) {
    payload.artifact_path = raw.artifactPath;
    // Overwrite event type only if it is generic, preserving completions (Finding 3)
    if (event_type === "other" || event_type === "tool_result") {
      event_type = "file_change";
      payload.file_path = raw.artifactPath;
      payload.action = "write";
    }
  }

  const id = getDeterministicId("antigravity", event_type, timestamp, raw);

  return {
    id,
    event_type,
    timestamp,
    source,
    payload
  };
};

/**
 * Normalizes a raw OpenClaw event into a standard TraceEvent.
 */
export const normalizeOpenClawEvent = (raw: any): TraceEvent => {
  if (!raw) {
    raw = {};
  }

  const eventName = String(raw.event || raw.type || "unknown").toLowerCase();
  let event_type: TraceEvent["event_type"] = "other";
  const payload: Record<string, any> = {};

  const source: TraceEventSource = {
    host: "openclaw",
    source_hook: raw.event || "unknown",
    adapter_version: "0.4.2",
    is_unstable: false
  };

  const timestamp = getRobustTimestamp(raw);

  const toolName = raw.toolName || "";
  const toolArgs = raw.arguments || "";

  if (eventName === "message" || eventName === "prompt_built") {
    event_type = "prompt";
    payload.prompt = redactAny(raw.message || raw.prompt || "");
  } else if (eventName === "correction" || eventName === "user_correction") {
    event_type = "correction";
    payload.prompt = redactAny(raw.message || raw.prompt || "");
  } else if (eventName === "tool_call") {
    event_type = isVerificationTool(toolName, toolArgs) ? "verification" : "tool_call";
    payload.tool_call_id = raw.toolCallId || raw.id || "call_unknown";
    payload.tool_name = toolName || "unknown";
    payload.arguments = redactAny(toolArgs);
  } else if (eventName === "tool_result" || eventName === "tool_event") {
    const exitCodeVal = getExitCode(raw) ?? 0;
    const isFail = raw.status === "failure" || exitCodeVal > 0 || raw.error;
    
    if (isVerificationTool(toolName, toolArgs)) {
      event_type = "verification";
      payload.status = isFail ? "failure" : "success";
    } else if (!isFail && isFileEditorTool(toolName)) {
      event_type = "file_change";
      payload.file_path = raw.filePath || raw.path || toolArgs || "";
      payload.action = raw.action || "write";
    } else {
      event_type = isFail ? "tool_failure" : "tool_result";
    }

    payload.tool_call_id = raw.toolCallId || raw.id || "call_unknown";
    payload.status = isFail ? "failure" : "success";
    if (isFail) {
      payload.error = redactAny(raw.error || "Tool failed");
      payload.exit_code = getExitCode(raw) ?? 1;
    } else {
      payload.result = redactAny(raw.result || "");
    }
  } else if (eventName === "stop" || eventName === "finalize_task") {
    event_type = "task_completion";
    payload.reason = redactAny(raw.reason || "completed");
  }

  const id = getDeterministicId("openclaw", event_type, timestamp, raw);

  return {
    id,
    event_type,
    timestamp,
    source,
    payload
  };
};
