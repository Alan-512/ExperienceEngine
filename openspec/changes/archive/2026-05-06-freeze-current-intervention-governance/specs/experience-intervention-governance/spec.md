## ADDED Requirements

### Requirement: Current intervention governance behavior is frozen before semantic refactors

ExperienceEngine SHALL have regression coverage for current delivery gating, injection decisions, scorecard persistence, and host-facing summaries before adding prompt-strength semantics.

#### Scenario: Delivery-state mapping remains stable

- **WHEN** ExperienceEngine evaluates active, priority candidate, candidate, cooling, retired, and quarantined nodes in the current implementation
- **THEN** golden tests record the current mapping from node state and `delivery_state` to live eligibility
- **AND** the tests cover `shadow_only`, `conservative_only`, `eligible`, and `quarantined` delivery states

#### Scenario: Injection modes remain stable

- **WHEN** the current controller evaluates known active and conservative candidate cases
- **THEN** golden tests assert the resulting `InjectionMode`
- **AND** the selected node ids and conservative hint caps remain unchanged

#### Scenario: Evaluation modes remain stable

- **WHEN** the runtime runs in `live`, `shadow`, and `holdout` evaluation modes
- **THEN** golden tests assert the delivered flag, prompt text presence, injected node ids, and scorecard persistence behavior for each mode

#### Scenario: Existing scorecard fields remain stable

- **WHEN** ExperienceEngine persists an injection event under current behavior
- **THEN** golden tests assert existing scorecard fields such as mode, risk level, confidence, decision reason, selected candidate ids, and rejected candidates where applicable
- **AND** the tests do not require new fields introduced by later phases

#### Scenario: Host-facing summaries remain stable

- **WHEN** CLI, interaction, or Codex MCP surfaces summarize current scorecard decisions
- **THEN** golden tests assert the current summary shape and key wording
- **AND** later renderer policy changes must update those expectations intentionally
