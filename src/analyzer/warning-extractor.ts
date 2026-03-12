import type { ExperienceCandidate, ExperienceInput, TaskType } from "../types/domain.js";

export const extractWarnings = (input: ExperienceInput): ExperienceCandidate[] => {
  if (input.task_type === "unknown" || input.outcome_signal !== "failure") {
    return [];
  }

  const failingEvent = input.tool_events.find((event) => event.status === "failure");
  const failureSource = failingEvent?.tool_name ?? "the current debug path";
  const canonicalWarning = "Do not keep iterating on the current debug path without narrowing the failing signature first.";

  return [
    {
      node_type: "warning",
      scope_id: input.scope_id,
      task_type: input.task_type as TaskType,
      trigger_pattern: input.task_summary,
      compact_hint: canonicalWarning,
      avoid_steps: ["Avoid broad refactors before reproducing the failure.", "Avoid repeating the same failing command unchanged."],
      escalation_condition: "The same error signature appears after two unchanged attempts.",
      success_signal: "A narrowed reproduction or a different evidence-backed fix path is identified.",
      evidence_summary: `Failure evidence captured from ${failureSource}.`,
      source_kind: "system_derived"
    }
  ];
};
