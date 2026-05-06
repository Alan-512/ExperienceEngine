## ADDED Requirements

### Requirement: Codex diagnostics distinguish MCP, wrapper, and hook surfaces

ExperienceEngine CLI diagnostics SHALL distinguish Codex MCP wiring, Codex CLI wrapper lifecycle, and Codex-native hook lifecycle wiring.

#### Scenario: Doctor reports separate Codex surfaces

- **WHEN** an operator runs `ee doctor codex`
- **THEN** the output reports Codex MCP registration state separately from CLI fallback availability
- **AND** reports `codex_hooks` feature state and Codex project hook state separately from both
- **AND** does not imply that a working MCP registration means project hooks are healthy

#### Scenario: Doctor gives actionable guidance for hook failures

- **WHEN** Codex hook drift is detected
- **THEN** doctor output identifies the invalid hook command
- **AND** recommends `ee repair codex`
- **AND** explains that `ee codex exec` remains the deterministic lifecycle fallback

#### Scenario: Doctor reports disabled Codex hooks

- **WHEN** Codex hook entries are present but `codex_hooks` is disabled or missing
- **THEN** doctor output reports the hook feature as disabled
- **AND** recommends `ee repair codex`
- **AND** does not report hooks as healthy solely because hook files exist

#### Scenario: Repair output lists concrete Codex changes

- **WHEN** `ee repair codex` changes Codex configuration
- **THEN** the output lists whether MCP registration was refreshed
- **AND** lists whether `codex_hooks` was enabled
- **AND** lists whether Codex-native hooks were installed or refreshed
- **AND** lists whether invalid project hooks were removed
- **AND** lists whether managed instructions were updated
