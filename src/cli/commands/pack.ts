import { loadConfig } from "../../config/load-config.js";
import { compilePack } from "../../compiler/compiler.js";
import { deployCompiledPack } from "../../compiler/deployer.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { ExperiencePackRegistry } from "../../packs/fs-registry.js";
import { ExperiencePackIndexSync } from "../../packs/index-sync.js";
import { basename } from "node:path";
import { bootstrapDatabase, openDatabase } from "../../store/sqlite/db.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";
import { ExperiencePackRepository } from "../../store/sqlite/repositories/pack-repo.js";
import { resolveScope } from "../../input/scope-resolver.js";
import { nowIso } from "../../utils/clock.js";

const ALL_HOSTS = ["openclaw", "claude-code", "codex"] as const;

const usage = (): void => {
  console.log(
    "Usage: ee pack <list|inspect <pack-id>|status <pack-id> [version] [agents|codex|github] [repo-path]|draft create <pack-id> <node-id[,node-id...]> [name...]|review <pack-id> <description...>|publish <pack-id>|compile <pack-id> [version] [agents|codex|github]|deploy <pack-id> [version] [agents|codex|github] [repo-path] [--dry-run] [--force] [--status-only]|rollback <pack-id> <version>>"
  );
};

const openServices = () => {
  const config = loadConfig();
  const paths = resolveExperienceEnginePaths();
  const db = openDatabase(config);
  bootstrapDatabase(db);
  const nodeRepo = new NodeRepository(db);
  const packRepo = new ExperiencePackRepository(db);
  const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });
  const indexSync = new ExperiencePackIndexSync(registry, packRepo);

  return { nodeRepo, packRepo, registry, indexSync };
};

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

