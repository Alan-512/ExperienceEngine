## ADDED Requirements

### Requirement: Attribution can use trace-derived adoption evidence

ExperienceEngine SHALL use trace-derived adoption and violation evidence when available without replacing existing feedback governance.

#### Scenario: Delivered guidance is matched against trace evidence

- **WHEN** a task finalizes with delivered injected node ids and a trace capsule
- **THEN** ExperienceEngine can compare injected expectations against normalized tool, file-change, verification, avoidance, and final-message evidence
- **AND** attribution records can reference matched or violated expectation evidence

#### Scenario: Trace-derived attribution preserves unknown when evidence is insufficient

- **WHEN** a trace capsule lacks enough evidence to determine whether delivered guidance was adopted, violated, helped, or harmed
- **THEN** ExperienceEngine records unknown or low-confidence attribution rather than forcing helped or harmed attribution
- **AND** manual feedback remains the override path
