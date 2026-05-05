## ADDED Requirements

### Requirement: Repo policy summary is evidence-aware

ExperienceEngine SHALL make repo policy summary output evidence-aware without changing circuit breaker thresholds or diagnostic delivery semantics.

#### Scenario: Repo summary includes policy evidence summary

- **WHEN** an operator inspects a repo summary
- **THEN** ExperienceEngine includes repo policy state and bounded evidence counts
- **AND** it distinguishes attribution evidence from injection fallback evidence

#### Scenario: Repo summary preserves hard safety semantics

- **WHEN** repo policy inspection is rendered
- **THEN** ExperienceEngine does not imply that repo mode can override disabled scopes, quarantined nodes, retired nodes, or delivery-state gates
- **AND** it keeps restore language limited to clearing the temporary circuit state

