## ADDED Requirements

### Requirement: Operator surfaces expose trace capture and projection diagnostics

ExperienceEngine SHALL expose trace capture quality and projection diagnostics through bounded read-only operator surfaces.

#### Scenario: Doctor reports host trace capability status

- **WHEN** an operator runs a host doctor with trace-capability inspection
- **THEN** ExperienceEngine reports enabled capabilities, missing capabilities, capability provenance, transcript stability, tool coverage, and last observed trace capsule status
- **AND** the report identifies whether capabilities were verified, documented, inferred, or disabled

#### Scenario: Trace inspection shows projection details

- **WHEN** an operator inspects a trace capsule projection
- **THEN** ExperienceEngine shows the projected `ExperienceInput`, dropped events, ignored events, redaction decisions, unstable evidence sources, completeness, and learning use or rejection reason
- **AND** the output is bounded and does not expose hidden reasoning or raw unredacted payloads
