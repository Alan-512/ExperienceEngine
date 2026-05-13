## ADDED Requirements

### Requirement: Routine explain surfaces report skip reasons

ExperienceEngine SHALL expose the most recent no-injection reason through routine inspect or explain surfaces.

#### Scenario: User asks why nothing was injected

- **WHEN** a user asks why ExperienceEngine did not inject guidance for the last task
- **THEN** the host-facing routine surface SHALL return the structured skip reason and a concise explanation
