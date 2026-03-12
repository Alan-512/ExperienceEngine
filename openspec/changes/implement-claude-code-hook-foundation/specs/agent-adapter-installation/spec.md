## MODIFIED Requirements

### Requirement: ExperienceEngine exposes per-agent installer entrypoints

`ee install <agent>` MUST support host-specific installation flows without changing the core runtime contract.

#### Scenario: Install Claude Code hook foundation

- **WHEN** a user runs `ee install claude-code` in a project
- **THEN** ExperienceEngine writes its Claude Code hook configuration into the project's `.claude/settings.local.json`
- **AND** it persists Claude adapter install-state under the shared ExperienceEngine data home
- **AND** the installed hooks call back into the ExperienceEngine CLI

### Requirement: Claude Code foundation captures official hook payloads

ExperienceEngine MUST be able to capture Claude Code hook payloads before full intervention logic is implemented.

#### Scenario: Claude hook command receives JSON via stdin

- **WHEN** Claude Code invokes the ExperienceEngine hook command with official hook JSON on stdin
- **THEN** ExperienceEngine persists a capture file for that event under the Claude adapter capture directory
- **AND** the command exits successfully without blocking Claude Code by default
