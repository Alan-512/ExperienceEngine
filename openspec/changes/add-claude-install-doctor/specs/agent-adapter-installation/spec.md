## MODIFIED Requirements

### Requirement: Adapter installations are inspectable

ExperienceEngine MUST expose host-specific install diagnostics for supported adapters.

#### Scenario: Inspect Claude Code install state

- **WHEN** a user runs `ee doctor claude-code`
- **THEN** ExperienceEngine reports whether Claude install-state exists
- **AND** whether the expected ExperienceEngine hook commands are present in `.claude/settings.local.json`
