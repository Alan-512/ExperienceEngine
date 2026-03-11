import { loadConfig } from "../../config/load-config.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";

export const runInspectCommand = (): void => {
  const db = openDatabase(loadConfig());
  runMigrations(db);
  const nodes = new NodeRepository(db).listAll();
  if (!nodes.length) {
    console.log("No experience nodes stored yet.");
    return;
  }

  console.table(nodes.map((node) => ({
    id: node.id,
    type: node.node_type,
    task: node.task_type,
    state: node.state,
    hint: node.compact_hint
  })));
};

