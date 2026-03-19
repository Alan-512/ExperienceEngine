import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { compilePack } from "./compiler.js";
import type { CompilerTarget } from "./types.js";
import { ExperiencePackRegistry } from "../packs/fs-registry.js";

export type DeployCompiledPackInput = {
  packsDir: string;
  packId: string;
  version?: string;
  target: CompilerTarget;
  repoPath: string;
  dryRun?: boolean;
  force?: boolean;
  statusOnly?: boolean;
};

export type DeployCompiledPackResult = {
  target: CompilerTarget;
  destinationPath: string;
  sourcePath: string;
  dryRun: boolean;
  overwritten: boolean;
  deploymentStatus: "missing" | "up_to_date" | "drifted";
  statusOnly: boolean;
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
  const registry = new ExperiencePackRegistry({ packsDir: input.packsDir });
  const pack = registry.readPack(input.packId);
  const version = input.version ?? pack.currentVersion;
  const existingArtifact = registry
    .listCompiledArtifacts(input.packId)
    .find((artifact) => artifact.version === version && artifact.target === input.target);
  const compileResult = existingArtifact
    ? {
        ...existingArtifact,
        packId: input.packId,
        riskLevel: registry.readVersionManifest(input.packId, version).riskLevel,
        sourceNodeIds: registry.readVersionManifest(input.packId, version).sourceNodeIds,
        outputDir: dirname(existingArtifact.outputPath),
        status: pack.status
      }
    : compilePack({
        packsDir: input.packsDir,
        packId: input.packId,
        version,
        target: input.target
      });
  const destinationPath = resolve(resolveDestinationPath(input.repoPath, input.packId, input.target));
  const destinationExists = existsSync(destinationPath);
  const deploymentStatus: DeployCompiledPackResult["deploymentStatus"] = !destinationExists
    ? "missing"
    : readFileSync(destinationPath, "utf8") === readFileSync(compileResult.outputPath, "utf8")
      ? "up_to_date"
      : "drifted";
  const overwritten = deploymentStatus === "drifted";

  if (deploymentStatus === "drifted" && !input.force) {
    throw new Error(`Destination differs from compiled artifact: ${destinationPath}`);
  }

  if (!input.dryRun && !input.statusOnly && deploymentStatus !== "up_to_date") {
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(compileResult.outputPath, destinationPath);
  }

  return {
    target: input.target,
    destinationPath,
    sourcePath: compileResult.outputPath,
    dryRun: input.dryRun ?? false,
    overwritten,
    deploymentStatus,
    statusOnly: input.statusOnly ?? false
  };
};
