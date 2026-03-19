import type { DatabaseSync } from "node:sqlite";
import type {
  ExperiencePackActivation,
  ExperiencePackMembership,
  ExperiencePackSummaryRecord,
  ExperiencePackVersionRecord
} from "../../../types/domain.js";

export class ExperiencePackRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsertPack(pack: ExperiencePackSummaryRecord): ExperiencePackSummaryRecord {
    this.db
      .prepare(
        `INSERT INTO experience_packs
          (pack_id, name, description, owner, status, current_version, scope_hints_json, task_families_json,
           host_compatibility_json, created_at, updated_at, published_at, rolled_back_at)
         VALUES
          (@pack_id, @name, @description, @owner, @status, @current_version, @scope_hints_json, @task_families_json,
           @host_compatibility_json, @created_at, @updated_at, @published_at, @rolled_back_at)
         ON CONFLICT(pack_id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          owner = excluded.owner,
          status = excluded.status,
          current_version = excluded.current_version,
          scope_hints_json = excluded.scope_hints_json,
          task_families_json = excluded.task_families_json,
          host_compatibility_json = excluded.host_compatibility_json,
          updated_at = excluded.updated_at,
          published_at = excluded.published_at,
          rolled_back_at = excluded.rolled_back_at`
      )
      .run({
        pack_id: pack.pack_id,
        name: pack.name,
        description: pack.description,
        owner: pack.owner,
        status: pack.status,
        current_version: pack.current_version,
        scope_hints_json: JSON.stringify(pack.scope_hints),
        task_families_json: JSON.stringify(pack.task_families),
        host_compatibility_json: JSON.stringify(pack.host_compatibility),
        created_at: pack.created_at,
        updated_at: pack.updated_at,
        published_at: pack.published_at ?? null,
        rolled_back_at: pack.rolled_back_at ?? null
      });

