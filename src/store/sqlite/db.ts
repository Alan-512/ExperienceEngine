import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExperienceEngineConfig } from "../../config/config-schema.js";

export const openDatabase = (config: ExperienceEngineConfig): DatabaseSync => {
  const dbPath = resolve(config.sqlitePath);
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  return new DatabaseSync(dbPath);
};

export const bootstrapDatabase = (db: DatabaseSync): void => {
  const schemaPath = resolve(process.cwd(), "src/store/sqlite/schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);
};
