## ADDED Requirements

### Requirement: Retrieval does not imply injection

ExperienceEngine SHALL treat retrieved candidates as inputs to intervention policy, not as automatic prompt content.

#### Scenario: Candidate retrieved but policy rejects injection

- **WHEN** retrieval returns a candidate that intervention policy rejects because of maturity, delivery state, recent harm, or confidence
- **THEN** ExperienceEngine SHALL keep the candidate diagnostic and SHALL NOT inject it
