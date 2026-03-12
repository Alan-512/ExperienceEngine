## ADDED Requirements

### Requirement: Codex MCP tools expose the shared ExperienceEngine runtime loop

ExperienceEngine MUST expose Codex-facing MCP tools that map to the shared runtime lifecycle without assuming host lifecycle hooks.

#### Scenario: Codex looks up hints before work starts

- **WHEN** a Codex client calls `experienceengine_lookup_hints` with a prompt and scope
- **THEN** ExperienceEngine evaluates intervention through the shared runtime
- **AND** returns the current injection mode, text, and injected node ids

#### Scenario: Codex records tool results before finalization

- **WHEN** a Codex client calls `experienceengine_record_tool_result`
- **THEN** ExperienceEngine persists the normalized tool result into the active session state
- **AND** that tool result is available to later task finalization

#### Scenario: Codex finalizes a task and updates feedback

- **WHEN** a Codex client calls `experienceengine_finalize_task` for a session that previously looked up hints
- **THEN** ExperienceEngine persists the finalized task input record
- **AND** updates helped/harmed feedback for any injected nodes based on the resulting outcome
