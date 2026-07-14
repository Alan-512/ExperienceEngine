## ADDED Requirements

### Requirement: Package generation identity consumes signed install attestation

ExperienceEngine SHALL derive `install_record_identity` from an immutable HMAC-verified install attestation rather than from mutable installer convenience state.

#### Scenario: Signed attestation matches the installed runtime

- **WHEN** closure, package build, installed root, canonical home/database, host state directory, origin, and machine key binding verify
- **THEN** package generation identity MAY consume its stable attestation identity

#### Scenario: Mutable install-state JSON exists without attestation

- **WHEN** only operator convenience state is present
- **THEN** it SHALL NOT independently authorize production package identity

#### Scenario: Published origin lacks registry evidence

- **WHEN** a record claims npm or ClawHub origin without the corresponding artifact integrity and registry identity
- **THEN** attestation verification SHALL fail closed
