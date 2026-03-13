## MODIFIED Requirements

### Requirement: Codex exposes an ExperienceEngine MCP surface
The Codex adapter SHALL expose ExperienceEngine interaction primitives over MCP in addition to the runtime-loop tools.

#### Scenario: Codex exposes a prompt for reviewing the last intervention
- **WHEN** a Codex MCP client gets the `experienceengine_show_last_intervention` prompt
- **THEN** the prompt payload guides the agent to review the latest ExperienceEngine interaction
- **AND** references the `experienceengine://last` resource

#### Scenario: Codex exposes a prompt for pausing the current project
- **WHEN** a Codex MCP client gets the `experienceengine_pause_current_project` prompt
- **THEN** the prompt payload instructs the agent to confirm with the user
- **AND** then call `experienceengine_disable_scope`
