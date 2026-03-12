## MODIFIED Requirements

### Requirement: Plugin Registration
The system SHALL expose the OpenClaw integration as a standard OpenClaw adapter built on top of the common ExperienceEngine core rather than as the full product boundary.

#### Scenario: Plugin metadata is present
- **GIVEN** the repository root
- **WHEN** OpenClaw scans plugin metadata
- **THEN** it finds `openclaw.plugin.json`
- **AND** the plugin declares a stable id, name, version, and config schema

#### Scenario: Runtime registration is available
- **GIVEN** the built plugin entrypoint
- **WHEN** OpenClaw loads the module
- **THEN** the default export provides `register(api)`
- **AND** the plugin can bind lifecycle handlers through the provided API

#### Scenario: OpenClaw adapter delegates to the common core
- **GIVEN** the OpenClaw plugin runtime receives supported lifecycle events
- **WHEN** it normalizes those events
- **THEN** it hands them to the common ExperienceEngine core through the adapter contract
- **AND** OpenClaw-specific code stays isolated to the adapter layer
