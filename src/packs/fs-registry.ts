import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExperienceNode } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import type {
  ExperiencePackCompiledArtifact,
  ExperiencePackDraftCreateInput,
  ExperiencePackRiskLevel,
  ExperiencePackNodeSnapshot,
  ExperiencePackSummary,
  ExperiencePackVersionManifest
} from "./types.js";

const VERSION_PREFIX = "v";

const toNodeSnapshot = (node: ExperienceNode): ExperiencePackNodeSnapshot => ({
  id: node.id,
  node_type: node.node_type,
  scope_id: node.scope_id,
  task_type: node.task_type,
  trigger_pattern: node.trigger_pattern,
  compact_hint: node.compact_hint,
  evidence_summary: node.evidence_summary,
  source_kind: node.source_kind,
  state: node.state,
  usage_count: node.usage_count,
  helped_count: node.helped_count,
  harmed_count: node.harmed_count,
  support_count: node.support_count,
  distillation_mode_used: node.distillation_mode_used,
  distillation_source: node.distillation_source,
  created_at: node.created_at,
  updated_at: node.updated_at
});

const buildEvidenceSummary = (nodes: ExperienceNode[]): string =>
  nodes
    .map((node) => node.evidence_summary)
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(" | ");

const parseVersionNumber = (value: string): number => {
  const numeric = Number(value.replace(/^v/i, ""));
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
};

const nextVersionId = (versions: string[]): string => `${VERSION_PREFIX}${Math.max(0, ...versions.map(parseVersionNumber)) + 1}`;

export class ExperiencePackRegistry {
  private readonly packsDir: string;

  constructor(args: { packsDir: string }) {
    this.packsDir = resolve(args.packsDir);
  }

  private ensureRegistryRoot(): void {
    mkdirSync(this.packsDir, { recursive: true });
  }

  private packDir(packId: string): string {
    return join(this.packsDir, packId);
  }

  private versionDir(packId: string, version: string): string {
    return join(this.packDir(packId), "versions", version);
  }

  private compiledRoot(packId: string): string {
    return join(this.packDir(packId), "compiled");
  }

