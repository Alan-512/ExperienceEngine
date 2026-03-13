## ADDED Requirements

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

### Requirement: ExperienceEngine supports on-demand CLI inspection

The product SHALL expose explicit CLI commands for users who want to inspect recent or active experience behavior.

#### Scenario: User inspects the last intervention

- **WHEN** a user runs `ee inspect --last`
- **THEN** ExperienceEngine reports the last session/task context
- **AND** it reports whether intervention happened
- **AND** it reports which nodes were injected, if any

#### Scenario: User inspects active experiences

- **WHEN** a user runs `ee inspect active`
- **THEN** ExperienceEngine lists currently active experience nodes with enough metadata for user review

### Requirement: ExperienceEngine supports explicit feedback commands

The product SHALL let users correct or reinforce the automatic helped/harmed inference through explicit CLI commands.

#### Scenario: User records helped feedback for the last intervention

- **WHEN** a user runs `ee feedback --last helped`
- **THEN** ExperienceEngine records the feedback against the relevant injected node set
- **AND** it acknowledges the update with a short confirmation line

### Requirement: ExperienceEngine supports CLI management of bad experiences

The product SHALL let users disable or retire unwanted experiences through explicit CLI commands.

#### Scenario: User disables a node

- **WHEN** a user runs `ee disable node <id>`
- **THEN** ExperienceEngine marks that node so it no longer participates in injection
- **AND** it prints a short confirmation line describing the effect
