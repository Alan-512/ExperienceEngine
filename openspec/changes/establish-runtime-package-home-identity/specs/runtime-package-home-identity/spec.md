## ADDED Requirements

### Requirement: Frozen package and home schemas are exhaustive

ExperienceEngine SHALL implement the complete package-generation identity, embedded closure-manifest, canonical home identity, resolution-order, layout-version, and path-normalization contracts imported from `phase-0.5a.1-freeze-2026-07-11`.

#### Scenario: Imported field or normalization rule is omitted

- **WHEN** an implementation manifest, home envelope, persistent identity, or test fixture omits an imported required field or normalization rule
- **THEN** the slice SHALL be considered non-conforming
- **AND** acceptance tests SHALL fail rather than treating the omitted contract as an implementation detail

#### Scenario: Runtime participant re-runs path precedence

- **WHEN** a supervisor or worker receives the gateway-resolved canonical home envelope
- **THEN** it SHALL verify and consume that envelope
- **AND** it SHALL NOT independently re-evaluate environment precedence or data-presence fallback

### Requirement: Machine integrity key precedes control-plane bootstrap

ExperienceEngine SHALL create or adopt one machine integrity key after canonical home resolution and before opening or creating the control-plane database.

#### Scenario: Empty home has no integrity key

- **WHEN** an allowed bootstrap participant initializes the canonical home
- **THEN** it SHALL atomically create `machine-secrets/integrity-key.json` with user-only permissions or adopt the concurrently committed key
- **AND** uncommitted losing key candidates SHALL be discarded

#### Scenario: Existing home presents another key id

- **WHEN** the observed key id differs from `runtime_control_meta.integrity_key_id`
- **THEN** startup SHALL fail with `EE_INTEGRITY_KEY_MISMATCH`
- **AND** v1 SHALL NOT rotate, replace, delete, re-sign, or silently adopt the different key

#### Scenario: Key supports multiple local fingerprints

- **WHEN** the integrity key is used for home, configuration, validation, secret, or diagnostic HMACs
- **THEN** each input SHALL begin with its frozen domain label and zero-byte separator
- **AND** an output from one domain SHALL NOT be reused as another domain's identifier or input

### Requirement: Empty-home control-plane bootstrap is fixed and bounded

ExperienceEngine SHALL create the frozen minimum control-plane authority schema through one versioned idempotent empty-home bootstrap transaction before normal migration authority exists.

#### Scenario: Bootstrap DDL is generated

- **WHEN** the fixed v1 control-plane bootstrap schema is defined
- **THEN** it SHALL contain every frozen minimum authority table with the complete imported initial fields, primary/unique keys, revision defaults, nullability, and required reference constraints
- **AND** later S3–S6 runtime startup SHALL NOT add missing v1 authority columns or tables opportunistically

#### Scenario: Concurrent empty-home bootstrap occurs

- **WHEN** allowed bootstrap participants race on one empty canonical home
- **THEN** they SHALL serialize and converge on one `control_schema_version`, integrity key id, `home_id`, path fingerprint, layout, and database-relative path

#### Scenario: Ordinary hook path encounters missing tables

- **WHEN** a normal gateway interaction hook observes an unbootstrapped database
- **THEN** it SHALL NOT create or alter tables
- **AND** only the package-local initializer, gateway service controller, or supervisor MAY invoke the fixed bootstrap routine

#### Scenario: Existing control schema needs change

- **WHEN** the fixed bootstrap schema already exists or has an unknown/unsupported version
- **THEN** S1 SHALL NOT alter or repair it opportunistically
- **AND** later compatible changes SHALL require S2 migration authority while unsupported state projects `blocked_incompatible`

### Requirement: Canonical home resolution uses the frozen v1 order

ExperienceEngine SHALL resolve the OpenClaw runtime home in this order: explicit OpenClaw ExperienceEngine home configuration, inherited `EXPERIENCE_ENGINE_HOME`, then the product default home.

