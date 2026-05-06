## MODIFIED Requirements

### Requirement: Operator review flow summarizes scope health

ExperienceEngine SHALL provide a bounded read-only operator review report for one scope.

#### Scenario: Operator reviews scope health

- **WHEN** an operator requests the review flow for a repo
- **THEN** ExperienceEngine returns a structured report with scope id, generated timestamp, `sections`, `reviewItems`, recommended review order, drill-down references, and review-only next actions
- **AND** it does not mutate repo policy, nodes, candidates, attribution records, injection records, review events, managed snapshots, or external instruction files

#### Scenario: Review report has a stable minimal shape

- **WHEN** ExperienceEngine returns an operator review report
- **THEN** each review item includes `priority`, `source`, `title`, `summary`, and `drillDown`
- **AND** `priority` is one of `high`, `medium`, or `low`
- **AND** `source` is one of `repo_policy`, `hygiene`, or `export_drafts`
- **AND** the repo policy section health is one of `clear`, `attention`, or `tripped`
- **AND** each review-only next action includes at least `priority` and `summary`

#### Scenario: No review items exist

- **WHEN** repo policy is clear, hygiene findings are empty, and export drafts are empty
- **THEN** ExperienceEngine returns a review report with an empty `reviewItems` list and a low-priority next action

#### Scenario: Review report supports operator display

- **WHEN** ExperienceEngine returns an operator review report
- **THEN** the report includes enough structured data for a caller to display review order, source, priority, title, summary, and drill-down references without scraping terminal output
- **AND** the report keeps review-only state explicit in next actions or section summaries

### Requirement: Operator review flow preserves drill-down paths

ExperienceEngine SHALL link summary items to existing detailed inspection surfaces.

#### Scenario: Review report includes drill-down references

- **WHEN** ExperienceEngine returns an operator review report
- **THEN** each major section includes a CLI drill-down command or MCP resource reference for the detailed repo, hygiene, or export-draft report
- **AND** those references remain advisory and do not execute changes

#### Scenario: Drill-down references are aligned across surfaces

- **WHEN** a review item points to repo policy, hygiene, or export drafts
- **THEN** its drill-down references use the same source names and command/resource identifiers documented for CLI and MCP inspection
- **AND** those references do not point to mutation, restore, export, or lifecycle-control actions
