## MODIFIED Requirements

### Requirement: Conservative Hint Injection
The system SHALL inject hints only when a similar prior experience exists and the trigger conditions are met.

#### Scenario: Real second-turn runtime validation
- **GIVEN** a real OpenClaw runtime session has already produced at least one successful experience node in a scope and task family
- **WHEN** a later similar real task runs in the same scope and task family
- **THEN** ExperienceEngine persists a non-empty `injected_node_ids_json` for the follow-up turn
- **AND** the corresponding `scope_task_stats` row increments `injected_tasks`
- **AND** the follow-up record preserves task-family compatibility with the seed turn
