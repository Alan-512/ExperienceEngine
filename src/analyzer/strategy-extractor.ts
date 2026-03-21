import { buildExtractionEvidence, summarizeOverlap, summarizeTaskFamily } from "./extraction-evidence.js";
import type { ExperienceCandidateDraft, ExperienceInput, TaskType } from "../types/domain.js";

const DEFAULT_VERIFICATION_TOOL = "the same verification check";

const buildStrategyHint = (taskType: TaskType, verificationTool: string, familyLabel: string): string => {
  switch (taskType) {
    case "test_debug":
      return `Reproduce the failing test with ${verificationTool}, make the smallest code change that matches the failure, then rerun ${verificationTool}.`;
    case "build_debug":
      return `Anchor the fix on the first compiler/build breakage with ${verificationTool}, clear that breakage, then rerun ${verificationTool} before touching more files.`;
    case "config_debug":
      return `Validate the provider/config path with ${verificationTool}, isolate the first routing or credential mismatch, then rerun ${verificationTool} after each targeted configuration change.`;
    case "integration_fix":
      return `Validate the failing ${familyLabel} with ${verificationTool}, narrow the broken boundary first, then rerun ${verificationTool} after each targeted fix.`;
    case "feature_add":
      return `Land the ${familyLabel} behind a narrow verification loop with ${verificationTool} before expanding the implementation surface.`;
    case "refactor":
      return `Keep the ${familyLabel} stable with ${verificationTool}, refactor in small slices, and rerun ${verificationTool} after each slice.`;
    case "performance":
      return `Measure the ${familyLabel} with ${verificationTool} before optimizing, then rerun ${verificationTool} to confirm the gain before widening the change.`;
    case "bug_fix":
      return `Reproduce the broken path with ${verificationTool}, isolate the smallest fix that addresses that path, then rerun ${verificationTool}.`;
    case "general":
    default:
      return `Use ${verificationTool} as the verification loop for this coding task, keep the change narrow, and rerun it before moving on.`;
  }
};

const buildRecommendedSteps = (
  taskSummary: string,
  verificationTool: string,
  overlap?: string,
  verificationSummary?: string
): string[] => {
  const steps = [
    `Restate the task as a single target: ${taskSummary}.`,
    `Use ${verificationTool} as the terminal verification step before and after the code change.`
  ];

  if (overlap) {
    steps.push(`Keep the edit focused on the overlapping signals: ${overlap}.`);
  }

  if (verificationSummary) {
    steps.push(`Treat this verification evidence as the pass condition: ${verificationSummary}.`);
  }

  return steps;
};

export const extractStrategies = (input: ExperienceInput): ExperienceCandidateDraft[] => {
  if (input.task_type === "unknown" || input.outcome_signal !== "success") {
    return [];
  }

  const evidence = buildExtractionEvidence(input);
  if (!evidence) {
    return [];
  }

  const verificationTool = evidence.verificationTool ?? DEFAULT_VERIFICATION_TOOL;
  const familyLabel = summarizeTaskFamily(evidence.taskType);
  const overlap = summarizeOverlap(evidence.taskSummary, evidence.terminalToolSequence);
  const hint = buildStrategyHint(evidence.taskType, verificationTool, familyLabel);

  return [
    {
      node_type: "strategy",
      scope_id: input.scope_id,
      task_type: input.task_type as TaskType,
      trigger_pattern: input.task_summary,
      compact_hint: hint,
      goal: `Preserve a reliable verification loop for the ${familyLabel}.`,
      applicability_notes: `Best when the task still hinges on ${verificationTool} and the same ${familyLabel}.`,
      recommended_steps: buildRecommendedSteps(
        evidence.taskSummary,
        verificationTool,
        overlap,
        evidence.verificationSummary
      ),
      success_signal: evidence.verificationSummary
        ? `${verificationTool} confirms: ${evidence.verificationSummary}`
        : `${verificationTool} finishes cleanly for the targeted task.`,
      evidence_summary: `Terminal sequence: ${evidence.terminalSequenceLabel}.`,
      retrieval_text: [input.task_summary, familyLabel, verificationTool, evidence.terminalSequenceLabel].join("\n"),
      source_kind: "system_derived"
    }
  ];
};
