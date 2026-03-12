import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { ExperienceEngineConfig } from "../../config/config-schema.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const resolveSQLiteSchemaPath = (baseDir: string = moduleDir): string => {
  const rootDir = resolve(baseDir, "../..", "..");
  const candidates = [join(baseDir, "schema.sql"), join(rootDir, "src", "store", "sqlite", "schema.sql")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate ExperienceEngine SQLite schema. Checked: ${candidates.join(", ")}`
  );
};

export const openDatabase = (config: ExperienceEngineConfig): DatabaseSync => {
  const dbPath = resolve(config.sqlitePath);
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  return new DatabaseSync(dbPath);
};

export const bootstrapDatabase = (db: DatabaseSync): void => {
  const schemaPath = resolveSQLiteSchemaPath(moduleDir);
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);
};
