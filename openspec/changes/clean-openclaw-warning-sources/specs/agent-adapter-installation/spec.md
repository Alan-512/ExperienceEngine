## MODIFIED Requirements

### Requirement: Unified Agent Installation
The system SHALL provide a unified installation entrypoint for supported agent hosts.

#### Scenario: OpenClaw install cleans ExperienceEngine-owned warning sources
- **WHEN** a user runs `ee install openclaw` or `ee repair openclaw`
- **THEN** ExperienceEngine removes stale ExperienceEngine development roots from OpenClaw plugin discovery config
- **AND** it normalizes permissions for the copied ExperienceEngine extension install
