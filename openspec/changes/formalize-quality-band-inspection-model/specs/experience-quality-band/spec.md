## ADDED Requirements

### Requirement: Quality Band is a derived explanation model

ExperienceEngine SHALL expose a shared Quality Band explanation model derived from existing node, intervention, attribution, hygiene, and learning-quality state.

#### Scenario: Strong guidance is explained

- **WHEN** a node is active, validated by reuse, has no harmful feedback, and has supporting successful evidence
- **THEN** ExperienceEngine SHALL classify the node Quality Band as `strong`
- **AND** the explanation SHALL include readable reasons and evidence references that justify the band

#### Scenario: Building guidance is explained

- **WHEN** a node or candidate has limited reuse evidence, is early in its lifecycle, or is only conservative-ready
- **THEN** ExperienceEngine SHALL classify the Quality Band as `building`
- **AND** the explanation SHALL say what evidence is still missing before the guidance should be treated as strong

#### Scenario: Risky guidance is explained

- **WHEN** a node is retired, cooling, harmed more than helped, quarantined, or tied to high-severity hygiene risk
- **THEN** ExperienceEngine SHALL classify the Quality Band as `risky`
- **AND** the explanation SHALL include review-only next actions rather than automatic mutation instructions

#### Scenario: Quality Band does not change delivery behavior

- **WHEN** ExperienceEngine derives a Quality Band for a node or inspection result
- **THEN** the derivation SHALL NOT mutate node lifecycle state, delivery state, validation state, repo policy, candidates, attribution records, task runs, or hygiene findings
- **AND** the derivation SHALL NOT decide whether prompt-time guidance is injected

### Requirement: Quality Band exposes stable reason structure

ExperienceEngine SHALL expose Quality Band explanations with stable machine-readable and human-readable fields.

#### Scenario: Caller receives structured reasons

- **WHEN** a caller inspects a node, last intervention, repo summary, or relevant no-injection explanation
- **THEN** the Quality Band payload SHALL include the band, a concise summary, reason codes, readable reasons, and available evidence references
- **AND** reason codes SHALL be stable enough for tests and MCP callers to depend on

#### Scenario: Evidence is unavailable

- **WHEN** a Quality Band explanation cannot reference a concrete node, candidate, record, injection, or task-run id
- **THEN** ExperienceEngine SHALL still return a concise summary
- **AND** it SHALL leave evidence references empty rather than inventing ids

### Requirement: No-injection explanations distinguish readiness from absence

ExperienceEngine SHALL use Quality Band context in no-injection explanations when relevant guidance exists but is not ready or is risky.

#### Scenario: No relevant guidance exists

- **WHEN** ExperienceEngine skips injection because no relevant node or candidate was available
- **THEN** the no-injection explanation SHALL say no relevant learned guidance was available
- **AND** it SHALL NOT imply that a low Quality Band suppressed guidance

#### Scenario: Existing decision skipped guidance that is building

- **WHEN** an existing retrieval, delivery, or governance decision skips or withholds guidance
- **AND** available matched evidence corresponds to guidance that is still building evidence
- **THEN** the explanation SHALL include the `building` band and the top reasons it is not yet strong
- **AND** the Quality Band SHALL remain explanatory rather than causing the skip or withholding decision

#### Scenario: Existing decision skipped guidance that is risky

- **WHEN** an existing retrieval, delivery, or governance decision skips or withholds guidance
- **AND** available matched evidence corresponds to guidance that is risky, cooling, quarantined, or harmed
- **THEN** the explanation SHALL include the `risky` band and a review-only next action
- **AND** the Quality Band SHALL remain explanatory rather than causing the skip or withholding decision
