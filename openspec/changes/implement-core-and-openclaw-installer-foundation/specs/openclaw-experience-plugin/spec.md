## MODIFIED Requirements

### Requirement: Plugin Registration
The system SHALL expose the OpenClaw integration as a standard OpenClaw adapter built on top of the common ExperienceEngine core rather than as the full product boundary.

#### Scenario: OpenClaw plugin delegates to extracted core runtime
- **GIVEN** the built OpenClaw plugin entrypoint
- **WHEN** OpenClaw loads the module and dispatches supported lifecycle events
- **THEN** the OpenClaw adapter normalizes those events and delegates orchestration to the extracted core runtime service
- **AND** path resolution is obtained through the shared product resolver rather than hard-coded OpenClaw-only defaults

### Requirement: Plugin Diagnostics Compatibility
The system SHALL keep the OpenClaw adapter diagnosable after the installer and path refactor.

#### Scenario: Doctor reports OpenClaw adapter state
- **WHEN** a user runs `ee doctor`
- **THEN** ExperienceEngine reports whether the OpenClaw adapter is installed
- **AND** it reports the active resolved storage root used by the adapter
