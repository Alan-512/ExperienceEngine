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

const columnExists = (db: DatabaseSync, table: string, column: string): boolean => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
};

const ensureColumn = (db: DatabaseSync, table: string, column: string, definition: string): void => {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

export const bootstrapDatabase = (db: DatabaseSync): void => {
  const schemaPath = resolveSQLiteSchemaPath(moduleDir);
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);

  ensureColumn(db, "experience_nodes", "retrieval_text", "TEXT");
  ensureColumn(db, "experience_nodes", "embedding_json", "TEXT");
  ensureColumn(db, "experience_nodes", "origin_record_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "experience_nodes", "helped_record_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "experience_nodes", "harmed_record_ids_json", "TEXT NOT NULL DEFAULT '[]'");
};

export const withTransaction = <T>(db: DatabaseSync, operation: () => T): T => {
  db.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
