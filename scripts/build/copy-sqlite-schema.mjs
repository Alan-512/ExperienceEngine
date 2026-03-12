import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const source = resolve(repoRoot, "src", "store", "sqlite", "schema.sql");
const destination = resolve(repoRoot, "dist", "store", "sqlite", "schema.sql");

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination);
