# agent-adapter-installation Specification

## Purpose
Define the host-specific installer and doctor requirements for ExperienceEngine adapters.
## Requirements
### Requirement: ExperienceEngine exposes per-agent installer entrypoints

`ee install <agent>` MUST support host-specific installation flows without changing the core runtime contract.

#### Scenario: Install Codex MCP foundation

- **WHEN** a user runs `ee install codex`
- **THEN** ExperienceEngine registers its local MCP server with Codex
- **AND** it persists Codex adapter install-state under the shared ExperienceEngine data home
- **AND** the install only relies on officially documented Codex MCP surfaces

### Requirement: ExperienceEngine exposes host-specific doctor diagnostics

`ee doctor <agent>` MUST report whether the selected host is wired to the ExperienceEngine adapter.

#### Scenario: Inspect Codex MCP foundation

- **WHEN** a user runs `ee doctor codex`
- **THEN** ExperienceEngine reports whether Codex has an `experienceengine` MCP entry
- **AND** it reports the current configured command or config target used by that entry

#### Scenario: Inspect Claude hook and MCP readiness

- **WHEN** a user runs `ee doctor claude-code`
- **THEN** ExperienceEngine reports whether Claude Code has the required ExperienceEngine hook configuration
- **AND** it reports whether Claude Code has an `experienceengine` MCP entry
- **AND** it reports the current configured command or config target used by that entry

### Requirement: Codex foundation provides a local MCP entrypoint

ExperienceEngine MUST expose a local Codex-facing MCP server entrypoint before attempting richer Codex automation.

#### Scenario: Codex registers the ExperienceEngine MCP server

- **WHEN** ExperienceEngine installs the Codex adapter
- **THEN** the configured server command points at an ExperienceEngine-owned `codex-mcp-server` entrypoint
- **AND** that entrypoint is suitable for Codex MCP registration

### Requirement: Claude Code installs both runtime and interaction wiring

ExperienceEngine MUST install Claude Code in a way that preserves both runtime hook integration and agent-session interaction through MCP.

#### Scenario: Claude install writes hooks and MCP wiring

- **WHEN** a user runs `ee install claude-code`
- **THEN** ExperienceEngine writes the required Claude hook configuration for runtime capture and injection
- **AND** it registers the shared ExperienceEngine MCP server with Claude Code
- **AND** install state preserves the resulting hook and MCP wiring details

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

