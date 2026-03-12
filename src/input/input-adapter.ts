import type { ExperienceInput, ToolEvent } from "../types/domain.js";
import type { HostPromptContext } from "../types/plugin.js";
import { adaptContextSummary } from "./context-summary-adapter.js";
import { resolveOutcome } from "./outcome-resolver.js";
import { resolveScope } from "./scope-resolver.js";
import { resolveTaskType } from "./tasktype-resolver.js";
import { normalizeWhitespace, stripLeadingExperienceInjection, stripLeadingTimestampTag } from "../utils/text.js";

export const buildExperienceInput = (
  context: HostPromptContext,
  toolEvents: ToolEvent[] = []
): ExperienceInput => {
  const scope = resolveScope(context.cwd);
  const taskSummary = normalizeWhitespace(
    stripLeadingTimestampTag(stripLeadingExperienceInjection(context.taskSummary ?? context.userMessage))
  );

  return {
    scope_id: scope.scope_id,
    task_type: resolveTaskType(taskSummary),
    task_summary: taskSummary,
    tool_events: toolEvents,
    outcome_signal: resolveOutcome(toolEvents, context.userMessage),
    context_summary: adaptContextSummary(context.contextSummary),
    injected_node_ids: context.injectedNodeIds ?? []
  };
};
