## Why

The frozen Phase 0.5A.1 protocol requires every OpenClaw runtime participant to agree on one package generation and one ExperienceEngine home before any database or process authority is established. The current product does not yet ship a package-local supervisor/worker closure or a durable shared-home identity contract.

This is the first implementation slice. It creates only package-closure and home-identity foundations. It does not start the supervisor, migrate a database, claim queue work, or make production learning available.

## What Changes

- Add a package runtime-closure manifest covering the plugin, package-local supervisor, package-local worker, schema/migration assets, packaged profile registry, compatibility metadata, and artifact integrity.
- Add canonical shared-home resolution and path-normalization rules used by plugin, supervisor, worker, and operator paths.
- Add the atomic create-if-absent/adopt machine-integrity-key protocol required before the control-plane database is opened or created.
- Add the fixed versioned empty-home control-plane bootstrap schema and `runtime_control_meta` identity transaction that breaks the initial lease/migration-table dependency cycle.
- Add a stable home identity and mismatch guard that fails before participants can open divergent stores or acquire authority.
- Add package generation and compatibility identity needed by later schema, process, configuration, activation, and distribution slices.
- Keep all target runtime behavior fail-closed until later OpenSpec changes are implemented and accepted.

## Capabilities

### New Capabilities

- `runtime-package-home-identity`: Deterministic package closure, package-generation identity, canonical shared-home resolution, stable home identity, and mismatch rejection for the future OpenClaw package-local runtime.

## Impact

- Expected code areas: package metadata/build closure, install/runtime path resolution, ExperienceEngine home resolution, package compatibility helpers, SQLite bootstrap inputs, doctor/status inspection, and focused tests.
- Expected persisted concepts: machine integrity key file/key id, fixed control schema version, stable home id, path-normalization version, resolved-home fingerprint, package generation id, package artifact-integrity digest, and compatibility range metadata.
- Dependency: none.
- Held closed until: schema/migration authority is implemented in `add-runtime-schema-migration-authority`.
- No current support claim changes.
