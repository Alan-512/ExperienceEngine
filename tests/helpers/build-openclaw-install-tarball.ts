import { mkdirSync } from "node:fs";
import { resolveExperienceEnginePaths } from "../../src/config/path-resolver.js";
import { createOpenClawInstallTarball } from "../../src/install/openclaw-installer.js";

const [packageRoot, homeDir] = process.argv.slice(2);
if (!packageRoot || !homeDir) {
  throw new Error("packageRoot and homeDir are required");
}

const paths = resolveExperienceEnginePaths({ homeDir });
mkdirSync(paths.productHome, { recursive: true });
mkdirSync(`${paths.productHome}/adapters/openclaw`, { recursive: true });
process.stdout.write(`${createOpenClawInstallTarball(packageRoot, paths)}\n`);
