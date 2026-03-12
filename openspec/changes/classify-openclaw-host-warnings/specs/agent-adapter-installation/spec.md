## MODIFIED Requirements

### Requirement: OpenClaw doctor reports host health clearly

`ee doctor` MUST distinguish ExperienceEngine-owned host warnings from unrelated OpenClaw warnings.

#### Scenario: Unrelated plugin warnings remain after ExperienceEngine repair

- **WHEN** OpenClaw reports an unrelated plugin warning and an ExperienceEngine advisory
- **THEN** `ee doctor` separates them into different groups
- **AND** unrelated warnings do not appear as ExperienceEngine-owned failures
