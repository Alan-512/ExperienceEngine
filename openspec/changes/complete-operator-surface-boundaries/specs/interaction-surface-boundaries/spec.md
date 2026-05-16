## ADDED Requirements

### Requirement: Interaction surfaces have durable tiers

ExperienceEngine SHALL classify user-facing interaction surfaces into routine, operator, and advanced or experimental tiers.

#### Scenario: Routine surfaces are identified

- **WHEN** ExperienceEngine describes routine usage
- **THEN** it SHALL identify day-to-day status, doctor, last-inspection, helped/harmed feedback, and host-native routine review as routine surfaces
- **AND** it SHALL present host-native routine use before CLI fallback where the host supports it

#### Scenario: Operator surfaces are identified

- **WHEN** ExperienceEngine describes operator workflows
- **THEN** it SHALL identify install, upgrade, repair, operator review, hygiene review, export drafts, and managed state backup/export/import/rollback as operator surfaces
- **AND** it SHALL distinguish read-only operator review from high-impact operator mutations

#### Scenario: Advanced surfaces are identified

- **WHEN** ExperienceEngine describes advanced or experimental workflows
- **THEN** it SHALL identify maintenance commands, raw evaluations, broker internals, and developer-only diagnostics as advanced or experimental
- **AND** it SHALL avoid presenting those workflows as required for normal use

### Requirement: Surface tier is distinct from action risk

ExperienceEngine SHALL treat workflow tier and mutation risk as separate concepts.

#### Scenario: Read-only operator action is low risk

- **WHEN** a user inspects operator review, hygiene, or export drafts
- **THEN** ExperienceEngine SHALL classify the workflow as operator-tier
- **AND** it SHALL preserve the read-only or low-risk action safety semantics

#### Scenario: High-impact operator action requires safeguards

- **WHEN** a user plans install, repair, upgrade, import, or rollback
- **THEN** ExperienceEngine SHALL classify the workflow as operator-tier and high-impact
- **AND** it SHALL preserve existing confirmation or planning safeguards where available

### Requirement: Surface consolidation is compatibility-preserving

ExperienceEngine SHALL consolidate surface presentation without removing existing commands or action ids in the first pass.

#### Scenario: Existing CLI command remains available

- **WHEN** a command existed before the surface consolidation
- **THEN** it SHALL remain callable with its previous command name unless a separate compatibility change explicitly provides aliases and migration guidance

#### Scenario: Existing broker action remains available

- **WHEN** a Codex broker action existed before the surface consolidation
- **THEN** it SHALL remain discoverable by its previous action id
- **AND** any new tier metadata SHALL be additive

#### Scenario: Existing operator reports keep their behavior

- **WHEN** ExperienceEngine classifies operator review, hygiene review, or export drafts as operator-tier workflows
- **THEN** their existing read-only report behavior SHALL remain unchanged
- **AND** the tier label SHALL NOT imply policy restore, hygiene mutation, export writing, node lifecycle mutation, or state import/rollback
