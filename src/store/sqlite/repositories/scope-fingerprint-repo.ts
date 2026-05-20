import type { DatabaseSync } from "node:sqlite";
import type { ScopeFingerprint } from "../../../types/domain.js";

export class ScopeFingerprintRepository {
  constructor(private readonly db: DatabaseSync) {}

  getById(scopeId: string): ScopeFingerprint | undefined {
    const row = this.db.prepare("SELECT * FROM scope_fingerprints WHERE scope_id = ? LIMIT 1").get(scopeId) as
      | ScopeFingerprint
      | undefined;
    return row ?? undefined;
  }

  upsert(fingerprint: ScopeFingerprint): ScopeFingerprint {
    this.db
      .prepare(
        `INSERT INTO scope_fingerprints (scope_id, schema_version, fingerprint_hash, fingerprint_json, created_at, updated_at)
         VALUES (@scope_id, @schema_version, @fingerprint_hash, @fingerprint_json, @created_at, @updated_at)
         ON CONFLICT(scope_id) DO UPDATE SET
           schema_version = excluded.schema_version,
           fingerprint_hash = excluded.fingerprint_hash,
           fingerprint_json = excluded.fingerprint_json,
           updated_at = excluded.updated_at`
      )
      .run(fingerprint);
    return fingerprint;
  }
}
