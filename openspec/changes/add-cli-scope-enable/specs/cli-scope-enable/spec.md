## ADDED Requirements

### Requirement: ExperienceEngine supports enabling the current scope from the CLI
ExperienceEngine SHALL let users re-enable interventions for the current workspace scope after that scope has been disabled.

#### Scenario: User enables a disabled scope
- **WHEN** a user runs `ee enable scope`
- **THEN** ExperienceEngine updates the current resolved scope to `is_disabled = false`
- **AND** it prints a short confirmation line identifying the enabled scope

#### Scenario: User enables an already-enabled scope
- **WHEN** a user runs `ee enable scope` for a scope with no stored disabled state
- **THEN** ExperienceEngine does not fail
- **AND** it prints a short acknowledgement that interventions are already enabled for that scope
