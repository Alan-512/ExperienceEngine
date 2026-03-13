## MODIFIED Requirements

### Requirement: ExperienceEngine uses low-noise inline visibility in agent CLIs
The product SHALL only surface inline notices in agent CLIs when ExperienceEngine actually intervenes.

#### Scenario: Skip remains silent

- **WHEN** ExperienceEngine evaluates a turn and chooses `skip`
- **THEN** it emits no inline user-facing notice

#### Scenario: Injection emits a one-line notice

- **WHEN** ExperienceEngine injects guidance into a turn
- **THEN** it emits a short one-line CLI notice
- **AND** the notice does not print the full injected hint text again
- **AND** the notice uses `ExperienceEngine` branding rather than an unexplained short product code

#### Scenario: User disables inline notices

- **WHEN** a user disables inline notices through the ExperienceEngine CLI settings surface
- **THEN** future injected turns remain silent in the main terminal output
- **AND** ExperienceEngine still performs injection and persists its normal records

#### Scenario: CLI acts as fallback rather than primary interaction surface

- **WHEN** ExperienceEngine exposes user-visible inspect, feedback, control, or operational actions
- **THEN** the long-term preferred day-to-day interaction path is the MCP surface
- **AND** the CLI remains available as a fallback, automation, and recovery path
