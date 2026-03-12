## MODIFIED Requirements

### Requirement: Unified Agent Installation
The system SHALL provide a unified installation entrypoint for supported agent hosts.

#### Scenario: OpenClaw install prefers copied local-path install
- **WHEN** a user runs `ee install openclaw` or `ee repair openclaw`
- **THEN** ExperienceEngine uses the documented local-path OpenClaw install flow without link mode by default
- **AND** the remaining enable/config-set steps stay unchanged
