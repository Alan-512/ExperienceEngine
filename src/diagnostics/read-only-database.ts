import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

export const openExistingReadOnlyDatabase = (databasePath: string): DatabaseSync | null => {
  const resolvedPath = resolve(databasePath);
  if (!existsSync(resolvedPath)) {
    return null;
  }
  const database = new DatabaseSync(resolvedPath, { readOnly: true });
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA foreign_keys = ON");
  return database;
};

export const diagnosticTableExists = (database: DatabaseSync, table: string): boolean => Boolean(
  database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table)
);

export const diagnosticColumnExists = (
  database: DatabaseSync,
  table: string,
  column: string
): boolean => {
  if (!diagnosticTableExists(database, table)) {
    return false;
  }
  const rows = database.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === column);
};
