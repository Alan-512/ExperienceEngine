## 1. Baseline And Schema Metadata

- [x] 1.1 Materialize the imported SQLite policy, schema metadata, package-range, migration-state, failure-mapping, and plugin-mode tables as typed fixtures/constants used by exhaustive tests.
- [x] 1.2 Add tests for existing database bootstrap and migration behavior.
- [x] 1.3 Add schema compatibility, migration state, migration revision, and migration authority types.
- [x] 1.4 Add migrations/repositories for schema metadata and migration authority bound to package/home identity.

## 2. SQLite Concurrency Contract

- [x] 2.1 Centralize WAL, synchronous mode, foreign keys, transaction classes, busy timeout/backoff, and stable lock-error mapping.
- [x] 2.2 Add tests proving busy handling is bounded and is not treated as ownership authority.
- [x] 2.3 Read back and assert effective PRAGMA values; test that provider/network/model calls and child waits cannot occur inside write transactions.

## 3. Migration Ownership

- [x] 3.1 Add one fenced migration-owner acquisition/renewal/release/takeover protocol.
- [x] 3.2 Make migration execution crash-safe, resumable, or deterministically restartable per migration.
- [x] 3.3 Reject stale migration owners after fence or revision loss.
- [x] 3.4 Prohibit gateway plugin opportunistic migration.
- [x] 3.5 Prohibit the ordinary worker from acquiring migration authority and require current supervisor authority for migration lease acquisition.
- [x] 3.6 Add a fail-closed supervisor-authority interface and prove no runtime migration lease can be acquired before S3 supplies objective freshness; use isolated repository fixtures only for pre-S3 transition tests.

## 4. Plugin Database Modes

- [x] 4.1 Implement ready, read-only, warming, and incompatible schema projections.
- [x] 4.2 Limit each mode to its explicitly allowed read/write behavior.
- [x] 4.3 Add concise status/doctor diagnostics without implying runtime activation.

## 5. Validation

- [x] 5.1 Run focused SQLite, migration, compatibility, and plugin-mode tests.
- [x] 5.2 Run TypeScript typecheck and the full migration/repository test set.
- [x] 5.3 Run build validation with the packaged schema/migration closure.
- [x] 5.4 Run `pnpm exec openspec validate add-runtime-schema-migration-authority --strict`.
