## ADDED Requirements

### Requirement: Real Claude Follow-Up Tasks Reuse Prior Experience

ExperienceEngine MUST demonstrate in a real Claude Code runtime that a similar follow-up task receives prompt-time intervention when a matching experience node already exists.

#### Scenario: Similar Claude follow-up injects guidance

- **WHEN** a Claude `UserPromptSubmit` prompt matches an existing ExperienceEngine node in the same scope and task family
- **THEN** ExperienceEngine emits Claude hook output containing additional context
- **AND** the finalized record persists a non-empty `injected_node_ids_json`

### Requirement: Real Claude Negative Controls Skip Injection

ExperienceEngine MUST demonstrate in a real Claude Code runtime that unrelated Claude tasks do not receive prompt-time intervention.

#### Scenario: Different task family skips guidance

- **WHEN** a Claude prompt belongs to a different task family from the existing node set
- **THEN** ExperienceEngine emits no Claude additional context
- **AND** the finalized record persists empty `injected_node_ids_json`

### Requirement: Real Claude Outcomes Update Injected Node Feedback

ExperienceEngine MUST demonstrate in a real Claude Code runtime that injected Claude tasks update node feedback counters.

#### Scenario: Injected Claude success increments helped counters

- **WHEN** a Claude task receives prompt-time injection and finalizes successfully
- **THEN** the injected node's `usage_count` and `helped_count` increment

#### Scenario: Injected Claude failure increments harmed counters

- **WHEN** a Claude task receives prompt-time injection and finalizes with failure evidence
- **THEN** the injected node's `usage_count` and `harmed_count` increment
