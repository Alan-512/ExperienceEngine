## MODIFIED Requirements

### Requirement: Codex exposes an ExperienceEngine MCP surface
The Codex adapter SHALL expose ExperienceEngine interaction primitives over MCP in addition to the runtime-loop tools.

#### Scenario: Codex reads doctor state through MCP
- **WHEN** a Codex MCP client reads `experienceengine://doctor/codex`
- **THEN** the server returns structured Codex adapter inspection state

#### Scenario: Codex checks update state through MCP
- **WHEN** a Codex MCP client calls `experienceengine_check_update` with `adapter=codex`
- **THEN** the server returns the structured remote release status for the current ExperienceEngine package and adapter context
