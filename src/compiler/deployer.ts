import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { compilePack } from "./compiler.js";
import type { CompilerTarget } from "./types.js";

export type DeployCompiledPackInput = {
  packsDir: string;
  packId: string;
  version?: string;
  target: CompilerTarget;
  repoPath: string;
  dryRun?: boolean;
  force?: boolean;
};

export type DeployCompiledPackResult = {
  target: CompilerTarget;
  destinationPath: string;
  sourcePath: string;
  dryRun: boolean;
  overwritten: boolean;
};

const resolveDestinationPath = (
  repoPath: string,
  packId: string,
  target: CompilerTarget
): string => {
  if (target === "codex") {
    return join(repoPath, "CODEX.md");
  }

  if (target === "github") {
    return join(repoPath, ".github", "agents", `${packId}.md`);
  }

  return join(repoPath, "AGENTS.md");
};

export const deployCompiledPack = (input: DeployCompiledPackInput): DeployCompiledPackResult => {
  const compileResult = compilePack({
    packsDir: input.packsDir,
    packId: input.packId,
    version: input.version,
    target: input.target
  });
  const destinationPath = resolve(resolveDestinationPath(input.repoPath, input.packId, input.target));
  const overwritten = existsSync(destinationPath);

  if (overwritten && !input.force) {
    throw new Error(`Destination already exists: ${destinationPath}`);
  }

  if (!input.dryRun) {
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(compileResult.outputPath, destinationPath);
  }

  return {
    target: input.target,
    destinationPath,
    sourcePath: compileResult.outputPath,
    dryRun: input.dryRun ?? false,
    overwritten
  };
};
