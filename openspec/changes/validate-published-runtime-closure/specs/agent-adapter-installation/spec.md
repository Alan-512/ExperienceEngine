## ADDED Requirements

### Requirement: OpenClaw installation evidence is channel-specific

ExperienceEngine SHALL distinguish source checkout, local packed artifact, published npm, published ClawHub, and live-host validation when reporting OpenClaw installation and runtime support.

#### Scenario: Source checkout works

- **WHEN** source-repo or local-pack validation succeeds but actual published validation is incomplete
- **THEN** installer or doctor output MAY report development evidence explicitly
- **AND** it SHALL NOT report npm or ClawHub full-learning support

#### Scenario: Published npm is validated

- **WHEN** the exact downloaded npm artifact passes closure, clean-home activation, deterministic queue, authority-loss, and live-host gates
- **THEN** npm MAY be reported as validated for the recorded version/environment
- **AND** ClawHub SHALL remain independently unresolved

#### Scenario: Published ClawHub is validated

- **WHEN** the exact downloaded ClawHub artifact passes its independent gates
- **THEN** ClawHub MAY be reported as validated for the recorded version/environment
- **AND** npm status SHALL not be inferred from that result

### Requirement: OpenClaw doctor distinguishes package-local activation from fallback command availability

ExperienceEngine SHALL report package-local plugin/supervisor/worker activation separately from optional global `ee` and doctor/repair `openclaw` command fallback availability.

#### Scenario: Package-local activation works without global commands

- **WHEN** the plugin lifecycle and package-local entrypoints pass authoritative activation but global `ee` or fallback `openclaw` commands are absent
- **THEN** doctor SHALL report the canonical package-local path according to its evidence
- **AND** it SHALL report unavailable optional fallback commands separately

#### Scenario: Windows repair fallback is unresolved

- **WHEN** bounded Windows command resolution cannot find a supported executable
- **THEN** doctor SHALL report `EE_OPENCLAW_EXECUTABLE_UNRESOLVED` for repair fallback
- **AND** it SHALL NOT use that fact alone to invalidate independent package-local activation evidence
