## ADDED Requirements

### Requirement: Codex uses native lifecycle hooks

ExperienceEngine SHALL integrate with Codex lifecycle events through Codex-native hooks when Codex hooks are available.

#### Scenario: Codex install writes native hook entries

- **WHEN** ExperienceEngine installs or repairs the Codex adapter
- **THEN** it enables the managed `codex_hooks` feature flag
- **AND** writes ExperienceEngine-owned Codex hook entries for supported lifecycle events
- **AND** those hook entries invoke an ExperienceEngine Codex hook command rather than `experienceengine-claude-hook`
- **AND** Codex MCP registration and the managed `AGENTS.md` instruction block remain available as separate Codex host-native surfaces

#### Scenario: Codex UserPromptSubmit injects guidance

- **WHEN** Codex invokes the ExperienceEngine Codex hook for `UserPromptSubmit`
- **AND** ExperienceEngine selects prompt-time guidance for the current task
- **THEN** the hook returns Codex-valid additional context for the turn
- **AND** persists the injected node ids for later outcome attribution

#### Scenario: Codex PostToolUse and Stop support outcome attribution

- **WHEN** Codex invokes ExperienceEngine Codex hooks for tool and stop lifecycle events in the same session
- **THEN** ExperienceEngine persists normalized tool outcomes
- **AND** finalizes the task during `Stop`
- **AND** applies governance writeback using the injected node ids from the turn

#### Scenario: Invalid ExperienceEngine Claude hook drift is detected

- **WHEN** `.codex/hooks.json` contains an ExperienceEngine hook command that references `experienceengine-claude-hook`
- **THEN** `ee doctor codex` reports the project hook state as drifted
- **AND** the diagnostic explains that Claude Code hook protocol is not the valid ExperienceEngine Codex hook entrypoint

### Requirement: Windows Codex wiring uses Windows-accessible commands

ExperienceEngine SHALL use runtime-target-appropriate command paths for Codex hooks and MCP registration.

#### Scenario: Windows runtime target does not register WSL paths for Codex surfaces

- **WHEN** Codex runtime target resolves to `windows`
- **THEN** the hook commands configured for Codex use Windows-accessible launchers
- **AND** the MCP command registered for Codex uses a Windows-accessible launcher
- **AND** the command does not contain `/mnt/<drive>/...` or `/home/...` paths
- **AND** the hook and MCP launcher paths exist after install or repair

#### Scenario: Doctor flags runtime path mismatch

- **WHEN** Codex hook or MCP configuration contains a WSL-style path while the runtime target is `windows`
- **THEN** `ee doctor codex` reports a runtime path mismatch
- **AND** the recommended next step is to run Codex repair rather than manually editing unrelated config
