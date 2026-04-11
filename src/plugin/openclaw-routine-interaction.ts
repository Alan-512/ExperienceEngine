import {
  deriveSetupState,
  deriveValueState,
  inspectSharedSetupState
} from "../cli/state-model.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { inspectRecordedOpenClawInstallState } from "./openclaw-install-state.js";
import {
  deriveStructuredSilenceReason,
  ExperienceInteractionService,
  type ExperienceFirstValueReadiness,
  type ExperienceLastInspection,
  type ExperienceSilenceReason,
  type FeedbackResult
} from "../interaction/service.js";

export type OpenClawRoutineIntent =
  | "inspect_last"
  | "explain_last_match"
  | "inspect_readiness"
  | "inspect_first_value"
  | "inspect_repo_summary"
  | "explain_recent_silence"
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

  if (
    includesAll(message, ["ready", "here"])
    || includesAll(message, ["ready", "repo"])
    || includesAll(message, ["ready", "this", "repo"])
    || includesAll(message, ["set", "up", "repo"])
    || includesAll(message, ["work", "workspace", "now"])
  ) {
    return "inspect_readiness";
  }

  if (
    includesAll(message, ["warming", "up"])
    || includesAll(message, ["started", "producing", "value"])
    || includesAll(message, ["reusable", "hints", "yet"])
    || includesAll(message, ["first", "value"])
  ) {
    return "inspect_first_value";
  }

  if (
    includesAll(message, ["doing", "repo", "right", "now"])
    || includesAll(message, ["quick", "summary", "workspace"])
    || includesAll(message, ["summarize", "state", "here"])
    || includesAll(message, ["current", "status", "repo"])
  ) {
    return "inspect_repo_summary";
  }

  if (
    includesAll(message, ["didn't", "inject"])
    || includesAll(message, ["did not", "inject"])
    || includesAll(message, ["no", "hint", "last", "turn"])
    || includesAll(message, ["stay", "quiet"])
    || includesAll(message, ["stayed", "quiet"])
  ) {
    return "explain_recent_silence";
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
      : intent === "explain_recent_silence"
        ? "There is no recent ExperienceEngine turn in this workspace to explain yet."
      : "There is no recent injected ExperienceEngine intervention to review.";

  return [
    "ExperienceEngine routine interaction:",
    summary,
    "Answer briefly and directly. Do not default to CLI unless the user asks for deeper operator inspection."
  ].join("\n");
};

const summarizeReadinessNextStep = (setupState: "Ready" | "Initialized" | "Installed"): string => {
  switch (setupState) {
    case "Ready":
      return "Keep working in this repo. ExperienceEngine can already observe normal tasks here.";
    case "Initialized":
      return "Reconnect or enable the OpenClaw ExperienceEngine integration so this repo can use the shared setup.";
    default:
      return "Finish shared ExperienceEngine setup first so this repo can start collecting reusable task signals.";
  }
};

const summarizeHostStatus = (setupState: "Ready" | "Initialized" | "Installed"): string => {
  switch (setupState) {
    case "Ready":
      return "OpenClaw routine interaction is active in this workspace.";
    case "Initialized":
      return "Shared ExperienceEngine setup exists, but host wiring is not fully ready yet.";
    default:
      return "OpenClaw can answer routine questions here, but shared ExperienceEngine setup is not complete yet.";
  }
};

const buildReadinessContext = (runtimeActive: boolean): string => {
  const setupState = deriveOpenClawSetupState(runtimeActive);

  return [
    "ExperienceEngine routine interaction:",
    "The user is asking whether ExperienceEngine is ready in this repo.",
    `Setup state: ${setupState}`,
    `Host status: ${summarizeHostStatus(setupState)}`,
    `Next step: ${summarizeReadinessNextStep(setupState)}`,
    "Answer briefly from this grounded state. Mention CLI only if the user asks for deeper validation or repair."
  ].join("\n");
};

const deriveOpenClawSetupState = (runtimeActive: boolean): "Ready" | "Initialized" | "Installed" => {
  const sharedSetup = inspectSharedSetupState();
  const openclawStatus = inspectRecordedOpenClawInstallState();
  return deriveSetupState({
    sharedInitialized: sharedSetup.initialized,
    installed: openclawStatus.installed || runtimeActive,
    interactionReady: openclawStatus.hostWiring.wired || runtimeActive
  });
};

const buildLatestInterventionSummary = (inspection: ExperienceLastInspection | undefined): string => {
  if (!inspection) {
    return "none recorded yet in this workspace.";
  }

  return `${inspection.intervention} on "${inspection.summary}".`;
};

const summarizeRepoActivity = (input: {
  verdict: "warming_up" | "healthy" | "watch" | "failing";
  latestIntervention?: ExperienceLastInspection["intervention"];
}): string => {
  if (input.verdict === "healthy") {
    return "ExperienceEngine is currently finding reusable guidance in this repo.";
  }

  if (input.verdict === "warming_up") {
    return "ExperienceEngine is still warming up in this repo.";
  }

  if (input.verdict === "failing") {
    return "ExperienceEngine is active here, but recent guidance quality needs closer review.";
  }

  if (input.latestIntervention === "skip") {
    return "ExperienceEngine is active in this repo but staying mostly quiet on recent turns.";
  }

  return "ExperienceEngine is active in this repo, but current results are still mixed.";
};

