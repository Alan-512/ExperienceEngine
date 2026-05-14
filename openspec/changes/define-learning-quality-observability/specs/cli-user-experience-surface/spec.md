## ADDED Requirements

### Requirement: CLI health surfaces include learning quality

ExperienceEngine CLI health surfaces SHALL include concise learning-quality metrics for the current repo scope.

#### Scenario: Status reports learning quality
- **WHEN** a user runs `ee status`
- **THEN** ExperienceEngine SHALL print a learning-quality section or equivalent lines
- **AND** the output SHALL include recent task learning statuses, candidate admission rate, generic-advice rejection count, and feedback closure counts

#### Scenario: Doctor reports learning quality
- **WHEN** a user runs `ee doctor <host>`
- **THEN** ExperienceEngine SHALL include current-scope learning-quality metrics alongside host readiness
- **AND** the output SHALL remain read-only and SHALL NOT mutate candidates, nodes, attribution records, or task runs
