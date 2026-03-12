## ADDED Requirements

### Requirement: Claude Failure Hooks Produce Failed Tool Results

ExperienceEngine MUST capture Claude `PostToolUseFailure` events and replay them into the core runtime as failed tool results.

#### Scenario: Claude emits PostToolUseFailure

- **WHEN** Claude runs a tool that fails and emits `PostToolUseFailure`
- **THEN** the Claude adapter captures the event
- **AND** normalizes it into a failed tool result for session replay

#### Scenario: Claude doctor verifies failure-hook installation

- **WHEN** ExperienceEngine installs Claude hooks into a project
- **THEN** the project-local settings include a `PostToolUseFailure` hook matcher
- **AND** `ee doctor claude-code` reports that the failure hook is present
