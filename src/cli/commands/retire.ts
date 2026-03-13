import { loadConfig } from "../../config/load-config.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";

export const runRetireCommand = (target?: string, nodeId?: string): void => {
  if (target !== "node" || !nodeId) {
    console.log("Usage: ee retire node <id>");
    return;
  }

  const db = openDatabase(loadConfig());
  runMigrations(db);
  const nodeRepo = new NodeRepository(db);
  const updated = nodeRepo.updateState(nodeId, "retired");

  if (!updated) {
    console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
    return;
  }

  console.log(`[ExperienceEngine] Retired node ${nodeId}. Historical stats were preserved.`);
};
