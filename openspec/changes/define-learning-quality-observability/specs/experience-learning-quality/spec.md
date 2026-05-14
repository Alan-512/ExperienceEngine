## ADDED Requirements

### Requirement: Learning quality metrics are inspectable

ExperienceEngine SHALL expose read-only learning quality metrics for the current scope using existing task, candidate, node, injection, and attribution records.

#### Scenario: Scope learning quality summarizes admission
- **WHEN** an operator inspects ExperienceEngine health for a repo scope
- **THEN** ExperienceEngine SHALL report how many recent task runs were recorded
- **AND** it SHALL report how many of those runs were captured, rejected, or not applicable for learning
- **AND** it SHALL report a candidate admission rate derived from captured task runs over learning-applicable task runs

#### Scenario: Rejection reason distribution is visible
- **WHEN** recent task runs include rejected learning attempts
- **THEN** ExperienceEngine SHALL report grouped rejection reason counts
- **AND** it SHALL retain an `other` bucket for unrecognized rejection reasons

#### Scenario: Generic advice pressure is visible
- **WHEN** recent learning rejections include generic or non-transferable guidance reasons
- **THEN** ExperienceEngine SHALL expose a generic-advice rejection count
- **AND** the count SHALL be derived without creating new candidate records

#### Scenario: Feedback closure is visible
- **WHEN** ExperienceEngine has delivered or evaluated interventions in the current scope
- **THEN** ExperienceEngine SHALL report helped and harmed feedback counts
- **AND** it SHALL report how many resolved interventions still have no helped or harmed feedback signal
