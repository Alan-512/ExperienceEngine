## MODIFIED Requirements

### Requirement: Experience Persistence
The system SHALL persist minimal experience records after a task finalization signal.

#### Scenario: Successful seed turn creates records
- **GIVEN** a session with a supported task summary and a successful tool result
- **WHEN** ExperienceEngine receives a finalize-capable event
- **THEN** it writes an `experience_input_record`
- **AND** it updates `scope_task_stats`
- **AND** it stores at least one candidate experience node when analyzer thresholds are met

#### Scenario: Unknown outcomes remain conservative
- **GIVEN** a finalized task without enough evidence to infer success or failure
- **WHEN** ExperienceEngine stores the task result
- **THEN** the persisted `outcome_signal` remains `unknown`
- **AND** later logic may treat the record more conservatively

#### Scenario: Existing node metadata refreshes without losing feedback history
- **GIVEN** a stable node id already exists with non-zero usage or feedback counters
- **WHEN** ExperienceEngine persists a newer sanitized candidate for the same node id
- **THEN** it refreshes candidate-derived fields such as `trigger_pattern` and guidance text
- **AND** it preserves accumulated usage/helped/harmed counters and feedback timestamps
