## MODIFIED Requirements

### Requirement: Unified Agent Installation
The system SHALL provide a unified installation entrypoint for supported agent hosts.

#### Scenario: OpenClaw install uses the host CLI
- **WHEN** a user runs `ee install openclaw`
- **THEN** ExperienceEngine uses documented `openclaw` CLI commands to complete the OpenClaw-side plugin installation flow
- **AND** the install is not treated as complete until the host wiring steps succeed
