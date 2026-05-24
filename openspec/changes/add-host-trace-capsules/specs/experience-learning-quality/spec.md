## ADDED Requirements

### Requirement: Learning gates use trace-derived evidence only when evidence thresholds are met

ExperienceEngine SHALL use trace-derived correction, verification, file-change, adoption, and provenance evidence without allowing low-completeness traces to bypass learning eligibility.

#### Scenario: Expectation correction requires correction evidence

- **WHEN** a trace-backed task is considered for expectation-correction learning
- **THEN** ExperienceEngine requires user-origin correction evidence, objective invalidation evidence, or an existing legacy directional-correction signal
- **AND** it also requires a corrected direction or final accepted or verified result

#### Scenario: Verification loop requires objective verification evidence

- **WHEN** a trace-backed task is considered for verification-loop learning
- **THEN** ExperienceEngine requires an objective verification event
- **AND** the task or tool evidence must show that verification affected the execution path or final confidence

#### Scenario: Low-completeness trace cannot over-promote learning

- **WHEN** a trace capsule has low completeness or unstable-source evidence
- **THEN** ExperienceEngine may still record the task and candidate evidence
- **AND** it SHALL NOT promote the candidate as high-confidence guidance unless the candidate kind's minimum evidence rule is satisfied

### Requirement: Learning source signals include trace provenance when available

ExperienceEngine SHALL include trace-derived source windows in candidate source signals when a trace capsule is linked to the finalized task.

#### Scenario: Candidate source signal includes trace windows

- **WHEN** ExperienceEngine builds candidate source signals for a trace-backed task
- **THEN** the source signal can include correction, verification, change-surface, adoption, trace-completeness, and source-provenance windows
- **AND** these windows are derived from normalized trace events rather than raw host payloads
