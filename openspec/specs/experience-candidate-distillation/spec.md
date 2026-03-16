# experience-candidate-distillation Specification

## Purpose
Define the candidate-first learning lifecycle so ExperienceEngine captures raw learning signals before formal node creation, distills them asynchronously, and keeps undistilled candidate state out of normal user-facing review surfaces.

## Requirements

### Requirement: ExperienceCandidate is a first-class persisted object
ExperienceEngine SHALL persist raw experience candidates as a distinct lifecycle object before any formal experience node is created.

#### Scenario: Finalized task produces a persisted candidate
- **WHEN** a supported task finishes with enough failure, correction, retry, or successful-fix evidence
- **THEN** ExperienceEngine persists an `ExperienceCandidate`
- **AND** the candidate remains distinct from any final `ExperienceNode`

#### Scenario: Candidate keeps raw source evidence
- **WHEN** ExperienceEngine persists an `ExperienceCandidate`
- **THEN** it stores the originating task linkage and raw structured signal needed for later distillation

### Requirement: Distillation runs asynchronously after candidate capture
ExperienceEngine SHALL decouple candidate capture from formal experience node creation through an asynchronous distillation lifecycle.

#### Scenario: Finalize does not block on distillation
- **WHEN** a task finishes and ExperienceEngine creates a candidate
- **THEN** the task finalize path completes without waiting for the final experience text to be distilled

#### Scenario: Successful distillation promotes a node
- **WHEN** an asynchronous distillation job succeeds
- **THEN** ExperienceEngine creates or updates the corresponding `ExperienceNode`
- **AND** it marks the source candidate as `distilled`

### Requirement: Distillation jobs have explicit retry and discard states
ExperienceEngine SHALL track distillation work through an explicit job lifecycle rather than an implicit best-effort call.

#### Scenario: Failed distillation increments retry state
- **WHEN** a distillation attempt fails
- **THEN** ExperienceEngine records the failure on a persisted distillation job
- **AND** it increments the candidate retry counter

#### Scenario: Candidate is discarded after retry exhaustion
- **WHEN** a candidate exceeds the configured retry threshold
- **THEN** ExperienceEngine marks it as `discarded`
- **AND** it does not create a final `ExperienceNode` for that candidate

### Requirement: Undistilled candidates are not user-visible experience
ExperienceEngine SHALL keep pending, failed, or discarded candidates out of the normal review and intervention surfaces.

#### Scenario: Pending candidate does not appear in review surfaces
- **WHEN** a candidate has not yet been distilled into a formal node
- **THEN** it does not appear in standard inspect, review, or intervention outputs intended for users

#### Scenario: Discarded candidate does not become injectable
- **WHEN** a candidate is discarded after retry exhaustion
- **THEN** it never becomes eligible for intervention retrieval
