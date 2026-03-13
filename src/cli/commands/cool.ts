import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";

export const runCoolCommand = (target?: string, nodeId?: string): void => {
  if (target !== "node" || !nodeId) {
    console.log("Usage: ee cool node <id>");
    return;
  }

  const interaction = new ExperienceInteractionService(loadConfig());
  const result = interaction.coolNode(nodeId);
  if (result.status === "not_found") {
    console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
    return;
  }

  console.log(`[ExperienceEngine] Cooled node ${nodeId}. It will be considered less aggressively.`);
};
