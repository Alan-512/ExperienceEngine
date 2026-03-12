## MODIFIED Requirements

### Requirement: Plugin Diagnostics Compatibility
The system SHALL keep the OpenClaw adapter diagnosable after the installer and path refactor.

#### Scenario: Doctor recommends repair only when needed
- **WHEN** a user runs `ee doctor`
- **THEN** ExperienceEngine recommends `ee repair openclaw` only if the live OpenClaw plugin state is unhealthy, disabled, mismatched, or reporting a host error
