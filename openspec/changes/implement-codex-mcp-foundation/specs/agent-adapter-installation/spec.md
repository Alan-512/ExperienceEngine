## MODIFIED Requirements

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

### Requirement: Codex foundation provides a local MCP entrypoint

ExperienceEngine MUST expose a local Codex-facing MCP server entrypoint before attempting richer Codex automation.

#### Scenario: Codex registers the ExperienceEngine MCP server

- **WHEN** ExperienceEngine installs the Codex adapter
- **THEN** the configured server command points at an ExperienceEngine-owned `codex-mcp-server` entrypoint
- **AND** that entrypoint is suitable for Codex MCP registration
