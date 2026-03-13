## MODIFIED Requirements

### Requirement: Codex exposes an ExperienceEngine MCP surface
The Codex adapter SHALL expose ExperienceEngine interaction primitives over MCP in addition to the runtime-loop tools.

#### Scenario: Codex cools an ExperienceEngine node through MCP
- **WHEN** a Codex MCP client calls `experienceengine_cool_node`
- **THEN** the server updates the target node to the cooling state

#### Scenario: Codex retires an ExperienceEngine node through MCP
- **WHEN** a Codex MCP client calls `experienceengine_retire_node`
- **THEN** the server updates the target node to the retired state
