## MODIFIED Requirements

### Requirement: ExperienceEngine supports recent history inspection from the CLI
ExperienceEngine SHALL let users inspect a compact list of recently recorded task outcomes and interventions.

#### Scenario: User inspects recent history
- **WHEN** a user runs `ee inspect recent`
- **THEN** ExperienceEngine lists recent recorded tasks in reverse chronological order
- **AND** each row includes enough context to understand whether intervention happened

#### Scenario: User inspects only recent injected turns
- **WHEN** a user runs `ee inspect recent injected`
- **THEN** ExperienceEngine lists only recent records with injected node ids

#### Scenario: User limits recent history rows
- **WHEN** a user runs `ee inspect recent 20`
- **THEN** ExperienceEngine lists at most 20 recent records
