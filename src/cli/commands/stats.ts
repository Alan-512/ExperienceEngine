import { loadConfig } from "../../config/load-config.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { StatsRepository } from "../../store/sqlite/repositories/stats-repo.js";

export const runStatsCommand = (): void => {
  const db = openDatabase(loadConfig());
  runMigrations(db);
  const stats = new StatsRepository(db).listAll();
  if (!stats.length) {
    console.log("No scope stats recorded yet.");
    return;
  }

  console.table(stats);
};

