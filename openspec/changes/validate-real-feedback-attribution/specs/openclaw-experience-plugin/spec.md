## MODIFIED Requirements

### Requirement: Experience Persistence
The system SHALL persist minimal experience records after a task finalization signal.

#### Scenario: Real injected success updates helped attribution
- **GIVEN** a real OpenClaw runtime turn injected at least one node
- **WHEN** the turn finalizes with `outcome_signal = success`
- **THEN** the injected node's `usage_count` increments
- **AND** the injected node's `helped_count` increments

#### Scenario: Real injected failure updates harmed attribution
- **GIVEN** a real OpenClaw runtime turn injected at least one node
- **WHEN** the turn finalizes with `outcome_signal = failure`
- **THEN** the injected node's `usage_count` increments
- **AND** the injected node's `harmed_count` increments
