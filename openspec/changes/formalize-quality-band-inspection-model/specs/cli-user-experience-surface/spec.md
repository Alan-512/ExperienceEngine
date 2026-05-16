## ADDED Requirements

### Requirement: CLI inspection surfaces include Quality Band explanations

ExperienceEngine CLI inspection surfaces SHALL use the shared Quality Band model when explaining learned guidance trust.

#### Scenario: User inspects active experiences

- **WHEN** a user runs `ee inspect active`
- **THEN** each displayed node SHALL include its Quality Band
- **AND** the output SHALL use the shared Quality Band derivation rather than command-local logic

#### Scenario: User inspects a node detail

- **WHEN** a user runs `ee inspect node <id>`
- **THEN** the output SHALL include the Quality Band, top reasons, available evidence references, and a review-only next action when applicable

#### Scenario: User inspects the last intervention

- **WHEN** a user runs `ee inspect --last`
- **THEN** injected or matched guidance SHALL include the Quality Band explanation where node context is available
- **AND** no-injection output SHALL distinguish no relevant guidance from building or risky guidance when that evidence is available

#### Scenario: User inspects repo summary

- **WHEN** a user runs a repo-level summary inspection
- **THEN** ExperienceEngine SHALL summarize Quality Band counts or equivalent trust distribution for current-scope guidance
- **AND** it SHALL keep detailed evidence in drill-down surfaces rather than overloading the summary

