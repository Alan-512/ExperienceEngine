## MODIFIED Requirements

### Requirement: ExperienceEngine uses MCP as its primary day-to-day interaction surface
ExperienceEngine SHALL define its long-term user interaction model around MCP rather than around standalone CLI commands.

#### Scenario: Users can inspect operational state inside an agent session
- **WHEN** a user asks an agent to check ExperienceEngine installation health or update state
- **THEN** ExperienceEngine exposes that read-only operational state through MCP resources or read-only tools
- **AND** the standalone CLI remains available as fallback
