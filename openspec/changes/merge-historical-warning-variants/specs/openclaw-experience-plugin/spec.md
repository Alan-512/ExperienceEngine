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

#### Scenario: Historical warning variants can be merged into the canonical warning node
- **GIVEN** a SQLite store contains multiple warning nodes for the same scope and task family that differ only by legacy tool-specific warning variants
- **WHEN** the warning-variant maintenance workflow runs
- **THEN** it merges counters into the canonical warning node
- **AND** it retires the duplicate warning variants so they no longer participate in retrieval
