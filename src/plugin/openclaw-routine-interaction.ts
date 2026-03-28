import type { ExperienceEngineConfig } from "../config/config-schema.js";
import {
  ExperienceInteractionService,
  type ExperienceLastInspection,
  type FeedbackResult
} from "../interaction/service.js";

export type OpenClawRoutineIntent =
  | "inspect_last"
  | "explain_last_match"
  | "feedback_helped"
  | "feedback_harmed";

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const includesAll = (haystack: string, needles: string[]): boolean =>
  needles.every((needle) => haystack.includes(needle));

export const detectOpenClawRoutineIntent = (userMessage?: string): OpenClawRoutineIntent | undefined => {
  if (!userMessage) {
    return undefined;
  }

  const message = normalize(userMessage);
  const hasEeReference =
    message.includes("experienceengine")
    || message.includes("experience engine")
    || message.includes("ee ");

  if (!hasEeReference) {
    return undefined;
  }

  if (
    includesAll(message, ["what", "inject"])
    || includesAll(message, ["show", "last", "intervention"])
  ) {
    return "inspect_last";
  }

  if (
    includesAll(message, ["why", "match"])
    || includesAll(message, ["why", "conservative"])
    || includesAll(message, ["why", "hint"])
  ) {
    return "explain_last_match";
  }

  if (includesAll(message, ["mark", "helpful"]) || includesAll(message, ["mark", "helped"])) {
    return "feedback_helped";
  }

  if (includesAll(message, ["mark", "harmful"]) || includesAll(message, ["mark", "harmed"])) {
    return "feedback_harmed";
  }

  return undefined;
};

const describeDeliveryStyle = (record: ExperienceLastInspection): string | undefined => {
  const mode = record.scorecard?.mode;
  if (mode === "inject") {
    return "normal hint delivery";
  }
  if (mode === "inject_conservative") {
    return "cautious hint delivery";
  }
  if (mode === "skip") {
    return "no hint delivered";
  }
  return undefined;
};

const buildMissingInspectionContext = (intent: OpenClawRoutineIntent): string => {
  const summary =
    intent === "explain_last_match"
      ? "There is no recent ExperienceEngine intervention with a stored match explanation."
      : "There is no recent injected ExperienceEngine intervention to review.";

  return [
    "ExperienceEngine routine interaction:",
    summary,
    "Answer briefly and directly. Do not default to CLI unless the user asks for deeper operator inspection."
  ].join("\n");
};

const buildInspectionContext = (
  record: ExperienceLastInspection,
  intent: "inspect_last" | "explain_last_match"
): string => {
  const lines = [
    "ExperienceEngine routine interaction:",
    intent === "inspect_last"
      ? "The user is asking what ExperienceEngine just injected."
      : "The user is asking why the last ExperienceEngine hint matched.",
    `Latest intervention: ${record.intervention}`
  ];

  const deliveryStyle = describeDeliveryStyle(record);
  if (deliveryStyle) {
    lines.push(`Delivery style: ${deliveryStyle}`);
  }

  if (record.injectedNodes.length > 0) {
    lines.push(
      `Injected nodes: ${record.injectedNodes.map((node) => `${node.id} (${node.type}, ${node.state})`).join(", ")}`
    );
  }

  if (record.hints.length > 0) {
    lines.push(`Hints: ${record.hints.join(" | ")}`);
  }

  if (intent === "explain_last_match") {
    if (record.decisionExplanation) {
      lines.push(`Why it matched: ${record.decisionExplanation}`);
    }
    if (record.trustSummary) {
      lines.push(`Trust summary: ${record.trustSummary}`);
    }
    if (record.retrievalNotes.length > 0) {
      lines.push(`Retrieval notes: ${record.retrievalNotes.join(" ")}`);
    }
  } else if (record.trustSummary) {
    lines.push(`Trust summary: ${record.trustSummary}`);
  }

  lines.push("Answer directly from this grounded ExperienceEngine state. Only mention CLI if the user asks for deeper operator detail.");
  return lines.join("\n");
};

const buildFeedbackContext = (feedback: "helped" | "harmed", result: FeedbackResult): string => {
  if (result.status === "not_found") {
    return [
      "ExperienceEngine routine interaction:",
      "No recent injected ExperienceEngine intervention was available to update.",
      "Answer briefly and say there was no recent injected intervention to mark."
    ].join("\n");
  }

  return [
    "ExperienceEngine routine interaction:",
    `Feedback recorded: ${feedback}.`,
    `Updated nodes: ${result.nodeIds.join(", ")}.`,
    `Tell the user the last ExperienceEngine intervention was marked as ${feedback}.`
  ].join("\n");
};

export const buildOpenClawRoutineInteractionContext = (
  config: ExperienceEngineConfig,
  intent: OpenClawRoutineIntent,
  cwd?: string
): string => {
  const interaction = new ExperienceInteractionService(config);

  if (intent === "feedback_helped") {
    return buildFeedbackContext("helped", interaction.feedbackLast("helped", cwd));
  }

  if (intent === "feedback_harmed") {
    return buildFeedbackContext("harmed", interaction.feedbackLast("harmed", cwd));
  }

  const inspection = interaction.inspectLast(cwd);
  if (!inspection || inspection.injectedNodes.length === 0) {
    return buildMissingInspectionContext(intent);
  }

  return buildInspectionContext(inspection, intent);
};