    return pack;
  }

  getPack(packId: string): ExperiencePackSummaryRecord | undefined {
    const row = this.db.prepare("SELECT * FROM experience_packs WHERE pack_id = ? LIMIT 1").get(packId) as
      | {
          pack_id: string;
          name: string;
          description: string;
          owner: string;
          status: ExperiencePackSummaryRecord["status"];
          current_version: string;
          scope_hints_json: string;
          task_families_json: string;
          host_compatibility_json: string;
          created_at: string;
          updated_at: string;
          published_at: string | null;
          rolled_back_at: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      pack_id: row.pack_id,
      name: row.name,
      description: row.description,
      owner: row.owner,
      status: row.status,
      current_version: row.current_version,
      scope_hints: JSON.parse(row.scope_hints_json) as ExperiencePackSummaryRecord["scope_hints"],
      task_families: JSON.parse(row.task_families_json) as ExperiencePackSummaryRecord["task_families"],
      host_compatibility: JSON.parse(
        row.host_compatibility_json
      ) as ExperiencePackSummaryRecord["host_compatibility"],
      created_at: row.created_at,
      updated_at: row.updated_at,
      published_at: row.published_at ?? undefined,
      rolled_back_at: row.rolled_back_at ?? undefined
    };
  }

  listPacks(): ExperiencePackSummaryRecord[] {
    return this.db
      .prepare("SELECT pack_id FROM experience_packs ORDER BY updated_at DESC")
      .all()
      .map((row) => this.getPack((row as { pack_id: string }).pack_id)!)
      .filter(Boolean);
  }

  upsertVersion(version: ExperiencePackVersionRecord): ExperiencePackVersionRecord {
    this.db
      .prepare(
        `INSERT INTO experience_pack_versions
          (pack_id, version, status_snapshot, evidence_summary, benchmark_summary, risk_level, ttl,
           host_compatibility_json, created_at, published_at, rolled_back_from)
         VALUES
          (@pack_id, @version, @status_snapshot, @evidence_summary, @benchmark_summary, @risk_level, @ttl,
           @host_compatibility_json, @created_at, @published_at, @rolled_back_from)
         ON CONFLICT(pack_id, version) DO UPDATE SET
          status_snapshot = excluded.status_snapshot,
          evidence_summary = excluded.evidence_summary,
          benchmark_summary = excluded.benchmark_summary,
          risk_level = excluded.risk_level,
          ttl = excluded.ttl,
          host_compatibility_json = excluded.host_compatibility_json,
          published_at = excluded.published_at,
          rolled_back_from = excluded.rolled_back_from`
      )
      .run({
        pack_id: version.pack_id,
        version: version.version,
        status_snapshot: version.status_snapshot,
        evidence_summary: version.evidence_summary,
        benchmark_summary: version.benchmark_summary ?? null,
        risk_level: version.risk_level,
        ttl: version.ttl ?? null,
        host_compatibility_json: JSON.stringify(version.host_compatibility),
        created_at: version.created_at,
        published_at: version.published_at ?? null,
        rolled_back_from: version.rolled_back_from ?? null
      });

    return version;
  }

  listVersions(packId: string): ExperiencePackVersionRecord[] {
    return this.db
      .prepare("SELECT * FROM experience_pack_versions WHERE pack_id = ? ORDER BY created_at DESC")
      .all(packId)
      .map((row) => {
        const typed = row as {
          pack_id: string;
          version: string;
          status_snapshot: ExperiencePackVersionRecord["status_snapshot"];
          evidence_summary: string;
          benchmark_summary: string | null;
          risk_level: ExperiencePackVersionRecord["risk_level"];
          ttl: string | null;
          host_compatibility_json: string;
          created_at: string;
          published_at: string | null;
          rolled_back_from: string | null;
        };

        return {
          pack_id: typed.pack_id,
          version: typed.version,
          status_snapshot: typed.status_snapshot,
          evidence_summary: typed.evidence_summary,
          benchmark_summary: typed.benchmark_summary ?? undefined,
          risk_level: typed.risk_level,
          ttl: typed.ttl ?? undefined,
          host_compatibility: JSON.parse(
            typed.host_compatibility_json
          ) as ExperiencePackVersionRecord["host_compatibility"],
          created_at: typed.created_at,
          published_at: typed.published_at ?? undefined,
          rolled_back_from: typed.rolled_back_from ?? undefined
        };
      });
  }

  replaceMemberships(packId: string, version: string, memberships: ExperiencePackMembership[]): void {
    this.db
      .prepare("DELETE FROM experience_pack_memberships WHERE pack_id = ? AND version = ?")
      .run(packId, version);

    const statement = this.db.prepare(
      `INSERT INTO experience_pack_memberships (pack_id, version, node_id, created_at)
       VALUES (@pack_id, @version, @node_id, @created_at)`
    );

    for (const membership of memberships) {
      statement.run(membership);
    }
  }

  listMemberships(packId: string, version: string): ExperiencePackMembership[] {
    return this.db
      .prepare(
        "SELECT pack_id, version, node_id, created_at FROM experience_pack_memberships WHERE pack_id = ? AND version = ? ORDER BY node_id"
      )
      .all(packId, version) as ExperiencePackMembership[];
  }

  upsertActivation(activation: ExperiencePackActivation): ExperiencePackActivation {
    this.db
      .prepare(
        `INSERT INTO experience_pack_activations
          (scope_id, pack_id, enabled, pinned_version, created_at, updated_at)
         VALUES
          (@scope_id, @pack_id, @enabled, @pinned_version, @created_at, @updated_at)
         ON CONFLICT(scope_id, pack_id) DO UPDATE SET
          enabled = excluded.enabled,
          pinned_version = excluded.pinned_version,
          updated_at = excluded.updated_at`
      )
      .run({
        scope_id: activation.scope_id,
        pack_id: activation.pack_id,
        enabled: activation.enabled ? 1 : 0,
        pinned_version: activation.pinned_version ?? null,
        created_at: activation.created_at,
        updated_at: activation.updated_at
      });

    return activation;
  }

  listActivations(scopeId: string): ExperiencePackActivation[] {
    return this.db
      .prepare(
        "SELECT scope_id, pack_id, enabled, pinned_version, created_at, updated_at FROM experience_pack_activations WHERE scope_id = ? ORDER BY pack_id"
      )
      .all(scopeId)
      .map((row) => {
        const typed = row as {
          scope_id: string;
          pack_id: string;
          enabled: number;
          pinned_version: string | null;
          created_at: string;
          updated_at: string;
        };

        return {
          scope_id: typed.scope_id,
          pack_id: typed.pack_id,
          enabled: typed.enabled === 1,
          pinned_version: typed.pinned_version ?? undefined,
          created_at: typed.created_at,
          updated_at: typed.updated_at
        };
      });
  }

  listActivationsByPack(packId: string): ExperiencePackActivation[] {
    return this.db
      .prepare(
        "SELECT scope_id, pack_id, enabled, pinned_version, created_at, updated_at FROM experience_pack_activations WHERE pack_id = ? ORDER BY scope_id"
      )
      .all(packId)
      .map((row) => {
        const typed = row as {
          scope_id: string;
          pack_id: string;
          enabled: number;
          pinned_version: string | null;
          created_at: string;
          updated_at: string;
        };

        return {
          scope_id: typed.scope_id,
          pack_id: typed.pack_id,
          enabled: typed.enabled === 1,
          pinned_version: typed.pinned_version ?? undefined,
          created_at: typed.created_at,
          updated_at: typed.updated_at
        };
      });
  }
}
