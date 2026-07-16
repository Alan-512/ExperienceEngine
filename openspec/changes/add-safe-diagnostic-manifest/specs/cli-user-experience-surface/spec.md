## ADDED Requirements

### Requirement: CLI provides privacy-safe diagnostic review preparation

ExperienceEngine SHALL expose diagnostics as an explicit local operator workflow rather than remote telemetry.

#### Scenario: User requests a concise diagnosis

- **WHEN** a user runs `ee diagnose`
- **THEN** the CLI SHALL render a concise summary from the strict safe diagnostic manifest
- **AND** it SHALL state that no files were uploaded

#### Scenario: User prepares a review bundle

- **WHEN** a user runs `ee diagnose --prepare-bundle`
- **THEN** the CLI SHALL print the fresh review-directory location and review instructions
- **AND** it SHALL NOT create a shareable archive automatically
