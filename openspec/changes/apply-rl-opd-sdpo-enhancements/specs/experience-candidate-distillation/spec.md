## MODIFIED Requirements

### Requirement: ExperienceCandidate is a first-class persisted object
ExperienceEngine SHALL persist raw experience candidates as a distinct lifecycle object before any formal experience node is created, and only when SDPO-style capture criteria are met.

#### Scenario: Finalized task produces a persisted candidate
- **WHEN** a supported task finishes and the candidate gate confirms criticality, improvement room, and a recoverable path
- **THEN** ExperienceEngine persists an `ExperienceCandidate`
- **AND** the candidate remains distinct from any final `ExperienceNode`

#### Scenario: Candidate keeps raw source evidence
- **WHEN** ExperienceEngine persists an `ExperienceCandidate`
- **THEN** it stores the originating task linkage plus raw structured signals including failure signature, retry count, correction signals, and a condensed tool-event summary

### Requirement: Distillation jobs have explicit retry and discard states
ExperienceEngine SHALL track distillation work through an explicit job lifecycle and treat invalid distillation output as a retryable failure.

#### Scenario: Failed or invalid distillation increments retry state
- **WHEN** a distillation attempt fails or produces output that fails structural validation
- **THEN** ExperienceEngine records the failure on a persisted distillation job
- **AND** it increments the candidate retry counter

#### Scenario: Candidate is discarded after retry exhaustion
- **WHEN** a candidate exceeds the configured retry threshold due to failed or invalid distillation attempts
- **THEN** ExperienceEngine marks it as `discarded`
- **AND** it does not create a final `ExperienceNode` for that candidate
