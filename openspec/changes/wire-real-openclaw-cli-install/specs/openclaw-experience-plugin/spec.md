## MODIFIED Requirements

### Requirement: Plugin Diagnostics Compatibility
The system SHALL keep the OpenClaw adapter diagnosable after the installer and path refactor.

#### Scenario: Doctor distinguishes product install state from host wiring
- **WHEN** a user runs `ee doctor` after attempting an OpenClaw install
- **THEN** ExperienceEngine reports whether the OpenClaw CLI wiring succeeded
- **AND** it reports the linked ExperienceEngine package root used for the OpenClaw install
