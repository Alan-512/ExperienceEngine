import { nowIso } from "../utils/clock.js";
import { ExperiencePackRegistry } from "./fs-registry.js";
import { ExperiencePackRepository } from "../store/sqlite/repositories/pack-repo.js";

export class ExperiencePackIndexSync {
  constructor(
    private readonly registry: ExperiencePackRegistry,
    private readonly repo: ExperiencePackRepository
  ) {}

  syncPack(packId: string): void {
    const pack = this.registry.readPack(packId);
    this.repo.upsertPack({
      pack_id: pack.packId,
      name: pack.name,
      description: pack.description,
      owner: pack.owner,
      status: pack.status,
      current_version: pack.currentVersion,
      scope_hints: pack.scopeHints,
      task_families: pack.taskFamilies,
      host_compatibility: pack.hostCompatibility,
      created_at: pack.createdAt,
      updated_at: pack.updatedAt,
      published_at: pack.publishedAt,
      rolled_back_at: pack.rolledBackAt
    });

    for (const version of this.registry.listVersions(packId)) {
      this.repo.upsertVersion({
        pack_id: version.packId,
        version: version.version,
        status_snapshot: version.statusSnapshot,
        evidence_summary: version.evidenceSummary,
        benchmark_summary: version.benchmarkSummary,
        risk_level: version.riskLevel,
        ttl: version.ttl,
        host_compatibility: version.hostCompatibility,
        created_at: version.createdAt,
        published_at: version.publishedAt,
        rolled_back_from: version.rolledBackFrom
      });

      this.repo.replaceMemberships(
        packId,
        version.version,
        this.registry.readVersionNodes(packId, version.version).map((node) => ({
          pack_id: packId,
          version: version.version,
          node_id: node.id,
          created_at: nowIso()
        }))
      );
    }
  }

  syncAll(): void {
    for (const pack of this.registry.listPacks()) {
      this.syncPack(pack.packId);
    }
  }
}
