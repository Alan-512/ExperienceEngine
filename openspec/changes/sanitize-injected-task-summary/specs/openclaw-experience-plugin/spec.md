## MODIFIED Requirements

### Requirement: Host Payload Normalization
The system SHALL normalize supported OpenClaw payload shapes into a usable internal task context.

#### Scenario: Message-object prompt payload
- **GIVEN** a prompt payload containing `session.key`, `workspace.cwd`, and `message.content`
- **WHEN** ExperienceEngine normalizes the payload
- **THEN** it resolves a session id, cwd, user message, and task summary

#### Scenario: Messages-array prompt payload
- **GIVEN** a prompt payload containing `messages[]` and a repo root
- **WHEN** ExperienceEngine normalizes the payload
- **THEN** it resolves the latest user request as the task summary
- **AND** it preserves any available context summary from compaction or working context

#### Scenario: Tool persistence payload
- **GIVEN** a tool result payload with tool identity and execution status
- **WHEN** ExperienceEngine normalizes the payload
- **THEN** it records a tool event with name, status, and optional evidence fields

#### Scenario: ExperienceEngine-injected hint blocks are stripped from task summaries
- **GIVEN** a prompt or finalize payload whose leading user-visible text starts with `Execution hints from prior similar tasks:` or `Conservative execution hints:`
- **WHEN** ExperienceEngine builds the internal task summary
- **THEN** it removes the injected hint block before persisting `task_summary`
- **AND** the remaining summary stays anchored to the original user request
