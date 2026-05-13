## ADDED Requirements

### Requirement: No-injection decisions expose structured reasons

ExperienceEngine SHALL produce a structured skip reason when an intervention decision does not inject guidance.

#### Scenario: No candidate exists

- **WHEN** no relevant experience candidate is available for a task
- **THEN** ExperienceEngine SHALL expose a skip reason indicating that no candidate was available

#### Scenario: Candidate is not mature enough

- **WHEN** a similar candidate exists but delivery or lifecycle state prevents injection
- **THEN** ExperienceEngine SHALL expose a skip reason indicating that the candidate is not mature enough or is not eligible for delivery

#### Scenario: Policy rejects injection

- **WHEN** retrieval finds a semantically similar candidate but policy rejects it
- **THEN** ExperienceEngine SHALL expose a skip reason indicating policy rejection

### Requirement: Skip explanations do not pollute routine prompts

ExperienceEngine SHALL keep no-injection explanations out of normal prompt injection unless a user or agent explicitly asks for an explanation.

#### Scenario: Routine task has no injection

- **WHEN** ExperienceEngine skips injection during routine prompt-time lookup
- **THEN** it SHALL NOT add a verbose no-injection explanation to the task prompt by default
