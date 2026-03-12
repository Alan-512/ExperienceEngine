## MODIFIED Requirements

### Requirement: Plugin Diagnostics Compatibility
The system SHALL keep the OpenClaw adapter diagnosable after the installer and path refactor.

#### Scenario: Doctor reports live host plugin status
- **WHEN** a user runs `ee doctor`
- **THEN** ExperienceEngine reports the live OpenClaw plugin status for `experienceengine`
- **AND** it surfaces any host-side plugin error reported by OpenClaw

#### Scenario: Doctor reports config match state
- **WHEN** a user runs `ee doctor`
- **THEN** ExperienceEngine compares the OpenClaw live plugin config to the expected ExperienceEngine install config
- **AND** it reports whether the host config matches the expected config
