## MODIFIED Requirements

### Requirement: ExperienceEngine state lifecycle is exposed through managed backup and restore workflows

ExperienceEngine SHALL expose backup, export, import, and rollback workflows over its own managed state using the same MCP plan-and-confirm safety model.

#### Scenario: Backup inventory is available as read-only MCP state

- **WHEN** an agent wants to inspect available ExperienceEngine backups
- **THEN** ExperienceEngine exposes backup inventory through read-only MCP resources

#### Scenario: Backup is planned before execution

- **WHEN** an agent wants to create an ExperienceEngine backup through MCP
- **THEN** it first obtains a structured backup plan
- **AND** the plan includes a confirmation token required for execution

#### Scenario: Rollback creates a safeguard backup

- **WHEN** an agent confirms an ExperienceEngine rollback through MCP
- **THEN** ExperienceEngine creates a safeguard backup of the current managed state before restoring the selected backup

#### Scenario: Import restores a valid exported snapshot

- **WHEN** an agent confirms an ExperienceEngine import through MCP with a valid snapshot path
- **THEN** ExperienceEngine restores the managed state from that snapshot
- **AND** it records the safeguard backup created before the restore
