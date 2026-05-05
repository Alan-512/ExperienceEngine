## ADDED Requirements

### Requirement: Export drafts summarize reviewable learned guidance

ExperienceEngine SHALL provide read-only export draft reports for selected learned experience nodes.

#### Scenario: Operator reviews export drafts

- **WHEN** an operator requests export drafts for a repo
- **THEN** ExperienceEngine returns bounded structured drafts with draft id, scope id, node ids, task family, guidance text, evidence summary, provenance refs, risk notes, and suggested target type
- **AND** it does not write instruction files, skills, docs, node state, delivery state, attribution records, review events, or repo policy

#### Scenario: No exportable guidance exists

- **WHEN** no supported node matches the export draft filters
- **THEN** ExperienceEngine returns an empty draft list with a summary count of zero

### Requirement: Export drafts are filterable and bounded

ExperienceEngine SHALL let operators narrow export draft reports without changing stored state.

#### Scenario: Operator filters export drafts

- **WHEN** an operator requests export drafts with filters such as scope, node id, node type, task family, risk, or limit
- **THEN** ExperienceEngine applies those filters to the report
- **AND** it preserves deterministic ordering by readiness and evidence recency

### Requirement: Export drafts include review context

ExperienceEngine SHALL include enough context for an operator to decide whether guidance should be exported.

#### Scenario: Draft includes evidence and risk context

- **WHEN** ExperienceEngine builds an export draft for a node
- **THEN** the draft includes compact guidance, applicability notes, provenance refs, helped/harmed signals, delivery state, and hygiene/risk notes when available
- **AND** the draft remains readable without requiring database inspection

### Requirement: Export drafts stay separate from managed state snapshots

ExperienceEngine SHALL distinguish guidance export drafts from backup/export snapshots of managed state.

#### Scenario: Operator requests guidance export drafts

- **WHEN** an operator requests export drafts
- **THEN** ExperienceEngine returns reviewable guidance draft content
- **AND** it does not create or modify managed backup/export snapshot artifacts

### Requirement: Export drafts do not include raw candidates as primary drafts

ExperienceEngine SHALL use formal experience nodes as the primary source for export drafts.

#### Scenario: Raw candidate overlaps an exportable node

- **WHEN** hygiene context references raw candidates near an exportable node
- **THEN** ExperienceEngine may include candidate ids as context
- **AND** it does not emit a raw candidate as a primary export draft before promotion or distillation
