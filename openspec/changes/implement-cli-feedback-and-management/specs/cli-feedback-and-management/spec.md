## ADDED Requirements

### Requirement: ExperienceEngine supports explicit CLI feedback commands
ExperienceEngine SHALL let users record explicit helped or harmed feedback for the most recent injected experience set or for a specific node.

#### Scenario: User records feedback for the last injected experience
- **WHEN** a user runs `ee feedback --last helped`
- **THEN** ExperienceEngine updates the most recent injected node set with helped feedback
- **AND** it prints a short confirmation line

#### Scenario: User records feedback for a specific node
- **WHEN** a user runs `ee feedback node <id> harmed`
- **THEN** ExperienceEngine updates that node with harmed feedback
- **AND** it prints a short confirmation line

### Requirement: ExperienceEngine supports CLI node management
ExperienceEngine SHALL let users explicitly cool, disable, or retire a stored experience node from the CLI.

#### Scenario: User cools a node
- **WHEN** a user runs `ee cool node <id>`
- **THEN** ExperienceEngine updates that node state to `cooling`
- **AND** it prints a short confirmation line describing the effect

#### Scenario: User disables a node
- **WHEN** a user runs `ee disable node <id>`
- **THEN** ExperienceEngine prevents that node from being injected by moving it to a non-active state
- **AND** it prints a short confirmation line describing the effect

#### Scenario: User retires a node
- **WHEN** a user runs `ee retire node <id>`
- **THEN** ExperienceEngine updates that node state to `retired`
- **AND** it prints a short confirmation line describing the effect

### Requirement: ExperienceEngine supports CLI scope disablement
ExperienceEngine SHALL let users disable interventions for the current workspace scope without uninstalling the engine.

#### Scenario: User disables the current scope
- **WHEN** a user runs `ee disable scope`
- **THEN** ExperienceEngine marks the current resolved scope as disabled
- **AND** it prints a short confirmation line identifying the disabled scope

