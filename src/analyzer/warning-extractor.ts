import { buildExtractionEvidence, summarizeTaskFamily } from "./extraction-evidence.js";
import type { ExperienceCandidateDraft, ExperienceInput, TaskType } from "../types/domain.js";

const buildWarningHint = (taskType: TaskType, failureTool: string, failureSignature: string, familyLabel: string): string => {
  switch (taskType) {
    case "test_debug":
      return `Do not rerun ${failureTool} unchanged while ${failureSignature}; narrow the failing assertion before editing more code.`;
    case "build_debug":
      return `Do not keep broadening the fix while ${failureTool} still reports ${failureSignature}; isolate the first compile breakage before moving on.`;
    case "integration_fix":
      return `Do not keep pushing the same ${familyLabel} path while ${failureTool} still reports ${failureSignature}; isolate the failing boundary first.`;
    case "feature_add":
      return `Do not expand the ${familyLabel} while ${failureTool} still reports ${failureSignature}; land a smaller verified slice first.`;
    case "refactor":
      return `Do not continue the ${familyLabel} while ${failureTool} still reports ${failureSignature}; restore the last stable seam before more cleanup.`;
    case "performance":
      return `Do not keep tuning the ${familyLabel} blindly while ${failureTool} still reports ${failureSignature}; re-establish a measurement baseline first.`;
    case "bug_fix":
      return `Do not continue the same fix path while ${failureTool} still reports ${failureSignature}; isolate the concrete failing signature first.`;
    case "general":
    default:
      return `Do not keep iterating on the same coding path while ${failureTool} still reports ${failureSignature}; narrow the concrete failure first.`;
  }
};

const buildAvoidSteps = (failureTool: string, familyLabel: string): string[] => [
  `Avoid rerunning ${failureTool} unchanged more than once.`,
  `Avoid broad edits before isolating the failing ${familyLabel}.`
];

export const extractWarnings = (input: ExperienceInput): ExperienceCandidateDraft[] => {
  if (input.task_type === "unknown" || input.outcome_signal !== "failure") {
    return [];
  }

  const evidence = buildExtractionEvidence(input);
  if (!evidence) {
    return [];
  }

  const familyLabel = summarizeTaskFamily(evidence.taskType);
  const failureTool = evidence.primaryFailureTool ?? "the current path";
  const failureSignature = evidence.primaryFailureSignature ?? "the same unresolved failure";
  const hint = buildWarningHint(evidence.taskType, failureTool, failureSignature, familyLabel);

  return [
    {
      node_type: "warning",
      scope_id: input.scope_id,
      task_type: input.task_type as TaskType,
      trigger_pattern: input.task_summary,
      compact_hint: hint,
      applicability_notes: `Use when the task is still on the same ${familyLabel} and ${failureTool} remains the failing checkpoint.`,
      avoid_steps: buildAvoidSteps(failureTool, familyLabel),
      fallback_steps: [
        `Capture a narrower reproduction around ${failureTool}.`,
        `Change one variable in the ${familyLabel} before rerunning ${failureTool}.`
      ],
      escalation_condition: `${failureTool} repeats the same failure twice without a narrower signature.`,
      success_signal: `A narrower reproduction or a different ${familyLabel} checkpoint replaces ${failureTool}.`,
      evidence_summary: evidence.failureSummary
        ? `Terminal failure: ${evidence.failureSummary}.`
        : `Terminal failure remained on ${failureTool}.`,
      retrieval_text: [input.task_summary, familyLabel, failureTool, failureSignature].join("\n"),
      source_kind: "system_derived"
    }
  ];
};
