import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";

export const runDisableCommand = (target?: string, reference?: string): void => {
  if (target === "node" && reference) {
    const db = openDatabase(loadConfig());
    runMigrations(db);
    const nodeRepo = new NodeRepository(db);
    const updated = nodeRepo.updateState(reference, "retired");

    if (!updated) {
      console.log(`[ExperienceEngine] Node ${reference} was not found.`);
      return;
    }

    console.log(`[ExperienceEngine] Disabled node ${reference}. It will no longer be injected.`);
    return;
  }

  if (target === "scope") {
    const interaction = new ExperienceInteractionService(loadConfig());
    const next = interaction.disableScope(process.cwd());

    console.log(
      `[ExperienceEngine] Disabled interventions for scope ${next.scopeId} (${next.rootPath ?? next.scopeName}).`
    );
    return;
  }

  console.log("Usage: ee disable node <id> | ee disable scope");
};
