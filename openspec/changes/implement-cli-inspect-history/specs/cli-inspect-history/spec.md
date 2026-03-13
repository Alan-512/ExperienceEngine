## ADDED Requirements

### Requirement: ExperienceEngine supports recent history inspection from the CLI
ExperienceEngine SHALL let users inspect a compact list of recently recorded task outcomes and interventions.

#### Scenario: User inspects recent history
- **WHEN** a user runs `ee inspect recent`
- **THEN** ExperienceEngine lists recent recorded tasks in reverse chronological order
- **AND** each row includes enough context to understand whether intervention happened

### Requirement: ExperienceEngine supports single-node inspection from the CLI
ExperienceEngine SHALL let users inspect detailed metadata for one stored experience node.

#### Scenario: User inspects a specific node
- **WHEN** a user runs `ee inspect node <id>`
- **THEN** ExperienceEngine prints the stored metadata for that node
- **AND** it includes node type, task type, state, counters, and compact hint

#### Scenario: User inspects a missing node
- **WHEN** a user runs `ee inspect node <id>` for an unknown node id
- **THEN** ExperienceEngine prints a short not-found message
