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

### Requirement: OpenClaw installation is transactional and security approval is explicit

ExperienceEngine SHALL validate a candidate before changing an existing OpenClaw installation and SHALL require explicit digest-bound user approval before mapping a host security warning to an unsafe-install flag.

#### Scenario: Default host scan requests approval

- **WHEN** OpenClaw rejects the candidate pending security approval
- **THEN** ExperienceEngine SHALL return `EE_OPENCLAW_SECURITY_APPROVAL_REQUIRED` with a stable scan summary
- **AND** it SHALL leave the existing plugin, allow list, config, install state, and active package generation unchanged

#### Scenario: User explicitly approves the exact candidate

- **WHEN** the operator passes the explicit approval option for the candidate closure digest
- **THEN** ExperienceEngine MAY use the host's unsafe-install flag for that candidate only
- **AND** the signed install attestation SHALL record the host version, scan summary, approval method/time, and closure digest

#### Scenario: Candidate installation or activation fails

- **WHEN** any post-snapshot install, host-info, installed-closure, attestation, restart, preactivation, or production-activation boundary fails
- **THEN** ExperienceEngine SHALL restore the prior plugin directory, config/allow state, and install evidence
- **AND** it SHALL retain the prior active package generation

### Requirement: Install origin is explicit and cannot be upgraded by assertion

ExperienceEngine SHALL distinguish `local_pack`, `host_native_unattested`, `published_npm_attested`, and `published_clawhub_attested` installation origins.

#### Scenario: Host-native lifecycle loads an exact closure without registry evidence

- **WHEN** OpenClaw loads a valid plugin closure and the Gateway creates the constrained signed lifecycle attestation
- **THEN** the origin SHALL be `host_native_unattested`
- **AND** it SHALL NOT imply npm or ClawHub artifact validation

#### Scenario: Registry evidence is available

- **WHEN** an external exact-artifact installer/validator verifies registry identity and artifact integrity
- **THEN** it MAY issue the matching published origin
- **AND** a Gateway-only bootstrap SHALL NOT create or upgrade to that origin
