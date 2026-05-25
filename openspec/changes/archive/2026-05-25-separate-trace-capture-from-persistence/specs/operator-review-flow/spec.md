## MODIFIED Requirements

### Requirement: Operator review flow summarizes scope health

ExperienceEngine SHALL provide a bounded read-only operator review report for one scope.

#### Scenario: Operator reviews scope health

- **WHEN** an operator requests the review flow for a repo
- **THEN** ExperienceEngine returns a structured report with scope id, generated timestamp, `sections`, `reviewItems`, recommended review order, drill-down references, and review-only next actions
- **AND** it does not mutate repo policy, nodes, candidates, attribution records, injection records, review events, managed snapshots, external instruction files, or trace diagnostic snapshots

#### Scenario: Review report has a stable minimal shape

- **WHEN** ExperienceEngine returns an operator review report
- **THEN** each review item includes `priority`, `source`, `title`, `summary`, and `drillDown`
- **AND** `priority` is one of `high`, `medium`, or `low`
- **AND** `source` is one of `repo_policy`, `hygiene`, `export_drafts`, or `trace_provenance`
- **AND** the repo policy section health is one of `clear`, `attention`, or `tripped`
- **AND** each review-only next action includes at least `priority` and `summary`

#### Scenario: No review items exist

- **WHEN** repo policy is clear, hygiene findings are empty, export drafts are empty, and trace provenance has no attention items
- **THEN** ExperienceEngine returns a review report with an empty `reviewItems` list and a low-priority next action

#### Scenario: Review report supports operator display

- **WHEN** ExperienceEngine returns an operator review report
- **THEN** the report includes enough structured data for a caller to display review order, source, priority, title, summary, and drill-down references without scraping terminal output
- **AND** the report keeps review-only state explicit in next actions or section summaries

### Requirement: Operator review flow preserves drill-down paths

ExperienceEngine SHALL link summary items to existing detailed inspection surfaces.

#### Scenario: Review report includes drill-down references

- **WHEN** ExperienceEngine returns an operator review report
- **THEN** each major section includes a CLI drill-down command or MCP resource reference for the detailed repo, hygiene, export-draft, or trace provenance report
- **AND** those references remain advisory and do not execute changes

#### Scenario: Drill-down references are aligned across surfaces

- **WHEN** a review item points to repo policy, hygiene, export drafts, or trace provenance
- **THEN** its drill-down references use the same source names and command/resource identifiers documented for CLI and MCP inspection
- **AND** those references do not point to mutation, restore, export, lifecycle-control actions, or diagnostic snapshot persistence changes

## ADDED Requirements

### Requirement: Operator review flow reports trace provenance without exposing full trace by default

ExperienceEngine SHALL expose trace summary and provenance diagnostics through operator review without requiring or displaying full pre-distillation trace events.

#### Scenario: Review report includes trace provenance summary

- **WHEN** a scope has recent trace-backed learning, attribution, or rejected candidates
- **THEN** operator review may include trace provenance summary items with completeness, host capability state, evidence categories, redaction summary, and learning use or rejection reason
- **AND** it SHALL NOT display full prompt, transcript, tool output, artifact content, hidden reasoning, chain-of-thought, or raw host payloads

#### Scenario: Full trace drill-down requires diagnostic snapshot

- **WHEN** an operator follows a trace drill-down for a task that has no diagnostic snapshot
- **THEN** ExperienceEngine explains that the trace evidence was used transiently and only summary/provenance was retained
- **AND** it does not fail the normal review flow

- **WHEN** an operator follows a trace drill-down for a task that has an explicit diagnostic snapshot
- **THEN** ExperienceEngine can show bounded diagnostic trace details according to trace snapshot inspection rules
