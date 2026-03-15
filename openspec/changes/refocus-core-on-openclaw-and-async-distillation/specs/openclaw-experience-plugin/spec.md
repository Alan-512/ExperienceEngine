## MODIFIED Requirements

### Requirement: Experience Persistence
The system SHALL persist OpenClaw task outcomes into a candidate-first lifecycle and use OpenClaw as the baseline host for core learning validation.

#### Scenario: Successful or failed finalized turn creates candidate-side records first
- **GIVEN** a session with a supported task summary and enough terminal evidence to build learning input
- **WHEN** ExperienceEngine receives a finalize-capable OpenClaw event
- **THEN** it writes the finalized task input and outcome records needed for learning
- **AND** it persists one or more `ExperienceCandidate` records when analyzer thresholds are met
- **AND** it does not require a final `ExperienceNode` to be created synchronously in the finalize path

#### Scenario: OpenClaw remains the baseline host for core learning evaluation
- **GIVEN** ExperienceEngine's multi-host product surface
- **WHEN** candidate creation, async distillation, cold-start behavior, or lifecycle evaluation are validated for the core engine
- **THEN** OpenClaw is treated as the primary baseline host for that validation
- **AND** other hosts may reuse the resulting learning pipeline without redefining the baseline

## ADDED Requirements

### Requirement: OpenClaw candidate lifecycle supports asynchronous distillation
The system SHALL preserve enough OpenClaw task evidence to let candidate distillation complete asynchronously after the task has already ended.

#### Scenario: Finalized OpenClaw task queues distillation work
- **WHEN** an OpenClaw task produces a persisted candidate
- **THEN** ExperienceEngine records distillation work for later asynchronous execution
- **AND** the original task finalize flow is not blocked by waiting for final experience wording
