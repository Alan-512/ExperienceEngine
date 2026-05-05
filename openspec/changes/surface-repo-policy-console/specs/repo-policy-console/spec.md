## ADDED Requirements

### Requirement: Repo policy inspection explains current circuit state

ExperienceEngine SHALL expose an operator-readable repo policy inspection surface that reports configured mode, effective mode, circuit state, diagnostic suppression, reason, and timestamps.

#### Scenario: Operator inspects a clear repo policy

- **WHEN** an operator inspects repo policy for a repo with no tripped circuit
- **THEN** ExperienceEngine reports the configured mode, effective mode, `clear` circuit state, and updated timestamp
- **AND** it reports that live diagnostic suppression is not active

#### Scenario: Operator inspects a tripped repo policy

- **WHEN** an operator inspects repo policy for a repo with a tripped circuit
- **THEN** ExperienceEngine reports the configured mode, effective mode, `tripped` circuit state, circuit reason, last tripped timestamp, and diagnostic suppression state
- **AND** it includes explicit restore guidance without automatically restoring the policy

### Requirement: Repo policy inspection includes bounded circuit evidence

ExperienceEngine SHALL include bounded recent evidence that explains repo policy circuit decisions.

#### Scenario: Attribution evidence is available

- **WHEN** recent attribution records exist for the repo policy evidence window
- **THEN** ExperienceEngine reports attribution evidence counts by verdict
- **AND** it lists recent evidence entries with source, verdict, node or injection reference, delivery status, and timestamp

#### Scenario: Fallback injection evidence is used

- **WHEN** fallback injection evidence contributes to the repo policy evidence window
- **THEN** ExperienceEngine labels those entries as `injection_fallback`
- **AND** it does not present fallback evidence as canonical attribution records

#### Scenario: Evidence output is bounded

- **WHEN** more than 20 eligible evidence records exist
- **THEN** ExperienceEngine limits policy evidence output to the latest 20 eligible records
- **AND** it reports the bounded window size used for the inspection

### Requirement: Repo policy inspection is read-only

ExperienceEngine SHALL keep repo policy inspection read-only.

#### Scenario: Inspecting policy does not mutate state

- **WHEN** an operator inspects repo policy evidence
- **THEN** ExperienceEngine does not change repo policy state
- **AND** it does not write attribution, injection, review, or node lifecycle records

