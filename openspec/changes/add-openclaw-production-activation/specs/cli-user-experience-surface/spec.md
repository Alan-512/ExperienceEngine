## ADDED Requirements

### Requirement: CLI status separates setup, quality, health, activation, and value

ExperienceEngine SHALL provide a concise status fallback that reports the current setup state, quality profile/core quality, learning health, runtime activation, value state, and most important next action as separate projections.

#### Scenario: Runtime is interaction-only

- **WHEN** host wiring supports interaction but the production activation handshake is incomplete
- **THEN** status SHALL report interaction active and learning runtime inactive
- **AND** it SHALL NOT summarize the state as fully ready or healthy

#### Scenario: Learning is blocked on one capability

- **WHEN** setup is ready but a required capability is blocked or lacks a current valid route
- **THEN** status SHALL preserve setup readiness and report learning health paused with the blocking capability and next repair action

#### Scenario: Custom profile is current

- **WHEN** a custom profile is contract-valid and runtime-active
- **THEN** status SHALL report quality unbenchmarked separately from runtime health
- **AND** it SHALL disclose that custom-generated guidance remains shadow-only

### Requirement: OpenClaw doctor exposes authority-bound verbose evidence

ExperienceEngine SHALL provide an OpenClaw doctor fallback that distinguishes install/distribution channel, host wiring, package closure, home identity, schema/migration, supervisor/worker authority, production handshake, capability validation/assurance/routes, blocked queue state, and published evidence.

#### Scenario: Doctor runs in default mode

- **WHEN** an operator runs the OpenClaw doctor surface without verbose output
- **THEN** the result SHALL remain concise and identify the exact blocking layer and next action

#### Scenario: Doctor runs in verbose mode

- **WHEN** an operator requests verbose evidence
- **THEN** the result MAY include allowlisted fingerprints, revisions, route identities, stable failure codes, and evidence class
- **AND** it SHALL NOT expose secret values or treat source/local-pack evidence as published support
