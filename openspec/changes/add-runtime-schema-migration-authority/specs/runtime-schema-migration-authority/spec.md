## ADDED Requirements

### Requirement: SQLite runtime policy v1 is exact and verified

ExperienceEngine SHALL apply `sqlite-runtime-v1` with `journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`, and `busy_timeout_ms = 5000` to the canonical shared database.

#### Scenario: Startup configures SQLite

- **WHEN** a runtime participant opens the canonical database
- **THEN** it SHALL issue the role-appropriate policy setup and read back the effective PRAGMA values
- **AND** startup SHALL fail or downgrade to the frozen non-writing mode when the effective values do not match

#### Scenario: Provider or child work is pending

- **WHEN** a provider, network, model, child-process, or host event must be awaited
- **THEN** no runtime participant SHALL keep an idle write transaction open while waiting

### Requirement: Imported schema and migration tables are exhaustive

ExperienceEngine SHALL implement the complete schema metadata, package compatibility ranges, migration states, migration lease fields, migration sequence, failure mappings, and plugin permission matrix imported from Sections 4.12–4.13.

#### Scenario: Imported state, field, or mode permission is missing

- **WHEN** the implementation omits an imported schema field, migration state, migration writer predicate, plugin mode, or allowed/forbidden behavior
- **THEN** the slice SHALL fail its contract-fixture and exhaustive-transition tests

### Requirement: Shared SQLite policy is versioned and consistent

ExperienceEngine SHALL use one versioned SQLite connection and transaction policy for every participant that opens the canonical runtime database.

#### Scenario: Participant opens a compatible shared database

- **WHEN** the plugin, migration owner, supervisor, worker, or operator inspection opens the canonical database
- **THEN** it SHALL apply the frozen WAL, synchronous, foreign-key, transaction-boundary, busy, and lock-failure policy for its access mode

#### Scenario: Busy or lock contention occurs

- **WHEN** SQLite reports busy or lock contention
- **THEN** ExperienceEngine SHALL apply only the bounded retry/backoff contract for that operation
- **AND** successful lock acquisition SHALL NOT be treated as migration, supervisor, worker, queue, or activation authority

### Requirement: Schema compatibility is bound to package and home identity

ExperienceEngine SHALL persist or derive schema version and compatibility state against the current package generation, protocol range, and stable home identity.

#### Scenario: Schema is compatible

- **WHEN** the current schema version is within the package generation's supported range and no conflicting migration is active
- **THEN** the participant SHALL receive the access mode allowed by its role

#### Scenario: Schema is incompatible

- **WHEN** the schema is newer, older without a permitted migration path, corrupt, or bound to contradictory package/home metadata
- **THEN** protected writes SHALL fail closed
- **AND** the state SHALL project as incompatible with an exact reason

### Requirement: Migration has one fenced owner

ExperienceEngine SHALL permit schema mutation only through one current migration authority for the canonical home.

#### Scenario: Migration authority is acquired

- **WHEN** the current package-local supervisor generation owns fresh supervisor authority, no fresh migration authority exists, and the exact schema/package/home revisions match
- **THEN** one owner MAY acquire the next monotonic migration fence and execute the declared migration plan

#### Scenario: Stale migration owner attempts a write

- **WHEN** a migration owner loses its lease, fence, expected migration revision, package generation, or stable home binding
- **THEN** every later migration write from that owner SHALL be rejected

#### Scenario: S3 supervisor authority is not yet available

- **WHEN** S2 schema and migration primitives are implemented before the S3 objective supervisor-authority provider
- **THEN** runtime migration-lease acquisition SHALL fail closed
- **AND** SQLite lock acquisition, gateway heartbeat, S1 bootstrap-writer eligibility, or package presence SHALL NOT substitute for fresh supervisor authority

### Requirement: S2 exclusively owns post-bootstrap schema change

ExperienceEngine SHALL treat the S1 fixed control-plane bootstrap as the only pre-migration DDL exception and SHALL route every later control-schema or learning-schema change through S2 migration authority.

#### Scenario: Existing bootstrap schema requires alteration

- **WHEN** a package requires a compatible schema change after S1 bootstrap
- **THEN** the current supervisor generation SHALL use the S2 migration lease and versioned migration protocol
- **AND** no gateway hook, initializer shortcut, worker, or package install path SHALL alter it opportunistically

### Requirement: Gateway plugin cannot migrate opportunistically

ExperienceEngine SHALL keep schema migration ownership outside the gateway plugin hot path.

#### Scenario: Plugin observes an older migratable schema

- **WHEN** the plugin opens a canonical home whose schema requires migration
- **THEN** it SHALL enter the defined warming or read-only behavior
- **AND** it SHALL NOT execute schema DDL or claim migration authority

### Requirement: Plugin schema modes are mechanical

ExperienceEngine SHALL classify gateway plugin database behavior as `ready`, `read_only`, `warming`, or `incompatible` using current schema and migration authority evidence.

#### Scenario: Plugin mode is ready

- **WHEN** schema compatibility is current and no migration blocks the plugin's permitted operations
- **THEN** the plugin MAY perform only the bounded operations assigned to the ready mode

#### Scenario: Interaction-ready mode permits producer writes

- **WHEN** the frozen `interaction_ready` predicates hold
- **THEN** the plugin MAY perform normal bounded interaction and short idempotent producer writes
- **AND** learning MAY still remain warming until production activation completes

#### Scenario: Plugin mode is warming

- **WHEN** a valid current migration owner is preparing or migrating the canonical home
- **THEN** the plugin SHALL avoid incompatible reads and writes
- **AND** it SHALL report warming rather than initialized or production-ready

#### Scenario: Plugin mode is read-only

- **WHEN** the frozen compatibility rules allow reads but prohibit writes
- **THEN** the plugin MAY perform only the explicitly compatible read operations

#### Scenario: Schema is not safely readable

- **WHEN** migration is active or the schema is not safely readable
- **THEN** the plugin SHALL expose status/repair explanation only
- **AND** it SHALL NOT perform DB-backed prompt injection

### Requirement: Migration recovery is crash-safe

ExperienceEngine SHALL record enough migration state to resume or deterministically restart after owner loss without exposing a partially authoritative schema.

#### Scenario: Migration owner exits during a migration

- **WHEN** the current migration authority becomes terminal before completion
- **THEN** a replacement owner SHALL use the persisted source version, target version, migration revision, fence, and checkpoint/recovery contract
- **AND** it SHALL NOT infer completion from files, process ids, or partial DDL visibility alone

### Requirement: Schema readiness does not authorize production learning

ExperienceEngine SHALL keep production semantic writes disabled when this capability is implemented without later process, configuration, queue, and activation authority.

#### Scenario: Schema migration completes before later slices

- **WHEN** the canonical database is schema-ready but no authoritative production activation handshake exists
- **THEN** the runtime SHALL NOT claim or semantically complete production learning work
