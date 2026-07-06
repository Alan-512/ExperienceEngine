import type {
  ExperienceInput,
  InjectionEvent,
  ToolEvent,
  TraceEvent
} from "../types/domain.js";
import type { HostPromptContext } from "../types/plugin.js";
import { stableId } from "../utils/ids.js";

export type RuntimeSessionState = {
  context?: HostPromptContext;
  episodeId?: string;
  toolEvents: ToolEvent[];
  toolEventKeys: Set<string>;
  injectedNodeIds: string[];
  lastInjectionEvent?: InjectionEvent;
  traceEvents?: TraceEvent[];
};

export const mergeContext = (existing: HostPromptContext | undefined, incoming: HostPromptContext): HostPromptContext => ({
  host: incoming.host ?? existing?.host,
  sessionId: incoming.sessionId ?? existing?.sessionId,
  cwd: incoming.cwd ?? existing?.cwd,
  userMessage: incoming.userMessage || existing?.userMessage || "",
  taskSummary: incoming.taskSummary ?? existing?.taskSummary,
  contextSummary: incoming.contextSummary ?? existing?.contextSummary,
  injectedNodeIds: incoming.injectedNodeIds ?? existing?.injectedNodeIds
});

export const resolveSessionEpisodeId = (
  session: { episodeId?: string },
  sessionId: string,
  input: Pick<ExperienceInput, "scope_id" | "task_summary">
): string => {
  session.episodeId ??= stableId("episode", `${sessionId}:${input.scope_id}:${input.task_summary}`);
  return session.episodeId;
};

export class RuntimeSessionStore {
  private readonly sessions = new Map<string, RuntimeSessionState>();

  get(sessionId: string): RuntimeSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const next: RuntimeSessionState = {
      toolEvents: [],
      toolEventKeys: new Set<string>(),
      injectedNodeIds: [],
      traceEvents: []
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  reset(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  mergeContext(sessionId: string, context: HostPromptContext): RuntimeSessionState {
    const session = this.get(sessionId);
    session.context = mergeContext(session.context, context);
    return session;
  }
}
