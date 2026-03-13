## MODIFIED Requirements

### Requirement: Codex exposes an ExperienceEngine MCP surface
The Codex adapter SHALL expose ExperienceEngine interaction primitives over MCP in addition to the runtime-loop tools.

#### Scenario: Codex reads the last intervention through an MCP resource
- **WHEN** a Codex MCP client reads `experienceengine://last`
- **THEN** the server returns the most recent persisted ExperienceEngine input record and any resolved injected nodes

#### Scenario: Codex reads recent injected history through an MCP resource
- **WHEN** a Codex MCP client reads `experienceengine://recent/injected/5`
- **THEN** the server returns the most recent injected ExperienceEngine records limited to the requested count

#### Scenario: Codex updates feedback through an MCP tool
- **WHEN** a Codex MCP client calls `experienceengine_feedback_last`
- **THEN** the server updates the latest injected node set with the requested feedback
- **AND** the response confirms which node ids were updated

#### Scenario: Codex toggles scope interventions through an MCP tool
- **WHEN** a Codex MCP client calls `experienceengine_disable_scope` or `experienceengine_enable_scope`
- **THEN** the server updates the resolved scope state for the provided working directory
- **AND** the response includes the resolved scope id and disabled state
