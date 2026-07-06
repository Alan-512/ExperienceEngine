import { normalizeToolResult } from "../plugin/hooks/tool-result-persist.js";
import { extractToolResultsFromPayload } from "../plugin/runtime-helpers.js";
import type { ToolEvent } from "../types/domain.js";
import type { HostToolResult } from "../types/plugin.js";

export type ToolEventSessionState = {
  toolEvents: ToolEvent[];
  toolEventKeys: Set<string>;
};

export type ToolEventRecoveryRuntimeOptions<TSession extends ToolEventSessionState> = {
  getSession: (sessionId: string) => TSession;
};

const buildToolEventKey = (toolEvent: ToolEvent, toolCallId?: string): string =>
  toolCallId ??
  [
    toolEvent.tool_name,
    toolEvent.status,
    toolEvent.exit_code ?? "",
    toolEvent.error_signature ?? "",
    toolEvent.output_summary ?? "",
    toolEvent.ended_at ?? ""
  ].join(":");

export class ToolEventRecoveryRuntime<TSession extends ToolEventSessionState> {
  private readonly orphanToolEvents = new Map<string, ToolEvent>();

  constructor(private readonly options: ToolEventRecoveryRuntimeOptions<TSession>) {}

  append(sessionId: string, toolEvent: ToolEvent, toolCallId?: string): void {
    const session = this.options.getSession(sessionId);
    const key = buildToolEventKey(toolEvent, toolCallId);

    if (session.toolEventKeys.has(key)) {
      return;
    }

    session.toolEventKeys.add(key);
    session.toolEvents.push(toolEvent);
  }

  recover(sessionId: string, payload: unknown): void {
    for (const toolResult of extractToolResultsFromPayload(payload)) {
      const recoveredEvent = toolResult.toolCallId
        ? this.orphanToolEvents.get(toolResult.toolCallId)
        : undefined;
      const nextEvent = recoveredEvent ?? normalizeToolResult(toolResult);
      this.append(sessionId, nextEvent, toolResult.toolCallId);

      if (toolResult.toolCallId) {
        this.orphanToolEvents.delete(toolResult.toolCallId);
      }
    }
  }

  recordPersistedToolResult(input: {
    sessionId: string;
    result: HostToolResult;
    normalizedToolEvent: ToolEvent;
  }): void {
    if (input.sessionId !== "global") {
      this.append(input.sessionId, input.normalizedToolEvent, input.result.toolCallId);
      return;
    }

    if (input.result.toolCallId) {
      this.orphanToolEvents.set(input.result.toolCallId, input.normalizedToolEvent);
    }
  }
}
