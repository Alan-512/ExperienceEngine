import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const distDir = resolve(repoRoot, "dist");

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}
