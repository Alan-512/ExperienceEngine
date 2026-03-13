## MODIFIED Requirements

### Requirement: ExperienceEngine supports CLI scope disablement
ExperienceEngine SHALL let users disable interventions for the current workspace scope without uninstalling the engine.

#### Scenario: User disables the current scope
- **WHEN** a user runs `ee disable scope`
- **THEN** ExperienceEngine marks the current resolved scope as disabled
- **AND** it prints a short confirmation line identifying the disabled scope

#### Scenario: User re-enables the current scope
- **WHEN** a user runs `ee enable scope`
- **THEN** ExperienceEngine clears the disabled flag for the current resolved scope
- **AND** it prints a short confirmation line identifying the enabled scope
