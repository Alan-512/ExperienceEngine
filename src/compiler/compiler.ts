import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ExperiencePackRegistry } from "../packs/fs-registry.js";
import { nowIso } from "../utils/clock.js";
import { renderAgentsMarkdown, selectRenderableNodes } from "./agents-renderer.js";
import { renderCodexMarkdown } from "./codex-renderer.js";
import { renderGitHubAgentMarkdown } from "./github-renderer.js";
import type {
  CompilePackInput,
  CompilePackToAgentsInput,
  CompilePackToCodexInput,
  CompileReport,
  CompileResult
} from "./types.js";

const ensureCompilablePackStatus = (status: string): void => {
  if (status !== "published" && status !== "rolled_back") {
    throw new Error("Only published or rolled-back packs can be compiled");
  }
};

const targetOutput = (
  target: "agents" | "codex" | "github",
  packId: string
): { fileName: string; renderer: typeof renderAgentsMarkdown } => {
  if (target === "github") {
    return {
      fileName: `${packId}.agent.md`,
      renderer: renderGitHubAgentMarkdown
    };
  }

  if (target === "codex") {
    return {
      fileName: "CODEX.md",
      renderer: renderCodexMarkdown
    };
  }

  return {
    fileName: "AGENTS.md",
    renderer: renderAgentsMarkdown
  };
};

export const compilePack = (input: CompilePackInput): CompileResult => {
  const registry = new ExperiencePackRegistry({ packsDir: input.packsDir });
  const generatedAt = input.generatedAt ?? nowIso();
  const target = input.target ?? "agents";
  const pack = registry.readPack(input.packId);
  ensureCompilablePackStatus(pack.status);

  const version = input.version ?? pack.currentVersion;
  const manifest = registry.readVersionManifest(input.packId, version);
  if (manifest.statusSnapshot !== "published") {
    throw new Error(`Pack version is not published: ${input.packId}@${version}`);
  }

  const nodes = registry.readVersionNodes(input.packId, version);
  const renderedNodes = selectRenderableNodes(nodes);
  if (!renderedNodes.length) {
    throw new Error(`No renderable nodes in pack version: ${input.packId}@${version}`);
  }

  const { fileName, renderer } = targetOutput(target, input.packId);
  const outputDir = resolve(join(input.packsDir, input.packId, "compiled", target, version));
  const outputPath = join(outputDir, fileName);
  const reportPath = join(outputDir, "compile-report.json");
  mkdirSync(outputDir, { recursive: true });

  const markdown = renderer({
    generatedAt,
    pack,
    manifest,
    nodes
  });
  const report: CompileReport = {
    packId: input.packId,
    version,
    target,
    generatedAt,
    sourceNodeIds: manifest.sourceNodeIds,
    renderedNodeCount: renderedNodes.length,
    riskLevel: manifest.riskLevel,
    outputPath
  };

  writeFileSync(outputPath, markdown);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return {
    ...report,
    outputDir,
    reportPath,
    status: pack.status,
    outputPath
  };
};

export const compilePackToAgents = (input: CompilePackToAgentsInput): CompileResult =>
  compilePack({ ...input, target: "agents" });

export const compilePackToCodex = (input: CompilePackToCodexInput): CompileResult =>
  compilePack({ ...input, target: "codex" });
