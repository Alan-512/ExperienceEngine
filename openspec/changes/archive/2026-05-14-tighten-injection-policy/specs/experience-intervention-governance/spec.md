## ADDED Requirements

### Requirement: Routine injection defaults to one compact hint

ExperienceEngine SHALL inject at most one compact hint during routine prompt-time intervention unless a documented strong-candidate path explicitly permits more.

#### Scenario: Ordinary eligible match

- **WHEN** a routine task has one or more ordinary eligible matching nodes
- **THEN** ExperienceEngine SHALL inject no more than one compact hint by default

### Requirement: Raw history is never injected

ExperienceEngine SHALL NOT inject raw task records, raw tool histories, or raw learning candidates into a host prompt.

#### Scenario: Candidate exists but is not a mature node

- **WHEN** retrieval or learning diagnostics include a candidate that has not become an injectable experience node
- **THEN** ExperienceEngine SHALL NOT inject that candidate into the prompt

### Requirement: Conservative injection remains compact

ExperienceEngine SHALL render conservative injections as compact hints without expanded structured guidance.

#### Scenario: Conservative delivery selected

- **WHEN** intervention mode is conservative
- **THEN** the injected prompt content SHALL omit expanded Goal, Steps, Avoid, and raw evidence details

### Requirement: Expanded guidance is gated by maturity

ExperienceEngine SHALL render expanded structured guidance only when node maturity and delivery confidence allow it.

#### Scenario: Mature high-confidence node

- **WHEN** a node is mature, delivery-eligible, and selected through a high-confidence path
- **THEN** ExperienceEngine MAY render bounded Goal, Avoid, or Success Signal fields according to injection policy
