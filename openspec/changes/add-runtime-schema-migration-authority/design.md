## Context

The frozen protocol requires one SQLite database shared by gateway plugin, package-local supervisor, and package-local worker. It also requires migration to have one owner and prohibits the plugin from attempting opportunistic schema upgrades. A participant must know whether it may read, write bounded producer records, wait for warming, or reject the store.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 4.12–4.13.

The implementation SHALL mechanically encode and test:

```text
sqlite_runtime_policy_version: sqlite-runtime-v1
journal_mode: WAL
synchronous: FULL
foreign_keys: ON
busy_timeout_ms: 5000
```

It SHALL also encode the full schema metadata, package schema ranges, migration states, migration protocol, failure mappings, transaction rules, and plugin-mode permission table. The OpenSpec names `ready`, `read_only`, `warming`, and `incompatible` are product summaries; implementation state and tests must preserve the frozen mode identities `interaction_ready`, `interaction_read_only`, `status_only_warming`, and `blocked_incompatible` or an exact lossless mapping.

S2 starts from the S1 fixed control-plane bootstrap schema. It owns every subsequent control-schema and learning-schema change. It SHALL NOT create another integrity key, home identity, bootstrap resolver, or competing fixed-schema exception.

S2 is implemented before S3 in the dependency sequence, but runtime migration acquisition depends on S3 objective fresh supervisor authority. S2 therefore defines a fail-closed supervisor-authority interface. Before S3 is connected, repository fixtures may test migration transitions directly, but no runtime path may acquire a migration lease or execute schema change.

## Goals / Non-Goals

**Goals:**

- Freeze SQLite WAL, synchronous, transaction-boundary, busy, and lock-failure behavior.
- Persist schema compatibility and migration state bound to package/home identity.
- Enforce one migration owner with fencing and crash-safe recovery.
- Define plugin behavior for ready, read-only, warming, and incompatible states.
- Keep ownership and production activation concerns separate.

**Non-Goals:**

- Treating WAL or busy retries as a lease.
- Starting the package-local supervisor or worker.
- Running provider validation.
- Enabling queue claims or semantic completion.
- Publishing the new runtime path.

## Decisions

### 1. Centralize connection policy

Every participant will use the same versioned SQLite connection policy, including WAL requirement, synchronous mode, foreign-key behavior, transaction classes, busy timeout/backoff bounds, and terminal lock-error mapping.

Startup must read back the effective PRAGMA values. Merely issuing configuration statements is not evidence that the shared database is operating under the frozen policy.

### 2. Make schema compatibility explicit

Schema metadata will identify current version, minimum/maximum compatible package protocol, migration status, and the package/home binding that observed or changed it. Compatibility is checked before authority acquisition.

### 3. Use singular migration authority

Only the package-local migration owner may execute schema changes. Ownership is represented by a fenced lease or equivalent single-writer CAS. Gateway plugin startup may inspect and choose a mode but cannot migrate.

The current package-local supervisor generation is the only process eligible to acquire that migration lease. The ordinary worker is not a migration owner.

SQLite lock ownership, gateway heartbeat, package installation, or S1 bootstrap-writer eligibility cannot satisfy this predicate. The runtime acquisition path remains disabled until S3 supplies the canonical supervisor authority decision.

### 4. Make migrations resumable or deterministically restartable

Each migration records source/target versions and a crash-safe state. A replacement owner can continue or restart only according to the migration's declared idempotency/recovery contract.

### 5. Separate plugin mode from product activation

`ready`, `read_only`, `warming`, and `incompatible` describe database access. None independently proves learning runtime active or production learning ready.

## Risks / Trade-offs

- [Risk] Long migrations can block startup. → Mitigation: explicit warming state, bounded transactions, checkpoints where needed, and truthful status projection.
- [Risk] Plugin reads can race schema changes. → Mitigation: compatibility snapshots and mode transitions tied to schema/migration revisions.
- [Risk] Busy retries can hide split-brain. → Mitigation: retain separate lease/fencing predicates and never infer ownership from lock acquisition.

## Acceptance Gate

- Focused tests cover connection settings, compatibility decisions, singular migration ownership, stale-owner fencing, crash recovery, and plugin mode selection.
- Gateway plugin cannot run migrations.
- Schema-ready state does not enable production queue work.
- `pnpm exec openspec validate add-runtime-schema-migration-authority --strict` passes.
