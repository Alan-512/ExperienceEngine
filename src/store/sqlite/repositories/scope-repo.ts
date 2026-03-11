import type { DatabaseSync } from "node:sqlite";
import type { Scope } from "../../../types/domain.js";

export class ScopeRepository {
  constructor(private readonly db: DatabaseSync) {}

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
}
