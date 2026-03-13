import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";

export const runEnableCommand = (target?: string): void => {
  if (target !== "scope") {
    console.log("Usage: ee enable scope");
    return;
  }

  const interaction = new ExperienceInteractionService(loadConfig());
  const result = interaction.enableScope(process.cwd());

  if (!result.changed) {
    console.log(
      `[ExperienceEngine] Interventions are already enabled for scope ${result.scopeId} (${result.rootPath ?? result.scopeName}).`
    );
    return;
  }

  console.log(
    `[ExperienceEngine] Enabled interventions for scope ${result.scopeId} (${result.rootPath ?? result.scopeName}).`
  );
};
