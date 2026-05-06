## ADDED Requirements

### Requirement: Codex repair removes ExperienceEngine-owned invalid hook drift

ExperienceEngine SHALL repair invalid Codex App hook entries that it can identify as ExperienceEngine-owned.

#### Scenario: Repair installs missing Codex-native hooks

- **WHEN** Codex hooks are absent or missing ExperienceEngine-owned Codex hook entries
- **THEN** `ee repair codex` enables the managed `codex_hooks` feature flag
- **AND** installs ExperienceEngine-owned Codex hook entries for the supported lifecycle events
- **AND** refreshes Codex MCP registration for the resolved runtime target

#### Scenario: Repair removes invalid Claude hook entries and preserves user hooks

- **WHEN** `.codex/hooks.json` contains an ExperienceEngine hook command referencing `experienceengine-claude-hook`
- **AND** the file also contains unrelated user hook entries
- **THEN** `ee repair codex` removes the invalid ExperienceEngine hook entry
- **AND** unrelated user hook entries remain unchanged
- **AND** ExperienceEngine-owned Codex hook entries are present after repair
- **AND** Codex MCP registration is refreshed for the resolved runtime target

#### Scenario: Repair deletes empty invalid hook file when hooks are installed elsewhere

- **WHEN** `.codex/hooks.json` only contains invalid ExperienceEngine Claude hook entries
- **AND** ExperienceEngine installs Codex-native hooks in a different managed config layer
- **THEN** `ee repair codex` removes the invalid entries
- **AND** deletes `.codex/hooks.json` if no hooks remain in that file
- **AND** reports the deletion as part of the repair summary

#### Scenario: Malformed hook JSON is not overwritten silently

- **WHEN** `.codex/hooks.json` cannot be parsed as JSON
- **THEN** `ee doctor codex` reports the parse failure
- **AND** `ee repair codex` does not overwrite the file without an explicit operator action
