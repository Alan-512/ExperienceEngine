## ADDED Requirements

### Requirement: Exact-revision package initialization has a read-only preparation operation

ExperienceEngine SHALL expose a non-mutating preparation operation that returns the current projection/launch revisions and an executable initialization request.

#### Scenario: Operator prepares initialization

- **WHEN** the current package generation is resolvable
- **THEN** the preparation result SHALL include exact expected revisions, package generation, control request id, and authorization id
- **AND** it SHALL NOT mutate package, launch, supervisor, worker, or handshake authority

#### Scenario: Prepared request becomes stale

- **WHEN** authority revisions change before execution
- **THEN** the existing exact-CAS initialization SHALL reject it without implicit refresh
