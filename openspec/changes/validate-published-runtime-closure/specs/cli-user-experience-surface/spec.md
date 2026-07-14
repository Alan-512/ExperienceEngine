## ADDED Requirements

### Requirement: Strict OpenClaw production verification is separate from informational status

ExperienceEngine SHALL provide `ee verify openclaw-production` as a strict automation gate while keeping normal status output informational.

#### Scenario: Production runtime is authoritative

- **WHEN** interaction, current production activation, supervisor/worker authority, configuration/route/schema binding, and required runtime health are valid
- **THEN** strict verification SHALL exit successfully and report the exact readiness projections

#### Scenario: Plugin is loaded but production runtime is inactive

- **WHEN** only `interaction_active` is true or any production binding is missing/stale
- **THEN** strict verification SHALL return a non-zero result with the stable blocking code
- **AND** normal `ee status` MAY remain an informational zero-exit command
