## ADDED Requirements

### Requirement: Prompt rendering reflects intervention strength

ExperienceEngine SHALL render delivered guidance with language that communicates the intended strength of the intervention.

#### Scenario: Diagnostic hints are rendered as diagnostic leads

- **WHEN** an intervention has strength `diagnostic_hint`
- **THEN** the injected prompt text labels it as a low-confidence diagnostic hint
- **AND** instructs the agent to verify whether the same signal exists before acting
- **AND** states that the hint is not a required fix

#### Scenario: Soft recommendations are rendered as relevant prior experience

- **WHEN** an intervention has strength `soft_recommendation`
- **THEN** the injected prompt text labels it as relevant prior experience
- **AND** frames the guidance as something to check before making unrelated changes

#### Scenario: Strong recommendations are rendered as validated prior experience

- **WHEN** an intervention has strength `strong_recommendation`
- **THEN** the injected prompt text labels it as validated prior experience
- **AND** tells the agent to follow it unless current evidence contradicts it

#### Scenario: Hard constraints are rendered as constraints

- **WHEN** an intervention has strength `hard_constraint`
- **THEN** the injected prompt text labels it as a project constraint or explicit instruction
- **AND** tells the agent not to violate it without explicit user approval

### Requirement: Policy-aware rendering remains compact

ExperienceEngine SHALL keep injected policy-aware guidance compact enough for prompt-time use.

#### Scenario: Full scorecard is not dumped into prompt text

- **WHEN** ExperienceEngine renders an intervention with scorecard metadata
- **THEN** the prompt text includes only compact usage semantics and selected node guidance
- **AND** it does not include full runner-up diagnostics or the full scorecard JSON

#### Scenario: Older call sites remain compatible

- **WHEN** a call site renders injection text without an intervention strength
- **THEN** ExperienceEngine falls back to the existing generic injected-hints behavior
- **AND** it does not throw or suppress otherwise valid guidance

