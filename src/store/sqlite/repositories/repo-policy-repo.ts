import type { DatabaseSync } from "node:sqlite";
import type { RepoExperienceMode, RepoPolicy } from "../../../types/domain.js";
import { nowIso } from "../../../utils/clock.js";

type RepoPolicyRow = {
  scope_id: string;
  configured_mode: RepoPolicy["configured_mode"];
  effective_mode: RepoPolicy["effective_mode"];
  circuit_state: RepoPolicy["circuit_state"];
  circuit_reason: string | null;
  live_diagnostics_disabled: number;
  created_at: string;
  updated_at: string;
  last_tripped_at: string | null;
  restored_at: string | null;
};

export class RepoPolicyRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(row: RepoPolicyRow): RepoPolicy {
    return {
      scope_id: row.scope_id,
      configured_mode: row.configured_mode,
      effective_mode: row.effective_mode,
      circuit_state: row.circuit_state,
      circuit_reason: row.circuit_reason ?? undefined,
      live_diagnostics_disabled: Boolean(row.live_diagnostics_disabled),
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_tripped_at: row.last_tripped_at ?? undefined,
      restored_at: row.restored_at ?? undefined
    };
  }

  get(scopeId: string): RepoPolicy | undefined {
    const row = this.db.prepare("SELECT * FROM repo_policies WHERE scope_id = ? LIMIT 1").get(scopeId) as
      | RepoPolicyRow
      | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getOrCreate(scopeId: string, configuredMode: RepoExperienceMode = "safe"): RepoPolicy {
    const existing = this.get(scopeId);
    if (existing) {
      return existing;
    }

    const timestamp = nowIso();
    const policy: RepoPolicy = {
      scope_id: scopeId,
      configured_mode: configuredMode,
      effective_mode: configuredMode,
      circuit_state: "clear",
      live_diagnostics_disabled: false,
      created_at: timestamp,
      updated_at: timestamp
    };
    return this.upsert(policy);
  }

  upsert(policy: RepoPolicy): RepoPolicy {
    this.db
      .prepare(
        `INSERT INTO repo_policies
          (scope_id, configured_mode, effective_mode, circuit_state, circuit_reason, live_diagnostics_disabled,
           created_at, updated_at, last_tripped_at, restored_at)
         VALUES
          (@scope_id, @configured_mode, @effective_mode, @circuit_state, @circuit_reason, @live_diagnostics_disabled,
           @created_at, @updated_at, @last_tripped_at, @restored_at)
         ON CONFLICT(scope_id) DO UPDATE SET
          configured_mode = excluded.configured_mode,
          effective_mode = excluded.effective_mode,
          circuit_state = excluded.circuit_state,
          circuit_reason = excluded.circuit_reason,
          live_diagnostics_disabled = excluded.live_diagnostics_disabled,
          updated_at = excluded.updated_at,
          last_tripped_at = excluded.last_tripped_at,
          restored_at = excluded.restored_at`
      )
      .run({
        scope_id: policy.scope_id,
        configured_mode: policy.configured_mode,
        effective_mode: policy.effective_mode,
        circuit_state: policy.circuit_state,
        circuit_reason: policy.circuit_reason ?? null,
        live_diagnostics_disabled: Number(policy.live_diagnostics_disabled),
        created_at: policy.created_at,
        updated_at: policy.updated_at,
        last_tripped_at: policy.last_tripped_at ?? null,
        restored_at: policy.restored_at ?? null
      });

    return policy;
  }

  restore(scopeId: string, configuredMode: RepoExperienceMode = "safe"): RepoPolicy {
    const existing = this.getOrCreate(scopeId, configuredMode);
    const timestamp = nowIso();
    return this.upsert({
      ...existing,
      effective_mode: existing.configured_mode,
      circuit_state: "clear",
      circuit_reason: undefined,
      live_diagnostics_disabled: false,
      updated_at: timestamp,
      restored_at: timestamp
    });
  }
}
