## ADDED Requirements

### Requirement: Retrieval remains compatible with trace-less records

ExperienceEngine SHALL keep retrieval source-compatible for old records and for hosts that cannot provide trace capsules.

#### Scenario: Trace-less records remain eligible for retrieval

- **WHEN** retrieval evaluates an existing experience node or record whose origin has no trace capsule
- **THEN** ExperienceEngine continues to use existing `ExperienceInput`-derived retrieval evidence
- **AND** missing trace metadata does not reject the candidate by itself

#### Scenario: Trace-derived portability evidence is additive

- **WHEN** retrieval evaluates candidates with trace-derived portability or provenance fields
- **THEN** those fields may improve ranking, diagnostics, or policy enrichment
- **AND** they do not become mandatory hard filters unless a later spec defines that behavior

### Requirement: Host-specific trace evidence does not become cross-host retrieval authority

ExperienceEngine SHALL prevent host-specific trace details from making a candidate look reusable across incompatible hosts.

#### Scenario: Host-local evidence remains host-local

- **WHEN** a candidate's trace evidence depends on a host-specific hook, runtime mode, or tool behavior
- **THEN** ExperienceEngine marks that candidate's applicability as host-local or otherwise constrains its portability
- **AND** cross-host retrieval uses normalized task, tool-family, verification, file-change, and correction evidence instead of raw host event names
