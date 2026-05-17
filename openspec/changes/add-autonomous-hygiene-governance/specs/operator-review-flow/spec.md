## ADDED Requirements

### Requirement: Operator review summarizes autonomous governance
ExperienceEngine SHALL include autonomous hygiene governance status in operator review without making operator review mutating.

#### Scenario: Recent autonomous governance actions exist
- **WHEN** ExperienceEngine returns an operator review report for a scope with recent autonomous governance actions
- **THEN** the report includes bounded counts and summaries for recent automatic actions, skipped runs, failed runs, and rollback references
- **AND** the operator review report does not itself mutate governance state

#### Scenario: Guarded governance actions were applied
- **WHEN** autonomous hygiene governance has applied guarded actions for a scope
- **THEN** operator review includes bounded guarded action summaries with affected ids, risk level, rationale, and drill-down references
- **AND** it does not mutate governance state from the read-only report

#### Scenario: Legacy governance approvals are pending
- **WHEN** autonomous hygiene governance has legacy pending approval records for a scope
- **THEN** operator review includes bounded approval summaries with affected ids, risk level, rationale, and drill-down references
- **AND** it does not approve, reject, or apply those records from the read-only report

#### Scenario: No governance attention is needed
- **WHEN** autonomous governance is current and has no legacy pending approvals or failed runs
- **THEN** operator review reports that governance is current
- **AND** it keeps detailed governance history available only through drill-down surfaces
