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
