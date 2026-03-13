## MODIFIED Requirements

### Requirement: Claude Code installs both runtime and interaction wiring

ExperienceEngine MUST install Claude Code in a way that preserves both runtime hook integration and agent-session interaction through MCP.

#### Scenario: Claude install writes hooks and MCP wiring

- **WHEN** a user runs `ee install claude-code`
- **THEN** ExperienceEngine writes the required Claude hook configuration for runtime capture and injection
- **AND** it registers the shared ExperienceEngine MCP server with Claude Code
- **AND** install state preserves the resulting hook and MCP wiring details

#### Scenario: Claude doctor reports hook and MCP readiness

- **WHEN** a user inspects Claude Code with doctor output
- **THEN** ExperienceEngine reports whether required hooks are present
- **AND** reports whether the ExperienceEngine MCP server is registered for Claude Code
