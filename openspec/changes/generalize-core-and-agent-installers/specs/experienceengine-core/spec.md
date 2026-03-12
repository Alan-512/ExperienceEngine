## ADDED Requirements

### Requirement: Host-Agnostic Experience Core
The system SHALL expose ExperienceEngine as a host-agnostic core that operates on normalized task, tool, and feedback events rather than on any one host's native payloads.

#### Scenario: Core accepts normalized task lifecycle events
- **WHEN** a supported adapter emits normalized task-start, tool-result, and task-end events
- **THEN** the ExperienceEngine core processes them without depending on host-specific event shapes

#### Scenario: Core accepts events from multiple documented host surfaces
- **WHEN** one adapter emits events from a plugin lifecycle, another emits events from official hooks, and another emits events from MCP plus a wrapper fallback
- **THEN** the ExperienceEngine core still consumes one normalized event contract
- **AND** host-specific integration differences stay outside the core boundary

#### Scenario: Core remains reusable across multiple agent hosts
- **WHEN** a new agent adapter is added
- **THEN** the core behavior for analysis, intervention, feedback, and storage does not require host-specific forks
