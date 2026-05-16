## ADDED Requirements

### Requirement: CLI help is grouped by interaction tier

ExperienceEngine CLI help SHALL present commands in routine, operator, and advanced or experimental groups.

#### Scenario: User opens default help

- **WHEN** a user runs `ee` without a command
- **THEN** ExperienceEngine SHALL show a concise routine section for status, doctor, last inspection, and helped/harmed feedback
- **AND** it SHALL show a separate operator section for install, upgrade, repair, review, hygiene, export drafts, and managed state workflows
- **AND** it SHALL show advanced or experimental commands separately from routine usage

#### Scenario: User needs full command syntax

- **WHEN** CLI help includes the full command reference
- **THEN** ExperienceEngine SHALL keep the reference available without presenting every advanced command as part of the default routine path

### Requirement: CLI wording preserves host-first routine usage

ExperienceEngine CLI docs and help SHALL describe routine review and feedback as host-first where supported, with CLI as fallback and operator path.

#### Scenario: Host supports routine interaction

- **WHEN** CLI help or docs describe OpenClaw, Codex, or Claude Code routine review
- **THEN** they SHALL explain that routine review and feedback should stay inside the host session first
- **AND** they SHALL identify `ee inspect --last`, `ee helped`, and `ee harmed` as fallback or explicit operator commands

#### Scenario: Host wiring needs repair

- **WHEN** CLI help or docs describe install, upgrade, or repair
- **THEN** they SHALL frame those commands as operator workflows
- **AND** they SHALL avoid describing them as routine per-task actions

