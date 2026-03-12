## MODIFIED Requirements

### Requirement: Conservative Hint Injection
The system SHALL inject hints only when a similar prior experience exists and the trigger conditions are met.

#### Scenario: Real different-family runtime validation stays skipped
- **GIVEN** a real OpenClaw runtime scope already contains a successful prior experience node for one task family
- **WHEN** a later real task in the same scope resolves to a different task family
- **THEN** ExperienceEngine persists an empty `injected_node_ids_json` for the follow-up turn
- **AND** the relevant `scope_task_stats` row does not increment `injected_tasks`
- **AND** the follow-up turn still records its own task-family outcome and tool evidence normally
