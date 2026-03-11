import type { DatabaseSync } from "node:sqlite";
import { bootstrapDatabase } from "./db.js";

export const runMigrations = (db: DatabaseSync): void => {
  bootstrapDatabase(db);
};
