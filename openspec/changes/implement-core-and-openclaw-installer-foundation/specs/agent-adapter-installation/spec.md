## MODIFIED Requirements

### Requirement: Unified Agent Installation
The system SHALL provide a unified installation entrypoint for supported agent hosts.

#### Scenario: OpenClaw install flow is shipped through the product CLI
- **WHEN** a user runs `ee install openclaw`
- **THEN** ExperienceEngine performs the OpenClaw-specific installation flow through the product CLI
- **AND** the install flow can be extended to future hosts without changing the top-level command family

### Requirement: Unified Data Home
The system SHALL support a product-owned local data home that is not scoped to one host's private directory.

#### Scenario: Installer and runtime resolve one active data root
- **WHEN** ExperienceEngine runs through the product CLI or the OpenClaw adapter
- **THEN** both surfaces resolve storage through the same product path resolver
- **AND** compatibility with the current OpenClaw-specific root can remain in place during migration
