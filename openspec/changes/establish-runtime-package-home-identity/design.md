## Context

Phase 0.5A.0 selected a package-local companion with package-local supervisor, OpenClaw-native controls, and one explicit ExperienceEngine home. Phase 0.5A.1 froze the requirement that plugin, supervisor, worker, configuration generation, activation handshakes, and operator paths cannot resolve different stores or package identities.

This slice establishes the immutable inputs used by all later authority decisions. It intentionally stops before SQLite migration ownership, leases, queue work, production activation, or published-artifact support validation.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 4.3, the stable control-plane bootstrap contract in 4.7, the complete initial physical table shapes/constraints referenced by 4.8, 4.13, 4.15, 4.17, 4.20, and 6.6, 4.14, the package-generation identity portion of 4.15, the embedded closure-manifest portion of 4.18, and the machine-integrity-key bootstrap portion of 6.6.

The implementation SHALL mechanically encode and test:

- resolution order: explicit OpenClaw EE home, inherited `EXPERIENCE_ENGINE_HOME`, then product default;
- exclusion of automatic data-presence fallback to a legacy OpenClaw-local home;
- `machine-secrets/integrity-key.json`, atomic create-if-absent/adopt, user-only permissions, first-key convergence, no rotation/replacement/deletion/re-signing in v1, and explicit HMAC domain separation;
- fixed idempotent empty-home control-plane bootstrap DDL with the complete initial fields, keys, uniqueness constraints, revision defaults, nullability, and foreign/reference constraints for every frozen minimum authority table; complete `runtime_control_meta` fields; allowed bootstrap writers; concurrent convergence; and the prohibition on changing existing control schema or learning tables outside S2;
- `home-layout-v1`, `home-path-normalization-v1`, and `sqlite/experienceengine.db`;
- the complete home identity, path-normalization, package-generation identity, and embedded closure-manifest fields;
- insert-if-absent concurrent home bootstrap;
- `EE_HOME_IDENTITY_MISMATCH` fail-closed behavior;
- the rule that gateway resolves once and supervisor/worker consume the passed canonical result rather than re-running precedence.

These imported values are normative. A locally simpler resolver or manifest is not an allowed implementation choice.

## Goals / Non-Goals

**Goals:**

- Describe and verify the complete runtime closure expected from one package generation.
- Resolve one canonical ExperienceEngine home using one versioned algorithm.
- Persist or derive one stable home identity that is independent of machine-local absolute path spelling.
- Reject package/home mismatches before authority acquisition or protected writes.
- Supply deterministic package/home bindings to later slices.

**Non-Goals:**

- Starting or supervising child processes.
- Opening a schema-incompatible database for writes.
- Running migrations.
- Validating provider credentials or routes.
- Claiming or completing learning work.
- Declaring npm, ClawHub, or OpenClaw full-learning support.

## Decisions

### 1. Treat package closure as an integrity-bound manifest

The runtime closure manifest will identify every required entrypoint and packaged asset by logical role, package-relative location, integrity digest, protocol version, and compatibility range. A declared-but-missing entrypoint is a hard closure failure.

### 2. Use one canonical home resolution algorithm

All participants will call the same resolver and record the same resolution mode, normalized home identity, database location, and path-normalization version. Compatibility fallback is legal only when it produces the same canonical identity for every participant.

The gateway is the only process that evaluates the frozen environment/configuration precedence. Supervisor and worker receive the resolved canonical home envelope and verify its identity; they do not independently select another path.

### 3. Create or adopt the machine integrity key before SQLite bootstrap

After canonical home resolution and before the control-plane database is opened or created, the package-local initializer, gateway service controller, or supervisor uses one atomic create-if-absent/adopt routine. Concurrent creators converge on the first committed key. The key material remains outside configuration generations and is excluded from diagnostics, exports, and distribution artifacts.

The same key is used only through frozen domain separation. The `home-path-v1` HMAC creates the normalized home-path fingerprint, and the winning key id is bound into `runtime_control_meta`. Any later key-id mismatch fails with `EE_INTEGRITY_KEY_MISMATCH` and cannot replace committed home identity.

### 4. Bootstrap only the fixed control plane

S1 owns the fixed empty-home bootstrap exception needed before leases and migration rows exist. The versioned idempotent bootstrap may create only the frozen minimum authority tables and `runtime_control_meta`; it cannot alter an existing control schema or any learning table. Unknown control-schema versions become `blocked_incompatible`.

The bootstrap DDL is physically complete for the frozen v1 control plane. S1 imports later-section field lists only to create tables/constraints/defaults; it does not implement their repositories, writers, transitions, or runtime authority. S3–S6 cannot add missing v1 authority columns during startup. Any later schema revision uses S2 migration ownership.

After this bootstrap, S2 is the sole owner of control-schema and learning-schema changes through migration authority.

### 5. Separate stable identity from local path display

The stable home id is bound to canonicalized home metadata rather than raw platform-specific path text. Diagnostics may show the resolved path, but authority comparisons use the stable identity and normalization version.

### 6. Fail before authority on mismatch

A participant that observes a package-generation, artifact-integrity, home-id, normalization-version, or database-location mismatch cannot acquire migration, supervisor, worker, configuration, queue, or activation authority.

### 7. Keep later behavior disabled

This slice may add manifests, identity types, inspectors, and bootstrap records. It must not make production queue work runnable. Later slices must explicitly consume these identities.

## Risks / Trade-offs

- [Risk] Platform path behavior can differ. → Mitigation: version the normalization algorithm and test Windows path casing, separators, symlink/junction handling where supported, and explicit-home precedence.
- [Risk] The manifest could drift from actual package contents. → Mitigation: generate or validate closure from packed artifacts and make missing declared assets a build/test failure.
- [Risk] A stable identity could expose machine-specific path data. → Mitigation: store a normalized digest/identifier and keep raw paths out of portable evidence.

## Acceptance Gate

- Focused tests prove deterministic package manifest identity and shared-home resolution.
- Mismatched plugin/supervisor/worker inputs fail before database authority.
- No absolute local paths are written into repository artifacts.
- `pnpm exec openspec validate establish-runtime-package-home-identity --strict` passes.
