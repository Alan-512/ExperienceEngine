## MODIFIED Requirements

### Requirement: ExperienceCandidate is a first-class persisted object
ExperienceEngine SHALL persist raw experience candidates as a distinct lifecycle object before any formal experience node is created, while keeping pre-distillation trace details out of normal long-lived candidate storage.

#### Scenario: Finalized task produces a persisted candidate
- **WHEN** a supported task finishes with enough failure, correction, retry, or successful-fix evidence
- **THEN** ExperienceEngine persists an `ExperienceCandidate`
- **AND** the candidate remains distinct from any final `ExperienceNode`

#### Scenario: Candidate keeps bounded source evidence
- **WHEN** ExperienceEngine persists an `ExperienceCandidate`
- **THEN** it stores the originating task linkage and bounded structured signals needed for later distillation
- **AND** it may reference trace provenance summaries or explicit diagnostic snapshots
- **AND** it SHALL NOT require full pre-distillation trace events, raw host payloads, raw transcripts, or raw tool outputs to remain persisted after candidate capture

### Requirement: Distillation only processes eligible candidates

ExperienceEngine SHALL only create distillation jobs for tasks that passed learning eligibility and produced an experience candidate.

#### Scenario: Rejected task does not enqueue distillation

- **WHEN** a finalized task is rejected by the learning eligibility gate
- **THEN** ExperienceEngine SHALL NOT create a distillation job for that task

#### Scenario: Accepted task can enqueue distillation

- **WHEN** a finalized task passes learning eligibility and candidate creation succeeds
- **THEN** ExperienceEngine MAY create a distillation job according to the existing distillation pipeline behavior

#### Scenario: Transient trace evidence can inform distillation

- **WHEN** a finalized task has runtime trace evidence that was not persisted as full trace events
- **THEN** ExperienceEngine MAY use the transient trace evidence to build bounded candidate signals before finalization completes
- **AND** the persisted candidate and distillation job SHALL retain only bounded source signals, provenance summaries, or explicit diagnostic snapshot references
