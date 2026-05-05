# experience-hygiene-review Specification

## Purpose
Expose read-only hygiene review reports that help operators find stale, duplicate, conflicting, over-generalized, or evidence-drifted learned experience before it keeps influencing future tasks.

## Requirements

### Requirement: Hygiene review reports library quality issues

ExperienceEngine SHALL provide a read-only hygiene review that reports quality issues in learned experience.

#### Scenario: Operator reviews hygiene findings

- **WHEN** an operator runs hygiene review for a repo
- **THEN** ExperienceEngine returns structured findings with type, severity, affected ids, evidence summary, and recommendation
- **AND** it does not mutate candidates, nodes, attribution records, injection records, review events, repo policy, or delivery state

#### Scenario: No hygiene issues found

- **WHEN** no supported hygiene rule finds an issue
- **THEN** ExperienceEngine reports an empty finding list with a summary count of zero

### Requirement: Hygiene review detects stale experience

ExperienceEngine SHALL flag experience that appears stale based on last use and attribution evidence.

#### Scenario: Active node has stale usage evidence

- **WHEN** an active or cooling node has not been used recently and has no recent helped attribution
- **THEN** hygiene review reports a `stale_experience` finding
- **AND** the recommendation asks the operator to inspect the node or review whether cooling or retirement is appropriate outside the report

### Requirement: Hygiene review detects duplicate guidance

ExperienceEngine SHALL flag likely duplicate learned guidance within the same scope and task family.

#### Scenario: Same-scope nodes have highly similar guidance

- **WHEN** two or more `candidate`, `priority_candidate`, `active`, or `cooling` nodes in the same scope and task family have highly similar trigger or hint text
- **THEN** hygiene review reports a `duplicate_guidance` finding
- **AND** it lists the affected node ids without merging them automatically

#### Scenario: Raw candidates duplicate promoted nodes

- **WHEN** a raw experience candidate has highly similar trigger or hint text to an existing same-scope same-family node
- **THEN** hygiene review reports a `duplicate_guidance` finding
- **AND** it lists candidate and node ids without discarding or merging the candidate automatically

### Requirement: Hygiene review detects conflicting guidance

ExperienceEngine SHALL flag guidance that appears to conflict within the same scope and task family.

#### Scenario: Recommended and avoided paths overlap

- **WHEN** one `candidate`, `priority_candidate`, `active`, or `cooling` node recommends a path that another same-scope same-family node explicitly avoids
- **THEN** hygiene review reports a `conflicting_guidance` finding
- **AND** it recommends operator review rather than changing either node

### Requirement: Hygiene review detects over-generalized guidance

ExperienceEngine SHALL flag guidance that appears too broad for its evidence.

#### Scenario: Broad hint has weak or harmful evidence

- **WHEN** a raw candidate or node has generic trigger or hint wording and weak support or elevated harmed ratio
- **THEN** hygiene review reports an `over_generalized_guidance` finding
- **AND** it recommends operator review of narrowing, cooling, or retirement outside the report

### Requirement: Hygiene review detects evidence drift

ExperienceEngine SHALL flag nodes whose current delivery state appears inconsistent with recent attribution or episode evidence.

#### Scenario: Eligible delivery node has recent harmful evidence

- **WHEN** a node with `delivery_state` `eligible` or `conservative_only` has recent harmful attribution evidence
- **THEN** hygiene review reports an `evidence_drift` finding
- **AND** it includes the relevant attribution or episode references when available

### Requirement: Hygiene review is bounded and filterable

ExperienceEngine SHALL keep hygiene review output bounded and filterable.

#### Scenario: Operator filters hygiene findings

- **WHEN** an operator requests hygiene review with filters such as scope, finding type, severity, or limit
- **THEN** ExperienceEngine applies those filters to the report
- **AND** it preserves deterministic ordering by severity and evidence recency
