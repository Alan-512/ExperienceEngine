import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import type { ExperienceInput, RetrievalContext } from "../types/domain.js";
import type { HostPromptContext } from "../types/plugin.js";

const READ_ONLY_PATTERN = /\b(read[- ]?only|do not modify|don't modify|no edits?|no changes?)\b/i;
const EXPECTATION_CORRECTION_PATTERN =
  /\b(correction|previous pass|that answer was wrong|the real issue|focused too much on|instead of)\b/i;
const MODULE_PATH_PATTERN = /(?:[A-Za-z]:)?(?:\/|\.\/)?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+/g;

const unique = (values: Array<string | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

const collectModulePaths = (parts: Array<string | undefined>): string[] => {
  const matches = parts.flatMap((part) => part?.match(MODULE_PATH_PATTERN) ?? []);
  return [...new Set(matches)].slice(0, 10);
};

export const buildRetrievalContext = (
  input: ExperienceInput,
  context: HostPromptContext
): RetrievalContext => {
  const signals = buildCandidateSignals(input);
  const combinedText = [input.task_summary, input.context_summary, context.userMessage].filter(Boolean).join("\n");
  const modulePaths = collectModulePaths([
    input.task_summary,
    input.context_summary,
    context.userMessage,
    ...input.tool_events.flatMap((event) => [event.input_summary, event.output_summary, event.error_signature])
  ]);
  const toolNames = unique(input.tool_events.map((event) => event.tool_name));
  const isReadOnly = READ_ONLY_PATTERN.test(combinedText) ? true : undefined;
  const expectationCorrectionIntent = EXPECTATION_CORRECTION_PATTERN.test(combinedText) ? true : undefined;

  return {
    scopeId: input.scope_id,
    host: context.host ?? "openclaw",
    taskType: input.task_type,
    taskSummary: input.task_summary,
    contextSummary: input.context_summary,
    toolNames,
    failureSignature: signals.failure_signature,
    outcomeSignal: input.outcome_signal,
    injectedNodeIds: input.injected_node_ids,
    isReadOnly,
    modulePaths: modulePaths.length > 0 ? modulePaths : undefined,
    expectationCorrectionIntent
  };
};
