## MODIFIED Requirements

### Requirement: OpenClaw install and upgrade wiring
ExperienceEngine MUST refresh OpenClaw path-based installs from the current package root instead of relying on `plugins update`.

#### Scenario: Existing path install is refreshed
- **WHEN** `ee install openclaw` or `ee upgrade openclaw` runs against an existing OpenClaw install with `plugins.installs.experienceengine.source = "path"`
- **THEN** ExperienceEngine MUST run a fresh `openclaw plugins install <current-package-root>`
- **AND** MUST re-enable the plugin and rewrite the expected plugin config

#### Scenario: Existing npm install is updated
- **WHEN** a future OpenClaw install is tracked as an npm install
- **THEN** ExperienceEngine MAY use `openclaw plugins update experienceengine`
