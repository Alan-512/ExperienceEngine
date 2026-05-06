## ADDED Requirements

### Requirement: Retrieval policy diagnostics are inspectable

ExperienceEngine SHALL expose staged retrieval-policy diagnostics through operator inspection surfaces.

#### Scenario: Latest verbose inspection shows stage outcomes

- **WHEN** an operator runs the latest verbose inspection for a task with retrieval-policy diagnostics
- **THEN** the output includes each retrieval-policy stage name and outcome counts
- **AND** semantic rerank/backfill mode is visible when available
- **AND** the output does not require scraping injected prompt text to understand the retrieval path

#### Scenario: Policy components are visible for the top candidate

- **WHEN** the latest scorecard contains structured policy components for the top candidate
- **THEN** inspection output shows the top policy components with category, signed value, and reason
- **AND** the flat policy reasons remain available for compatibility

#### Scenario: Host-native summaries include retrieval-policy explanation

- **WHEN** a host-native inspect or lookup summary returns a scorecard summary
- **THEN** it includes a bounded retrieval-policy explanation derived from the scorecard
- **AND** the explanation is additive and does not change retrieval, scoring, delivery, or prompt text
