## MODIFIED Requirements

### Requirement: Plugin Diagnostics Compatibility
The system SHALL keep the OpenClaw adapter diagnosable after the installer and path refactor.

#### Scenario: Doctor recommends repair only when needed
- **WHEN** a user runs `ee doctor`
- **THEN** ExperienceEngine recommends `ee repair openclaw` only if the live OpenClaw plugin state is unhealthy, disabled, mismatched, or reporting a host error

#### Scenario: Repair avoids transient stale-plugin config failures
- **GIVEN** OpenClaw still has an ExperienceEngine plugin entry or allow-list reference from a previous install
- **WHEN** `ee repair openclaw` or `ee upgrade openclaw` refreshes a path-based packaged install
- **THEN** ExperienceEngine does not delete the existing plugin directory before OpenClaw performs the install operation
- **AND** OpenClaw can replace the plugin without first observing a missing referenced plugin path

#### Scenario: Missing npm install directory self-heals through install
- **GIVEN** OpenClaw records ExperienceEngine as an npm-installed plugin
- **AND** the recorded install directory no longer exists
- **WHEN** `ee repair openclaw` or `ee upgrade openclaw` refreshes the adapter
- **THEN** ExperienceEngine runs the install path instead of `openclaw plugins update experienceengine`
