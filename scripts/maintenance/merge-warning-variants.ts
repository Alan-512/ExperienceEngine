import { resolve } from "node:path";
import { loadConfig } from "../../src/config/load-config.js";
import { openDatabase } from "../../src/store/sqlite/db.js";
import { cleanupHistoricalWarningVariants } from "../../src/maintenance/warning-variant-cleanup.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const sqliteIndex = args.indexOf("--sqlite");
const sqlitePath = sqliteIndex >= 0 ? args[sqliteIndex + 1] : undefined;

if (sqliteIndex >= 0 && !sqlitePath) {
  console.error("Usage: pnpm tsx scripts/maintenance/merge-warning-variants.ts [--apply] [--sqlite <path>]");
  process.exit(1);
}

const config = loadConfig({
  sqlitePath: sqlitePath ? resolve(sqlitePath) : undefined
});

const db = openDatabase(config);
const summary = cleanupHistoricalWarningVariants(db, apply);

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      sqlitePath: config.sqlitePath,
      ...summary
    },
    null,
    2
  )
);
