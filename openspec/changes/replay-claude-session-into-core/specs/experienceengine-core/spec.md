## MODIFIED Requirements

### Requirement: Supported adapters can drive the common runtime from normalized lifecycle data

Adapters with stateless hook execution MUST persist enough session state to replay a completed task into the common runtime.

#### Scenario: Claude session end replays into core

- **WHEN** Claude Code has emitted prompt, tool, and session-end hooks for the same session
- **THEN** ExperienceEngine replays that session into the common runtime
- **AND** real input records and derived candidates can be persisted
- **AND** the Claude adapter removes the stored session state after replay
