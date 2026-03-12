## MODIFIED Requirements

### Requirement: Host-Agnostic Experience Core
The system SHALL expose ExperienceEngine as a host-agnostic core that operates on normalized task, tool, and feedback events rather than on any one host's native payloads.

#### Scenario: Concrete runtime service accepts normalized lifecycle events
- **WHEN** a supported adapter emits normalized task-start, tool-result, and task-end events
- **THEN** a concrete runtime service inside the core processes them without depending on host-specific event shapes
- **AND** host adapters do not need to reimplement analysis, intervention, feedback, or persistence orchestration
