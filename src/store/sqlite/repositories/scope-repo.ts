import type { DatabaseSync } from "node:sqlite";
import type { Scope } from "../../../types/domain.js";

export class ScopeRepository {
  constructor(private readonly db: DatabaseSync) {}

  getById(scopeId: string): Scope | undefined {
    const row = this.db.prepare("SELECT * FROM scopes WHERE scope_id = ? LIMIT 1").get(scopeId) as
      | {
          scope_id: string;
          scope_type: Scope["scope_type"];
          scope_name: string;
          root_path: string | null;
          is_disabled: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      scope_id: row.scope_id,
      scope_type: row.scope_type,
      scope_name: row.scope_name,
      root_path: row.root_path ?? undefined,
      is_disabled: Boolean(row.is_disabled),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  upsert(scope: Scope): Scope {
    this.db
      .prepare(
        `INSERT INTO scopes (scope_id, scope_type, scope_name, root_path, is_disabled, created_at, updated_at)
         VALUES (@scope_id, @scope_type, @scope_name, @root_path, @is_disabled, @created_at, @updated_at)
         ON CONFLICT(scope_id) DO UPDATE SET
           scope_type = excluded.scope_type,
           scope_name = excluded.scope_name,
           root_path = excluded.root_path,
           is_disabled = excluded.is_disabled,
           updated_at = excluded.updated_at`
      )
      .run({ ...scope, is_disabled: Number(scope.is_disabled) });
    return scope;
  }

  setDisabled(scopeId: string, disabled: boolean): Scope | undefined {
    const existing = this.getById(scopeId);
    if (!existing) {
      return undefined;
    }

    const next = {
      ...existing,
      is_disabled: disabled
    };

    return this.upsert(next);
  }
}