  private readJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }

  listPacks(): ExperiencePackSummary[] {
    this.ensureRegistryRoot();
    return readdirSync(this.packsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.readPack(entry.name));
  }

  createDraft(input: ExperiencePackDraftCreateInput): ExperiencePackSummary {
    const now = nowIso();
    this.ensureRegistryRoot();

    const existing = existsSync(join(this.packDir(input.packId), "pack.json"))
      ? this.readPack(input.packId)
      : undefined;
    const existingVersions = existing ? this.listVersions(input.packId).map((entry) => entry.version) : [];
    const version = existing ? nextVersionId(existingVersions) : `${VERSION_PREFIX}1`;
    const packDir = this.packDir(input.packId);
    const versionDir = this.versionDir(input.packId, version);

    mkdirSync(versionDir, { recursive: true });

    const pack: ExperiencePackSummary = {
      packId: input.packId,
      name: input.name || existing?.name || input.packId,
      description: input.description,
      owner: input.owner || existing?.owner || "unknown",
      status: "draft",
      currentVersion: version,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      publishedAt: existing?.publishedAt,
      rolledBackAt: undefined,
      scopeHints: input.scopeHints,
      taskFamilies: input.taskFamilies,
      hostCompatibility: input.hostCompatibility
    };

    const manifest: ExperiencePackVersionManifest = {
      packId: input.packId,
      version,
      statusSnapshot: "draft",
      sourceNodeIds: input.nodes.map((node) => node.id),
      evidenceSummary: buildEvidenceSummary(input.nodes),
      riskLevel: "medium",
      hostCompatibility: input.hostCompatibility,
      createdAt: now
    };

    const snapshots = input.nodes.map((node) => toNodeSnapshot(node));

    writeFileSync(join(packDir, "pack.json"), JSON.stringify(pack, null, 2));
    writeFileSync(join(versionDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    writeFileSync(join(versionDir, "nodes.json"), JSON.stringify(snapshots, null, 2));

    return pack;
  }

  readPack(packId: string): ExperiencePackSummary {
    return this.readJson<ExperiencePackSummary>(join(this.packsDir, packId, "pack.json"));
  }

  readVersionManifest(packId: string, version: string): ExperiencePackVersionManifest {
    return this.readJson<ExperiencePackVersionManifest>(join(this.versionDir(packId, version), "manifest.json"));
  }

  listVersions(packId: string): ExperiencePackVersionManifest[] {
    const versionsRoot = join(this.packDir(packId), "versions");
    if (!existsSync(versionsRoot)) {
      return [];
    }

    return readdirSync(versionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.readVersionManifest(packId, entry.name))
      .sort((left, right) => parseVersionNumber(left.version) - parseVersionNumber(right.version));
  }

  readVersionNodes(packId: string, version: string): ExperiencePackNodeSnapshot[] {
    return this.readJson<ExperiencePackNodeSnapshot[]>(
      join(this.versionDir(packId, version), "nodes.json")
    );
  }

  listCompiledArtifacts(packId: string): ExperiencePackCompiledArtifact[] {
    const compiledRoot = this.compiledRoot(packId);
    if (!existsSync(compiledRoot)) {
      return [];
    }

    const artifacts: ExperiencePackCompiledArtifact[] = [];
    for (const targetEntry of readdirSync(compiledRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const targetRoot = join(compiledRoot, targetEntry.name);
      for (const versionEntry of readdirSync(targetRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        const reportPath = join(targetRoot, versionEntry.name, "compile-report.json");
        if (!existsSync(reportPath)) {
          continue;
        }

        const report = this.readJson<{
          target: string;
          version: string;
          generatedAt: string;
          outputPath: string;
          renderedNodeCount: number;
        }>(reportPath);

        artifacts.push({
          target: report.target,
          version: report.version,
          generatedAt: report.generatedAt,
          outputPath: report.outputPath,
          reportPath,
          renderedNodeCount: report.renderedNodeCount
        });
      }
    }

    return artifacts.sort((left, right) =>
      right.generatedAt.localeCompare(left.generatedAt) ||
      left.target.localeCompare(right.target) ||
      left.version.localeCompare(right.version)
    );
  }

  reviewPack(
    packId: string,
    updates: {
      description?: string;
      evidenceSummary?: string;
      riskLevel?: ExperiencePackRiskLevel;
    }
  ): ExperiencePackSummary {
    const pack = this.readPack(packId);
    const manifest = this.readVersionManifest(packId, pack.currentVersion);
    const now = nowIso();

    const nextPack: ExperiencePackSummary = {
      ...pack,
      description: updates.description ?? pack.description,
      status: "review",
      updatedAt: now
    };
    const nextManifest: ExperiencePackVersionManifest = {
      ...manifest,
      statusSnapshot: "review",
      evidenceSummary: updates.evidenceSummary ?? manifest.evidenceSummary,
      riskLevel: updates.riskLevel ?? manifest.riskLevel
    };

    writeFileSync(join(this.packDir(packId), "pack.json"), JSON.stringify(nextPack, null, 2));
    writeFileSync(
      join(this.versionDir(packId, pack.currentVersion), "manifest.json"),
      JSON.stringify(nextManifest, null, 2)
    );

    return nextPack;
  }

  publishPack(packId: string): ExperiencePackSummary {
    const pack = this.readPack(packId);
    const manifest = this.readVersionManifest(packId, pack.currentVersion);
    const now = nowIso();

    const nextPack: ExperiencePackSummary = {
      ...pack,
      status: "published",
      updatedAt: now,
      publishedAt: now
    };
    const nextManifest: ExperiencePackVersionManifest = {
      ...manifest,
      statusSnapshot: "published",
      publishedAt: now
    };

    writeFileSync(join(this.packDir(packId), "pack.json"), JSON.stringify(nextPack, null, 2));
    writeFileSync(
      join(this.versionDir(packId, pack.currentVersion), "manifest.json"),
      JSON.stringify(nextManifest, null, 2)
    );

    return nextPack;
  }

  rollbackPack(packId: string, version: string): ExperiencePackSummary {
    const pack = this.readPack(packId);
    const versions = this.listVersions(packId);
    if (!versions.some((entry) => entry.version === version)) {
      throw new Error(`Unknown pack version: ${packId}@${version}`);
    }

    const now = nowIso();
    const nextPack: ExperiencePackSummary = {
      ...pack,
      status: "rolled_back",
      currentVersion: version,
      updatedAt: now,
      rolledBackAt: now
    };

    writeFileSync(join(this.packDir(packId), "pack.json"), JSON.stringify(nextPack, null, 2));

    return nextPack;
  }
}