export const runPackCommand = (args: string[]): void => {
  const [action, ...rest] = args;
  const { nodeRepo, packRepo, registry, indexSync } = openServices();

  if (!action || action === "help") {
    usage();
    return;
  }

  if (action === "list") {
    const packs = registry.listPacks();
    if (!packs.length) {
      console.log("No experience packs created yet.");
      return;
    }

    console.table(
      packs.map((pack) => {
        const compileStatus = registry.getCompileStatus(pack.packId, pack.currentVersion);
        return {
          pack_id: pack.packId,
          status: pack.status,
          current_version: pack.currentVersion,
          current_version_compiled: compileStatus.currentVersionCompiledTargets.join(", ") || "none",
          stale: compileStatus.stale,
          latest_compile_target: compileStatus.latestArtifact?.target ?? "",
          latest_compile_at: compileStatus.latestArtifact?.generatedAt ?? "",
          owner: pack.owner,
          updated_at: pack.updatedAt
        };
      })
    );
    return;
  }

  if (action === "inspect") {
    const packId = rest[0];
    if (!packId) {
      usage();
      return;
    }

    const pack = registry.readPack(packId);
    const versions = registry.listVersions(packId);
    const current = registry.readVersionManifest(packId, pack.currentVersion);
    const nodes = registry.readVersionNodes(packId, pack.currentVersion);
    const activations = packRepo.listActivationsByPack(packId);
    const activationSummary = activations.length
      ? activations
          .map(
            (activation) =>
              `${activation.scope_id}@${activation.pinned_version ?? pack.currentVersion} [${activation.enabled ? "enabled" : "disabled"}]`
          )
          .join(", ")
      : "none";

    console.log(`Pack: ${pack.packId}`);
    console.log(`Name: ${pack.name}`);
    console.log(`Status: ${pack.status}`);
    console.log(`Current version: ${pack.currentVersion}`);
    console.log(`Owner: ${pack.owner}`);
    console.log(`Description: ${pack.description}`);
    console.log(`Task families: ${pack.taskFamilies.join(", ")}`);
    console.log(`Hosts: ${pack.hostCompatibility.join(", ")}`);
    console.log(`Version count: ${versions.length}`);
    console.log(`Evidence: ${current.evidenceSummary}`);
    console.log(`Nodes: ${nodes.map((node) => node.id).join(", ")}`);
    console.log(`Activations: ${activationSummary}`);
    const compileStatus = registry.getCompileStatus(packId, pack.currentVersion);
    console.log(
      `Current version compiled targets: ${compileStatus.currentVersionCompiledTargets.join(", ") || "none"}`
    );
    console.log(`Compile stale: ${compileStatus.stale}`);
    const compiledArtifacts = registry.listCompiledArtifacts(packId);
    if (compiledArtifacts.length) {
      console.log("Compiled targets:");
      for (const artifact of compiledArtifacts) {
        console.log(`- ${artifact.target}@${artifact.version} (${artifact.renderedNodeCount} nodes)`);
        console.log(`  Output: ${artifact.outputPath}`);
      }
    } else {
      console.log("Compiled targets: none");
    }
    return;
  }

  if (action === "draft" && rest[0] === "create") {
    const packId = rest[1];
    const nodeIdsCsv = rest[2];
    const name = rest.slice(3).join(" ").trim() || packId;
    if (!packId || !nodeIdsCsv) {
      usage();
      return;
    }

    const nodeIds = nodeIdsCsv.split(",").map((value) => value.trim()).filter(Boolean);
    const nodes = nodeIds
      .map((id) => nodeRepo.getById(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    if (nodes.length !== nodeIds.length) {
      throw new Error(`Unknown node id in pack draft: ${nodeIds.join(", ")}`);
    }

    const typedNodes = nodes;
    registry.createDraft({
      packId,
      name,
      description: name,
      owner: process.env.USER ?? process.env.USERNAME ?? "unknown",
      scopeHints: unique(typedNodes.map((node) => `scope:${node.scope_id}`)),
      taskFamilies: unique(typedNodes.map((node) => node.task_type)),
      hostCompatibility: [...ALL_HOSTS],
      nodes: typedNodes
    });
    indexSync.syncPack(packId);
    console.log(`[ExperienceEngine] Drafted experience pack ${packId}.`);
    return;
  }

  if (action === "review") {
    const packId = rest[0];
    const description = rest.slice(1).join(" ").trim();
    if (!packId || !description) {
      usage();
      return;
    }

    registry.reviewPack(packId, {
      description,
      evidenceSummary: description,
      riskLevel: "medium"
    });
    indexSync.syncPack(packId);
    console.log(`[ExperienceEngine] Reviewed experience pack ${packId}.`);
    return;
  }

  if (action === "publish") {
    const packId = rest[0];
    if (!packId) {
      usage();
      return;
    }

    registry.publishPack(packId);
    indexSync.syncPack(packId);
    console.log(`[ExperienceEngine] Published experience pack ${packId}.`);
    return;
  }

  if (action === "compile") {
    const packId = rest[0];
    const compileTarget = (value: string | undefined): "agents" | "codex" | "github" | undefined =>
      value === "agents" || value === "codex" || value === "github" ? value : undefined;
    const arg2Target = compileTarget(rest[1]);
    const arg3Target = compileTarget(rest[2]);
    const version = arg2Target ? undefined : rest[1];
    const target = arg2Target ?? arg3Target ?? "agents";
    if (!packId) {
      usage();
      return;
    }

    const paths = resolveExperienceEnginePaths();
    const result = compilePack({
      packsDir: paths.packsDir,
      packId,
      version,
      target
    });
    console.log(`[ExperienceEngine] Compiled experience pack ${packId}.`);
    console.log(`${basename(result.outputPath)}: ${result.outputPath}`);
    console.log(`compile-report.json: ${result.reportPath}`);
    return;
  }

  if (action === "status") {
    const compileTarget = (value: string | undefined): "agents" | "codex" | "github" | undefined =>
      value === "agents" || value === "codex" || value === "github" ? value : undefined;
    const packId = rest[0];
    const arg2Target = compileTarget(rest[1]);
    const arg3Target = compileTarget(rest[2]);
    const version = arg2Target ? undefined : rest[1];
    const target = arg2Target ?? arg3Target ?? "agents";
    const repoPath = rest[arg2Target ? 2 : arg3Target ? 3 : version ? 2 : 1] ?? process.cwd();
    if (!packId) {
      usage();
      return;
    }

    const paths = resolveExperienceEnginePaths();
    const result = deployCompiledPack({
      packsDir: paths.packsDir,
      packId,
      version,
      target,
      repoPath,
      statusOnly: true
    });
    console.log(`Pack status: ${packId}`);
    console.log(`Target: ${result.target}`);
    console.log(`Source: ${result.sourcePath}`);
    console.log(`Destination: ${result.destinationPath}`);
    console.log(`Status: ${result.deploymentStatus}`);
    console.log(`Status only: ${result.statusOnly}`);
    return;
  }

  if (action === "deploy") {
    const compileTarget = (value: string | undefined): "agents" | "codex" | "github" | undefined =>
      value === "agents" || value === "codex" || value === "github" ? value : undefined;
    const positional = rest.filter(
      (value) => value !== "--dry-run" && value !== "--force" && value !== "--status-only"
    );
    const packId = positional[0];
    const arg2Target = compileTarget(positional[1]);
    const arg3Target = compileTarget(positional[2]);
    const version = arg2Target ? undefined : positional[1];
    const target = arg2Target ?? arg3Target ?? "agents";
    const repoPath = positional[arg2Target ? 2 : arg3Target ? 3 : version ? 2 : 1] ?? process.cwd();
    const dryRun = rest.includes("--dry-run");
    const force = rest.includes("--force");
    const statusOnly = rest.includes("--status-only");
    if (!packId) {
      usage();
      return;
    }

    const paths = resolveExperienceEnginePaths();
    const result = deployCompiledPack({
      packsDir: paths.packsDir,
      packId,
      version,
      target,
      repoPath,
      dryRun,
      force,
      statusOnly
    });
    console.log(`[ExperienceEngine] Deployed compiled pack ${packId}.`);
    console.log(`Deploy target: ${result.target}`);
    console.log(`Source: ${result.sourcePath}`);
    console.log(`Destination: ${result.destinationPath}`);
    console.log(`Status: ${result.deploymentStatus}`);
    console.log(`Status only: ${result.statusOnly}`);
    console.log(`Dry run: ${result.dryRun}`);
    console.log(`Overwrote existing file: ${result.overwritten}`);
    return;
  }

  if (action === "enable") {
    const packId = rest[0];
    const scopeId = rest[1] ?? resolveScope(process.cwd()).scope_id;
    if (!packId) {
      usage();
      return;
    }

    const pack = registry.readPack(packId);
    packRepo.upsertActivation({
      scope_id: scopeId,
      pack_id: packId,
      enabled: true,
      pinned_version: pack.currentVersion,
      created_at: nowIso(),
      updated_at: nowIso()
    });
    console.log(`[ExperienceEngine] Enabled experience pack ${packId} for scope ${scopeId}.`);
    return;
  }

  if (action === "disable") {
    const packId = rest[0];
    const scopeId = rest[1] ?? resolveScope(process.cwd()).scope_id;
    if (!packId) {
      usage();
      return;
    }

    const existing = packRepo.listActivations(scopeId).find((activation) => activation.pack_id === packId);
    packRepo.upsertActivation({
      scope_id: scopeId,
      pack_id: packId,
      enabled: false,
      pinned_version: existing?.pinned_version,
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso()
    });
    console.log(`[ExperienceEngine] Disabled experience pack ${packId} for scope ${scopeId}.`);
    return;
  }

  if (action === "rollback") {
    const packId = rest[0];
    const version = rest[1];
    if (!packId || !version) {
      usage();
      return;
    }

    registry.rollbackPack(packId, version);
    indexSync.syncPack(packId);
    console.log(`[ExperienceEngine] Rolled back experience pack ${packId} to ${version}.`);
    return;
  }

  usage();
};
