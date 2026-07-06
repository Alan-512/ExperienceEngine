import { normalizeToolResult } from "../plugin/hooks/tool-result-persist.js";
import type { ToolEvent } from "../types/domain.js";
import type { HostPromptContext, HostToolResult, OpenClawLogger } from "../types/plugin.js";
import type { RuntimeSessionState } from "./session-runtime.js";
import type { ToolEventRecoveryRuntime } from "./tool-event-recovery-runtime.js";
import type { TraceCaptureService } from "./trace-capture-service.js";

export type ToolResultRuntimeOptions = {
  getSession: (sessionId: string) => RuntimeSessionState;
  traceCapture: TraceCaptureService;
  toolEventRecovery: ToolEventRecoveryRuntime<RuntimeSessionState>;
  logger: OpenClawLogger;
};

export class ToolResultRuntime {
  constructor(private readonly options: ToolResultRuntimeOptions) {}

  persist(result: HostToolResult): ToolEvent {
    const normalizedToolEvent = normalizeToolResult(result);
    const sessionId = result.sessionId ?? "global";

    const session = this.options.getSession(sessionId);
    const traceContext: HostPromptContext = session.context ?? {
      host: undefined,
      sessionId,
      userMessage: ""
    };

    this.options.traceCapture.captureToolResultEvents({
      sessionId,
      session,
      context: traceContext,
      result
    });

    this.options.toolEventRecovery.recordPersistedToolResult({
      sessionId,
      result,
      normalizedToolEvent
    });

    this.options.logger.debug?.("experienceengine.tool_result_persist", {
      sessionId,
      toolName: normalizedToolEvent.tool_name,
      status: normalizedToolEvent.status,
      toolCallId: result.toolCallId
    });

    return normalizedToolEvent;
  }
}
