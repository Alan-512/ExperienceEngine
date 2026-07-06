import type { HostPromptContext } from "../types/plugin.js";
import type { HygieneGovernanceQueueResult, HygieneGovernanceRuntime } from "./hygiene-governance-runtime.js";
import type { PromptDecisionPipeline } from "./prompt-decision-pipeline.js";
import type { RuntimeSessionStore } from "./session-runtime.js";
import type { TraceCaptureService } from "./trace-capture-service.js";

export type HostLifecycleRuntimeOptions = {
  sessions: RuntimeSessionStore;
  traceCapture: TraceCaptureService;
  promptDecisionPipeline: PromptDecisionPipeline;
  hygieneGovernance: HygieneGovernanceRuntime;
};

export class HostLifecycleRuntime {
  constructor(private readonly options: HostLifecycleRuntimeOptions) {}

  async signalHostEvent(context: HostPromptContext, trigger: string): Promise<{
    status: "disabled" | "queued" | "skipped";
    reason?: "not_due" | "backoff";
    scopeId?: string;
  }> {
    const sessionId = context.sessionId ?? "global";
    const session = this.options.sessions.mergeContext(sessionId, context);

    if ((trigger === "prompt_lookup" || trigger === "host_startup") && context.userMessage.trim()) {
      this.options.traceCapture.capturePromptEvent(session, context, context.userMessage);
    }

    return this.options.hygieneGovernance.queue(context, trigger);
  }

  async beforePromptBuild(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.options.sessions.mergeContext(sessionId, context);
    const mergedContext = session.context ?? context;

    this.options.traceCapture.capturePromptEvent(session, context, context.userMessage || "");
    this.options.hygieneGovernance.queue(mergedContext, "prompt_lookup");
    return this.options.promptDecisionPipeline.beforePromptBuild(context, sessionId, session);
  }
}
