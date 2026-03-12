## ADDED Requirements

### Requirement: Claude UserPromptSubmit Supports ExperienceEngine Injection

ExperienceEngine MUST be able to inject prompt-time guidance into Claude Code through the official `UserPromptSubmit` hook surface.

#### Scenario: Similar Claude prompt selects a candidate node

- **WHEN** a Claude `UserPromptSubmit` hook payload maps to a task with a matching ExperienceEngine node
- **THEN** ExperienceEngine returns Claude hook output containing additional prompt context
- **AND** the Claude session state remembers the injected node ids for later finalization

#### Scenario: Claude finalization reuses prompt-time injected node ids

- **WHEN** a Claude session that received prompt-time injection later reaches `SessionEnd`
- **THEN** the finalized input record persists the same injected node ids that were selected during `UserPromptSubmit`

#### Scenario: Hook command output is not polluted by Node warnings

- **WHEN** ExperienceEngine installs Claude hooks
- **THEN** the configured hook command suppresses Node runtime warnings
- **AND** Claude receives only deliberate hook output from ExperienceEngine
