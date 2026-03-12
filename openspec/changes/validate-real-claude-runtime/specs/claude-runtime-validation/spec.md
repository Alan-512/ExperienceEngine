## ADDED Requirements

### Requirement: Claude runtime validation workflow exists

ExperienceEngine MUST define a developer workflow for validating the Claude Code adapter against a real local Claude runtime.

#### Scenario: Developer validates Claude adapter against a live local run

- **WHEN** a developer enables ExperienceEngine hooks in a local Claude project and runs Claude Code
- **THEN** ExperienceEngine captures real Claude hook payloads
- **AND** the workflow documents how those payloads become sanitized fixtures

### Requirement: Real Claude payloads inform replay coverage

Real Claude hook payloads MUST be promotable into deterministic repository test assets.

#### Scenario: Real Claude payload sequence is promoted

- **WHEN** a real Claude validation run captures a new payload shape
- **THEN** ExperienceEngine adds a sanitized fixture and replay assertion for that shape
- **AND** future Claude compatibility fixes can target the fixture first
