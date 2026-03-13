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
