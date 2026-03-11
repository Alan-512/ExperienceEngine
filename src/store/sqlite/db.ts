import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { ExperienceEngineConfig } from "../../config/config-schema.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const openDatabase = (config: ExperienceEngineConfig): DatabaseSync => {
  const dbPath = resolve(config.sqlitePath);
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  return new DatabaseSync(dbPath);
};

export const bootstrapDatabase = (db: DatabaseSync): void => {
  const schemaPath = join(moduleDir, "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);
};
