## MODIFIED Requirements

### Requirement: Distillation jobs have explicit retry and discard states

ExperienceEngine SHALL track distillation work through the fenced entity-specific job and candidate lifecycle, classify each failure with the stable failure taxonomy, and preserve independent system-attempt, worker-interruption, and candidate-content retry effects.

#### Scenario: Provider or route failure blocks without consuming content retry

- **WHEN** distillation cannot run because the provider, credentials, route, configuration, schema, package, or another system dependency is unavailable or invalid
- **THEN** ExperienceEngine records the exact system-route failure and moves the job and candidate to the frozen blocked state when required
- **AND** it does not increment candidate content retry or discard the candidate

#### Scenario: Worker authority is interrupted

- **WHEN** the worker crashes, loses its lease/fence, loses production activation authority, or the claim expires before semantic completion
- **THEN** ExperienceEngine recovers the job through the interruption path and increments only interruption metadata
- **AND** it discards stale computed output without incrementing candidate content retry

#### Scenario: Candidate-specific semantic output is invalid

- **WHEN** the route itself is current and valid but one candidate's output fails the candidate schema or semantic content contract under current production authority
- **THEN** ExperienceEngine records candidate-content failure on the job and candidate
- **AND** it increments only that candidate's bounded content retry count

#### Scenario: Candidate is discarded after content retry exhaustion

- **WHEN** one candidate exhausts the configured content retry threshold through candidate-specific failures
- **THEN** ExperienceEngine atomically marks the job and candidate `discarded` with a terminal reason
- **AND** it does not create a final `ExperienceNode` for that candidate

#### Scenario: System or interruption budget is exhausted

- **WHEN** system attempts or worker interruptions reach their bounded diagnostic or backoff limits
- **THEN** ExperienceEngine MAY leave work blocked for operator or runtime recovery
- **AND** it SHALL NOT relabel the candidate content as invalid or discard it through the content retry threshold
