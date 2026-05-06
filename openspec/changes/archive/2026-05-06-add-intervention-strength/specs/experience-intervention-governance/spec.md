## ADDED Requirements

### Requirement: Intervention strength is distinct from delivery and evaluation state

ExperienceEngine SHALL model prompt guidance strength separately from node delivery eligibility, run-level evaluation mode, and controller injection action.

#### Scenario: Strength is not added to DeliveryState

- **WHEN** ExperienceEngine defines prompt-strength values such as `diagnostic_hint`
- **THEN** those values are represented by `InterventionStrength`
- **AND** `DeliveryState` remains limited to delivery eligibility values such as `shadow_only`, `conservative_only`, `eligible`, and `quarantined`

#### Scenario: Scorecard records intervention strength

- **WHEN** ExperienceEngine selects an intervention with mode `inject` or `inject_conservative`
- **THEN** the persisted injection scorecard includes the derived intervention strength
- **AND** existing scorecard fields such as mode, risk level, confidence, and selected node ids remain available

#### Scenario: Adding strength does not change live delivery

- **WHEN** the same node set, input, config, and evaluation mode are evaluated before and after this change
- **THEN** the resulting `InjectionMode`, delivered flag, and injected node ids remain unchanged
- **AND** only the diagnostics and scorecard gain strength metadata

### Requirement: Initial strength derivation is conservative

ExperienceEngine SHALL derive intervention strength from existing mode, node maturity, validation, and explicit user-confirmed correction signals without widening candidate delivery.

#### Scenario: Conservative candidate-like guidance remains conservative

- **WHEN** a selected node is delivered through `inject_conservative`
- **THEN** ExperienceEngine derives `diagnostic_hint` or `soft_recommendation`
- **AND** it does not upgrade the controller mode to normal `inject`

#### Scenario: Mature validated guidance can be strong

- **WHEN** a selected active node has reuse validation or enough helped evidence
- **THEN** ExperienceEngine may derive `strong_recommendation`
- **AND** it keeps the existing eligibility and evaluation gates in force

#### Scenario: Hard constraints require explicit support

- **WHEN** ExperienceEngine derives `hard_constraint`
- **THEN** the selected guidance is based on explicit user-confirmed correction or highly validated rule evidence
- **AND** ordinary candidates are not treated as hard constraints

