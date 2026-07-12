import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const sourceRoot = resolve(repoRoot, "src", "runtime", "package", "assets");
const destinationRoot = resolve(repoRoot, "dist", "runtime", "package", "assets");

mkdirSync(destinationRoot, { recursive: true });
cpSync(sourceRoot, destinationRoot, { recursive: true });
