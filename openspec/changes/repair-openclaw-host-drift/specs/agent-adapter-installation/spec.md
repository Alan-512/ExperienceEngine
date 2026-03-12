## MODIFIED Requirements

### Requirement: Unified Agent Installation
The system SHALL provide a unified installation entrypoint for supported agent hosts.

#### Scenario: OpenClaw repair reapplies host wiring
- **WHEN** a user runs `ee repair openclaw`
- **THEN** ExperienceEngine reapplies the documented OpenClaw plugin wiring steps for ExperienceEngine
- **AND** the repair flow is based on the same host command planner used for installation
