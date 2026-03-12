## MODIFIED Requirements

### Requirement: Unified Agent Installation
The system SHALL provide a unified installation entrypoint for supported agent hosts.

#### Scenario: OpenClaw repair is idempotent
- **WHEN** ExperienceEngine is already present in OpenClaw installs metadata and a user runs `ee repair openclaw`
- **THEN** ExperienceEngine updates the existing OpenClaw plugin install instead of attempting a duplicate first-time install