const buildRepoSummaryContext = (
  interaction: ExperienceInteractionService,
  cwd: string,
  runtimeActive: boolean
): string => {
  const repoSummary = interaction.inspectRepoSummary(cwd);
  const latest = interaction.inspectLast(cwd);
  const readiness = interaction.inspectFirstValueReadiness(cwd);
  const setupState = deriveOpenClawSetupState(runtimeActive);
  const valueState = deriveValueState(readiness);
  const nextStep = valueState === "Warming up" ? readiness.nextStep : repoSummary.recommendedNextAction;

  return [
    "ExperienceEngine routine interaction:",
    "The user is asking for a compact ExperienceEngine summary of this repo.",
    `Setup state: ${setupState}`,
    `Value state: ${valueState}`,
    `Latest intervention: ${buildLatestInterventionSummary(latest)}`,
    `Repo activity: ${summarizeRepoActivity({
      verdict: repoSummary.benchmark.verdict,
      latestIntervention: latest?.intervention
    })}`,
    `Next step: ${nextStep}`,
    "Answer briefly from this grounded state. Mention CLI only if the user asks for deeper inspection or repair."
  ].join("\n");
};

const summarizeFirstValue = (valueState: "Warming up" | "First value reached"): string =>
  valueState === "First value reached"
    ? "This repo has already produced visible ExperienceEngine value from real task activity."
    : "This repo is still warming up and needs more real task evidence before hints become reusable.";

const buildFirstValueProgressContext = (summary: ExperienceFirstValueReadiness): string => {
  const valueState = deriveValueState(summary);

  return [
    "ExperienceEngine routine interaction:",
    "The user is asking whether ExperienceEngine is still warming up in this repo.",
    `Value state: ${valueState}`,
    `Progress: ${summarizeFirstValue(valueState)}`,
    `Current evidence: ${summary.rawRecords} task record(s), ${summary.taskRuns} task run(s), ${summary.candidates} candidate draft(s), ${summary.nodes} formal node(s).`,
    `Next step: ${summary.nextStep}`,
    "Answer briefly from this grounded state. Do not claim first value from setup text alone."
  ].join("\n");
};

const renderSilenceReason = (reason: ExperienceSilenceReason): string => {
  switch (reason) {
    case "warming_up":
      return "ExperienceEngine is still warming up in this repo, so it is gathering more real-task evidence before reusing guidance.";
    case "no_strong_match":
      return "ExperienceEngine stayed quiet because it did not find a strong enough reusable match for that turn.";
    case "withheld_low_confidence":
      return "ExperienceEngine stayed cautious because it saw some signal, but confidence stayed below the delivery bar on that turn.";
    case "non_applicable_turn":
      return "The latest turn was not the kind of task where ExperienceEngine would normally inject reusable guidance.";
    default:
      return "ExperienceEngine stayed quiet on that turn, but the stored state does not point to a more specific silence reason yet.";
  }
};

const buildRecentSilenceContext = (
  inspection: ExperienceLastInspection | undefined,
  readiness: ExperienceFirstValueReadiness
): string => {
  if (!inspection) {
    return buildMissingInspectionContext("explain_recent_silence");
  }

  if (inspection.intervention !== "skip") {
    return [
      "ExperienceEngine routine interaction:",
      "The user is asking why ExperienceEngine stayed quiet on the latest turn.",
      "The latest turn already delivered a hint, so the latest ExperienceEngine turn was not actually quiet.",
      `Latest intervention: ${inspection.intervention}`,
      "Answer briefly and directly from this grounded state."
    ].join("\n");
  }

  return [
    "ExperienceEngine routine interaction:",
    "The user is asking why ExperienceEngine stayed quiet on the latest turn.",
    "The latest turn delivered no hint.",
    `Reason: ${renderSilenceReason(deriveStructuredSilenceReason({ inspection, readiness }))}`,
    `Next step: ${readiness.nextStep}`,
    "Answer briefly from this grounded state. Mention CLI only if the user asks for deeper diagnostics."
  ].join("\n");
};

const buildInspectionContext = (
  record: ExperienceLastInspection,
  intent: "inspect_last" | "explain_last_match",
  explanationOverride?: string
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
    if (explanationOverride ?? record.decisionExplanation) {
      lines.push(`Why it matched: ${explanationOverride ?? record.decisionExplanation}`);
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

export const buildOpenClawRoutineInteractionContext = async (
  config: ExperienceEngineConfig,
  intent: OpenClawRoutineIntent,
  cwd?: string,
  options: { runtimeActive?: boolean; userMessage?: string } = {}
): Promise<string> => {
  const interaction = new ExperienceInteractionService(config);
  const currentCwd = cwd ?? process.cwd();

  if (intent === "feedback_helped") {
    return buildFeedbackContext("helped", interaction.feedbackLast("helped", cwd));
  }

  if (intent === "feedback_harmed") {
    return buildFeedbackContext("harmed", interaction.feedbackLast("harmed", cwd));
  }

  if (intent === "inspect_readiness") {
    return buildReadinessContext(options.runtimeActive ?? false);
  }

  if (intent === "inspect_first_value") {
    return buildFirstValueProgressContext(interaction.inspectFirstValueReadiness(currentCwd));
  }

  if (intent === "inspect_repo_summary") {
    return buildRepoSummaryContext(interaction, currentCwd, options.runtimeActive ?? false);
  }

  const inspection = interaction.inspectLast(currentCwd);
  if (intent === "explain_recent_silence") {
    return buildRecentSilenceContext(inspection, interaction.inspectFirstValueReadiness(currentCwd));
  }

  if (!inspection || inspection.injectedNodes.length === 0) {
    return buildMissingInspectionContext(intent);
  }

  const explanationOverride =
    intent === "explain_last_match"
      ? await interaction.explainLastDecision(currentCwd, options.userMessage)
      : undefined;

  return buildInspectionContext(inspection, intent, explanationOverride);
};
