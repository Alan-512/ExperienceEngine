import type { ExperienceCandidate, ExperienceInput, TaskType } from "../types/domain.js";

export const extractStrategies = (input: ExperienceInput): ExperienceCandidate[] => {
  if (input.task_type === "unknown" || input.outcome_signal !== "success") {
    return [];
  }

  const successfulTools = input.tool_events.filter((event) => event.status === "success").map((event) => event.tool_name);
  const toolSummary = successfulTools.length ? successfulTools.join(", ") : "targeted verification tools";

  return [
    {
      node_type: "strategy",
      scope_id: input.scope_id,
      task_type: input.task_type as TaskType,
      trigger_pattern: input.task_summary,
      compact_hint: `Reproduce first, then validate the fix with ${toolSummary} before moving on.`,
      goal: "Preserve the working debug loop",
      recommended_steps: ["Confirm the failure signature.", "Apply the smallest fix that addresses the signature."],
      success_signal: "Verification tool output confirms the issue is resolved.",
      evidence_summary: `Successful run captured from ${Math.max(successfulTools.length, 1)} tool event(s).`,
      source_kind: "system_derived"
    }
  ];
};

