import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";

const USAGE = "Usage: ee feedback --last helped|harmed | ee feedback node <id> helped|harmed";

const recordLastFeedback = (feedbackValue: "helped" | "harmed"): void => {
  const interaction = new ExperienceInteractionService(loadConfig());
  const result = interaction.feedbackLast(feedbackValue);
  if (result.status === "not_found") {
    console.log("[ExperienceEngine] No injected experience nodes were found for the last task.");
    return;
  }

  console.log(
    `[ExperienceEngine] Recorded feedback for the last injected experience: ${feedbackValue}.`
  );
};

export const runFeedbackCommand = (target?: string, reference?: string, feedback?: string): void => {
  if (target !== "--last" && target !== "node") {
    console.log(USAGE);
    return;
  }

  const feedbackValue =
    target === "--last" ? reference : feedback;

  if (feedbackValue !== "helped" && feedbackValue !== "harmed") {
    console.log(USAGE);
    return;
  }

  if (target === "--last") {
    recordLastFeedback(feedbackValue);
    return;
  }

  const nodeId = reference;
  if (!nodeId) {
    console.log(USAGE);
    return;
  }

  const interaction = new ExperienceInteractionService(loadConfig());
  const result = interaction.feedbackNode(nodeId, feedbackValue);
  if (result.status === "not_found") {
    console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
    return;
  }

  console.log(`[ExperienceEngine] Recorded feedback for node ${nodeId}: ${feedbackValue}.`);
};

export const runQuickFeedbackCommand = (feedbackValue: "helped" | "harmed"): void => {
  recordLastFeedback(feedbackValue);
};
