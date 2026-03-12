import type { HostPromptContext, HostToolResult } from "../../types/plugin.js";
import type { ClaudeNormalizedEvent } from "./hook-normalizer.js";

export const toClaudePromptContext = (
  event: ClaudeNormalizedEvent
): HostPromptContext | null => {
  if (event.eventName !== "UserPromptSubmit" || !event.promptText) {
    return null;
  }

  return {
    sessionId: event.sessionId,
    cwd: event.cwd,
    userMessage: event.promptText,
    taskSummary: event.promptText
  };
};

export const toClaudeToolResult = (event: ClaudeNormalizedEvent): HostToolResult | null => {
  if (event.eventName !== "PostToolUse" || !event.toolName) {
    return null;
  }

  return {
    sessionId: event.sessionId,
    toolName: event.toolName,
    inputSummary: event.toolInputSummary,
    outputSummary: event.toolOutputSummary,
    status: event.toolStatus
  };
};

export class ClaudeSessionProjectionState {
  private readonly latestPromptBySession = new Map<string, HostPromptContext>();

  rememberPrompt(context: HostPromptContext | null): void {
    if (!context?.sessionId) {
      return;
    }

    this.latestPromptBySession.set(context.sessionId, context);
  }

  resolveFinalizeContext(event: ClaudeNormalizedEvent): HostPromptContext | null {
    if (event.eventName !== "SessionEnd" || !event.sessionId) {
      return null;
    }

    return this.latestPromptBySession.get(event.sessionId) ?? null;
  }

  clearSession(sessionId: string | undefined): void {
    if (!sessionId) {
      return;
    }

    this.latestPromptBySession.delete(sessionId);
  }
}
