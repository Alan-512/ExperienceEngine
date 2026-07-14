## ADDED Requirements

### Requirement: Canonical full-learning support requires installed artifact closure

ExperienceEngine SHALL describe the OpenClaw plugin as supporting the canonical package-local full-learning runtime only for a distribution channel/version whose actual installed artifact and live-host activation evidence passed the S7 gate.

#### Scenario: Plugin loads from an incomplete artifact

- **WHEN** OpenClaw can load the plugin entrypoint but the artifact omits or cannot resolve the supervisor, worker, runtime dependency, schema/migration, profile registry, or compatibility closure
- **THEN** the plugin SHALL remain interaction-only, status-only, or unavailable according to current evidence
- **AND** it SHALL NOT report full-learning support

#### Scenario: Actual artifact passes live activation

- **WHEN** the channel-specific installed artifact completes clean-home package-local supervisor/worker activation and one canonical protected queue operation
- **THEN** the plugin MAY expose the validated full-learning support state for that recorded channel/version/environment

#### Scenario: Another channel has no evidence

- **WHEN** one published channel passes but another has not been validated
- **THEN** the passing channel's plugin support statement SHALL NOT be copied to the other channel

### Requirement: Host-native lifecycle may bootstrap only constrained signed install evidence

ExperienceEngine SHALL allow the OpenClaw Gateway service to create a host-native install attestation only after exact closure, lifecycle root/state, canonical home/database, package metadata, and machine-integrity checks pass.

#### Scenario: No install attestation exists

- **WHEN** the verified host lifecycle starts the exact installed closure and no attestation exists
- **THEN** the allowed Gateway writer MAY atomically create `host_native_unattested` evidence signed by the machine integrity key
- **AND** production binding SHALL derive package identity from that signed evidence

#### Scenario: Conflicting attestation exists

- **WHEN** package, root, home, state directory, build, closure, or origin conflicts with an existing attestation
- **THEN** the Gateway SHALL fail closed and SHALL NOT overwrite or repair it implicitly

### Requirement: Lifecycle failure is diagnosable without structured logger metadata

ExperienceEngine SHALL place the stable runtime error code in the primary Gateway log message and persist safe runtime-health evidence.

#### Scenario: Closure or install binding fails

- **WHEN** the runtime service cannot bind
- **THEN** the first log message SHALL include `experienceengine.runtime_service_inactive code=<stable-code>`
- **AND** status/doctor SHALL expose the same code and a safe next action without requiring logger secondary metadata
