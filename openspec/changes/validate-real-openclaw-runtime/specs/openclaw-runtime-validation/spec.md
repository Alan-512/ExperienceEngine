## ADDED Requirements

### Requirement: Canonical Payload Fixture Promotion
The system SHALL provide a repeatable way to promote real OpenClaw development-runtime payloads into sanitized canonical fixtures stored in the repository.

#### Scenario: Developer captures a new payload shape
- **WHEN** a developer encounters a real OpenClaw payload shape not covered by the existing fixture corpus
- **THEN** the developer can sanitize the payload and add it under `tests/fixtures/openclaw/`
- **AND** the stored fixture preserves the structural fields needed for parser and replay validation

#### Scenario: Fixture promotion preserves deterministic replay
- **WHEN** a captured payload is promoted into the canonical fixture corpus
- **THEN** replay tests can consume it without requiring a live OpenClaw runtime
- **AND** the fixture omits secrets, tokens, and user-identifying values

### Requirement: Development Runtime Verification Workflow
The system SHALL define a local developer workflow for exercising the ExperienceEngine plugin against a real OpenClaw runtime before broad compatibility changes are accepted.

#### Scenario: Developer validates against local runtime
- **WHEN** the plugin's host payload assumptions change or a new event shape is observed
- **THEN** the repository provides a documented way to run the plugin against a local OpenClaw runtime
- **AND** the resulting payload samples can be compared against the existing fixture corpus

#### Scenario: Live validation feeds fixture updates
- **WHEN** local runtime validation reveals a new supported payload shape
- **THEN** the change adds or updates a canonical fixture
- **AND** replay coverage is extended to assert the expected plugin behavior for that shape

### Requirement: Payload Source Classification
The system SHALL classify host payload inputs used by runtime validation as guaranteed, inferred, or optional.

#### Scenario: Runtime validation documents stable inputs
- **WHEN** a developer reviews runtime-validation documentation
- **THEN** the workflow distinguishes fields the host guarantees from fields ExperienceEngine infers
- **AND** optional signals are identified so replay tests can cover degraded behavior
