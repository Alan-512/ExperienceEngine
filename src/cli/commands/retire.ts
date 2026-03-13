import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";

export const runRetireCommand = (target?: string, nodeId?: string): void => {
  if (target !== "node" || !nodeId) {
    console.log("Usage: ee retire node <id>");
    return;
  }

  const interaction = new ExperienceInteractionService(loadConfig());
  const result = interaction.retireNode(nodeId);
  if (result.status === "not_found") {
    console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
    return;
  }

  console.log(`[ExperienceEngine] Retired node ${nodeId}. Historical stats were preserved.`);
};
