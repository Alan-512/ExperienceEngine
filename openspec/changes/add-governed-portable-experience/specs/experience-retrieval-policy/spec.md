## ADDED Requirements

### Requirement: Retrieval respects embedding-space compatibility
ExperienceEngine SHALL keep vector similarity evidence scoped to compatible embedding spaces.

#### Scenario: Incompatible node vectors are not cosine-scored
- **WHEN** retrieval evaluates a node whose embedding metadata does not match the active query embedding space
- **THEN** retrieval excludes that node from vector similarity scoring
- **AND** the node may still be considered by lexical, policy, or diagnostic fallback evidence
- **AND** retrieval diagnostics include an embedding-space mismatch reason

#### Scenario: Pending migration stays out of vector scoring
- **WHEN** a node is pending vector migration to the active embedding space
- **THEN** retrieval does not compare the old vector against the active query vector
- **AND** retrieval does not substitute a placeholder cosine score such as zero for the pending vector
- **AND** diagnostics identify the node or stage as migration-pending when included in inspection

### Requirement: Retrieval surfaces vector migration diagnostics
ExperienceEngine SHALL expose vector migration state as retrieval diagnostics without turning migration state into prompt guidance.

#### Scenario: Migration status is diagnostic-only
- **WHEN** retrieval encounters nodes that need re-encoding
- **THEN** retrieval diagnostics include bounded counts or reason codes for migration-pending nodes
- **AND** normal prompt injection does not include migration maintenance details

### Requirement: Retrieval includes portability evidence for cross-repo candidates
ExperienceEngine SHALL include compatibility and portability evidence in cross-repo candidate diagnostics.

#### Scenario: Cross-repo candidate has portability scorecard
- **WHEN** retrieval considers a node from another scope
- **THEN** the candidate diagnostics include portability band, compatibility fingerprint match, SemVer major-version penalty when applicable, and negative evidence when present
- **AND** retrieval similarity alone does not make the candidate directly injectable

#### Scenario: Portability diagnostics remain separate from retrieval score
- **WHEN** a cross-repo candidate has high lexical or semantic retrieval score
- **THEN** portability evidence remains a separate diagnostic/policy input
- **AND** final delivery remains governed by intervention policy
