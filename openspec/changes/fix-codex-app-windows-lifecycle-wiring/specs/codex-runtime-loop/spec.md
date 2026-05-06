## ADDED Requirements

### Requirement: Codex App project hooks do not reuse Claude lifecycle hooks

ExperienceEngine SHALL NOT install Claude Code lifecycle hooks into Codex App project configuration.

#### Scenario: Codex install avoids Claude hook entries

- **WHEN** ExperienceEngine installs or repairs the Codex adapter
- **THEN** it does not write `experienceengine-claude-hook` into `.codex/hooks.json`
- **AND** Codex MCP registration and the managed `AGENTS.md` instruction block remain the supported Codex host-native surfaces

#### Scenario: Invalid ExperienceEngine Claude hook drift is detected

- **WHEN** `.codex/hooks.json` contains an ExperienceEngine hook command that references `experienceengine-claude-hook`
- **THEN** `ee doctor codex` reports the project hook state as drifted
- **AND** the diagnostic explains that Claude Code hook protocol is not a valid Codex App lifecycle hook

### Requirement: Windows Codex wiring uses Windows-accessible commands

ExperienceEngine SHALL use runtime-target-appropriate command paths for Codex MCP registration.

#### Scenario: Windows runtime target does not register WSL paths

- **WHEN** Codex runtime target resolves to `windows`
- **THEN** the MCP command registered for Codex uses a Windows-accessible launcher
- **AND** the command does not contain `/mnt/<drive>/...` or `/home/...` paths
- **AND** the launcher path exists after install or repair

#### Scenario: Doctor flags runtime path mismatch

- **WHEN** Codex project or MCP configuration contains a WSL-style path while the runtime target is `windows`
- **THEN** `ee doctor codex` reports a runtime path mismatch
- **AND** the recommended next step is to run Codex repair rather than manually editing unrelated config
