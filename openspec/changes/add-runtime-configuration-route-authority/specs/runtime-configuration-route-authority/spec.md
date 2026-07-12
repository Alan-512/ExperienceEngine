## ADDED Requirements

### Requirement: Imported configuration, validation, registry, and route schemas are exhaustive

ExperienceEngine SHALL implement the complete quality-profile, registry, immutable generation, validation, route-envelope, capability-route, runtime-projection, invalidation, and fallback contracts imported from Sections 5–7.

#### Scenario: Imported field, enum, compatibility rule, route, or invalidation binding is omitted

- **WHEN** a schema, manifest, route resolver, projection, validator, or test fixture omits an imported member
- **THEN** the slice SHALL fail exhaustive contract tests
- **AND** the omission SHALL NOT default to optimistic compatibility, validation, assurance, or health

### Requirement: Configuration authority consumes the S1 integrity key

ExperienceEngine SHALL load and verify the machine integrity key authority established by S1 before creating or validating configuration generations.

#### Scenario: S1 key and runtime control metadata match

- **WHEN** the key file is readable and its key id equals `runtime_control_meta.integrity_key_id`
- **THEN** S4 MAY use it through the frozen configuration/secret HMAC domains
- **AND** generation manifests SHALL bind only the key id and HMAC outputs, never key material

#### Scenario: Conflicting key state is observed

- **WHEN** an existing home presents a missing, replaced, or contradictory key id
- **THEN** configuration publication and production activation SHALL fail closed
- **AND** S4 SHALL NOT create, rotate, replace, repair, re-sign, or implicitly adopt another key

### Requirement: Configuration generations are immutable and crash-atomically published

ExperienceEngine SHALL assemble settings, validation references, route state, registry evidence, and secret-reference integrity into an immutable configuration generation and publish it through one current-authority pointer CAS.

#### Scenario: Candidate generation is valid

- **WHEN** the candidate manifest is complete and the exact retained base pointer revision and generation match
- **THEN** one transaction SHALL insert the immutable generation and advance the current authority row/pointer

#### Scenario: Publication crashes or caller is stale

- **WHEN** the transaction does not commit or the expected base revision/generation no longer matches
- **THEN** the previous current generation SHALL remain authoritative
- **AND** no partial candidate files or rows SHALL become current

### Requirement: Secret integrity does not expose secret values

ExperienceEngine SHALL bind configured secret references to a configuration generation with HMAC or equivalent home-key integrity without persisting raw secret values in generation manifests, validation records, route projections, or diagnostics.

#### Scenario: Secret reference changes

- **WHEN** the effective secret reference or its integrity binding changes
- **THEN** dependent validation and route authority SHALL become stale
- **AND** the changed secret value SHALL NOT be revealed in the invalidation record

### Requirement: Validation is capability-specific and fully bound

ExperienceEngine SHALL record provider and embedding validation per capability and actual route rather than treating configured provider/model fields as proof.

#### Scenario: Capability validation succeeds

- **WHEN** the declared probe succeeds for the exact home, package generation, configuration generation, capability, adapter, schema versions, route set, registry evidence, and secret references
- **THEN** a bounded validation record MAY be committed for those exact bindings

#### Scenario: Another capability lacks evidence

- **WHEN** one capability is validated but another required capability has no current matching record
- **THEN** the validated capability SHALL NOT relabel the other capability as validated

### Requirement: Runtime route projection has one writer and monotonic revision

ExperienceEngine SHALL maintain one current capability-route/effective-route-set projection through an authority-bound atomic replacement protocol.

#### Scenario: Route set is replaced

- **WHEN** the current package-local supervisor holds exact owner/epoch, configuration, home, package, schema, effective-route-set, expected projection-revision authority, current worker observation/fence where applicable, and S6 `production_write_authorized(mutable_route_projection)`
- **THEN** one transaction MAY replace the complete route projection and advance its monotonic revision

#### Scenario: Partial or stale route write occurs

- **WHEN** a writer presents stale authority or attempts a partial unbound route update
- **THEN** the update SHALL be rejected
- **AND** no mixed effective route set SHALL become current

#### Scenario: Worker reports capability health

- **WHEN** a worker submits a capability-health observation through package-local IPC
- **THEN** the supervisor SHALL accept it only when the exact current worker owner/fence and route envelope match
- **AND** the worker SHALL NOT write the projection directly

#### Scenario: Plugin observes route state

- **WHEN** the gateway plugin reads route/health status
- **THEN** it SHALL remain read-only and SHALL NOT author route identity or runtime health

#### Scenario: Projection is missing, malformed, partial, or authority-mismatched

- **WHEN** the current projection cannot be verified against home, package, configuration, effective route set, supervisor epoch, or worker fence
- **THEN** runtime health SHALL project as blocked or unknown/warming
- **AND** it SHALL NOT project healthy

#### Scenario: S6 production authority is unavailable

- **WHEN** S4 configuration, validation, and route-envelope foundations are implemented before S6 provides the canonical protected-write decision
- **THEN** mutable runtime-route projection writes SHALL fail closed
- **AND** runtime health SHALL remain blocked or unknown/warming rather than healthy

### Requirement: Effective environment changes invalidate bound authority

ExperienceEngine SHALL include supported effective environment overrides in the route fingerprint and invalidate stale records when the effective route changes.

#### Scenario: Environment override changes provider routing

- **WHEN** a supported environment override changes adapter, model, endpoint class, fallback, or another route-defining input
- **THEN** the effective route fingerprint SHALL change
- **AND** prior validation, route-health, and production-handshake bindings SHALL no longer be current

#### Scenario: Worker sees undeclared environment differences

- **WHEN** a worker process observes environment values outside the supervisor-provided normalized route envelope
- **THEN** it SHALL NOT reinterpret or alter route identity
- **AND** unknown or non-allowlisted environment SHALL NOT silently change routing

### Requirement: Packaged profile registry is versioned and integrity-checked

ExperienceEngine SHALL ship a minimum local quality-profile registry whose entries have versioned identity, package binding, integrity, compatibility, supersession, deprecation, and revocation semantics.

#### Scenario: Recommended profile is selected

- **WHEN** a profile is labeled evaluated or recommended
- **THEN** the exact compatible non-revoked registry entry and evidence identity SHALL be bound to the configuration generation

#### Scenario: Registry entry is incompatible or revoked

- **WHEN** the package, protocol, schema, or integrity binding does not match or the entry is revoked
- **THEN** it SHALL NOT authorize that profile or raise assurance

### Requirement: Custom-origin content remains shadow-only in v1

ExperienceEngine SHALL preserve `custom-shadow-only-v1` as an unconditional delivery-state cap for any semantic content containing unbenchmarked custom origin.

#### Scenario: Custom route validates successfully

- **WHEN** a custom provider/route passes its configured validation and later records positive outcomes
- **THEN** its semantic-origin nodes SHALL remain `shadow_only`
- **AND** profile labels, confidence, governance maturity, manual promotion, or route state SHALL NOT move them to conservative or normal live delivery

### Requirement: Configuration authority is not production activation

ExperienceEngine SHALL require a later current production activation handshake bound to the exact configuration generation and route projection.

#### Scenario: Configuration and routes are current before production activation

- **WHEN** validation and route authority are current but no authoritative production handshake binds them
- **THEN** a worker SHALL NOT claim or semantically complete production learning work