#### Scenario: Legacy OpenClaw-local data is present

- **WHEN** no explicit or inherited home selects that legacy location but historical data exists there
- **THEN** the resolver SHALL NOT silently choose it by data presence
- **AND** explicit import or migration SHALL be required

#### Scenario: Initial layout is selected

- **WHEN** the v1 home is resolved
- **THEN** it SHALL use `home-layout-v1`, `home-path-normalization-v1`, and database-relative path `sqlite/experienceengine.db`

### Requirement: Runtime package closure is explicit and integrity-bound

ExperienceEngine SHALL represent each package-local OpenClaw runtime generation with one closure manifest that identifies the plugin entrypoint, supervisor entrypoint, worker entrypoint, schema and migration assets, packaged profile registry, protocol compatibility, and artifact integrity.

#### Scenario: Required runtime asset is present

- **WHEN** a package generation is inspected before runtime bootstrap
- **THEN** every required logical role SHALL resolve to a package-relative artifact covered by the closure manifest
- **AND** the observed integrity SHALL match the manifest binding

#### Scenario: Declared runtime asset is missing or altered

- **WHEN** a required entrypoint, dependency closure, schema asset, migration asset, or profile-registry asset is missing or fails integrity validation
- **THEN** the package generation SHALL be rejected before migration, supervisor, worker, queue, or activation authority is acquired

### Requirement: Shared-home resolution is canonical and versioned

ExperienceEngine SHALL use one versioned shared-home resolution algorithm for the OpenClaw plugin, package-local supervisor, package-local worker, configuration generation, activation records, and operator inspection.

#### Scenario: Explicit home is configured

- **WHEN** an explicit supported ExperienceEngine home is configured
- **THEN** every runtime participant SHALL resolve that home before any compatibility fallback
- **AND** each participant SHALL derive the same normalization version, stable home id, database location, and resolution mode

#### Scenario: Compatibility fallback is used

- **WHEN** no explicit home is configured and compatibility fallback is permitted
- **THEN** fallback SHALL be accepted only when all participants derive the same canonical home identity

### Requirement: Stable home identity is distinct from display path

ExperienceEngine SHALL compare runtime authority using a stable home identity and path-normalization version rather than unnormalized platform path text.

#### Scenario: Equivalent local path spellings are observed

- **WHEN** two supported path spellings normalize to the same canonical home under the same normalization version
- **THEN** they SHALL derive the same stable home id
- **AND** diagnostics MAY preserve their display path without changing authority identity

#### Scenario: Different stores are observed

- **WHEN** participants resolve different canonical database locations or stable home ids
- **THEN** ExperienceEngine SHALL treat the state as a shared-home mismatch
- **AND** no participant SHALL acquire protected write authority

#### Scenario: Concurrent first bootstrap occurs

- **WHEN** multiple participants race to initialize one empty canonical home
- **THEN** one insert-if-absent transaction SHALL create the random stable `home_id`
- **AND** losing participants SHALL adopt that committed identity rather than creating another identity

### Requirement: Package and home bindings precede later authority

ExperienceEngine SHALL bind package generation, artifact integrity, protocol compatibility, schema compatibility inputs, and stable home id before later slices can create migration, process, configuration, queue, or activation authority.

#### Scenario: Binding is incomplete

- **WHEN** any required package or home binding is absent, stale, or contradictory
- **THEN** later authority acquisition SHALL fail closed
- **AND** loaded plugin state, file existence, process id presence, or database creation SHALL NOT substitute for the missing binding

### Requirement: Identity foundations do not enable production learning

ExperienceEngine SHALL keep production learning unavailable after this capability is implemented in isolation.

#### Scenario: Package and home identity tests pass before later slices

- **WHEN** package closure and shared-home identity are valid but schema, process, configuration, queue, or production-activation authority is incomplete
- **THEN** ExperienceEngine SHALL report the identity foundation as ready for the next dependency
- **AND** it SHALL NOT report learning runtime active or production learning ready
