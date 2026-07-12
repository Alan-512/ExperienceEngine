## Why

The package-local runtime will place plugin, supervisor, worker, and configuration/control projections on one SQLite home. WAL and busy retries are necessary but are not ownership safety. Phase 0.5A.1 therefore requires explicit schema metadata, one migration owner, migration fencing, and mechanically defined plugin modes before process authority can be introduced.

This second slice depends on `establish-runtime-package-home-identity`. It does not create supervisor/worker leases or production queue authority.

## What Changes

- Add versioned SQLite concurrency settings and bounded busy/lock handling for the shared runtime database.
- Add schema metadata and compatibility checks bound to package generation and stable home identity.
- Add one migration authority with lease/fencing and crash-safe migration state.
- Prohibit opportunistic migration from the gateway plugin.
- Define plugin database modes: ready, read-only, warming, and incompatible.
- Keep all semantic learning writes disabled until later process, configuration, queue, and activation slices pass.

## Capabilities

### New Capabilities

- `runtime-schema-migration-authority`: Shared SQLite concurrency contract, schema compatibility metadata, singular migration ownership, migration recovery, and plugin schema modes for the package-local runtime.

## Impact

- Expected code areas: SQLite connection/bootstrap, schema and migration runner, database metadata repositories, plugin startup mode selection, doctor/status projection, and tests.
- Expected persisted concepts: schema version/range, migration state, migration owner/lease/fence, source/target version, progress/checkpoint, latest failure, and compatibility projection.
- Dependency: `establish-runtime-package-home-identity`.
- Held closed until: process authority is implemented in `add-runtime-process-authority`.
- No production learning support is enabled by this slice alone.
