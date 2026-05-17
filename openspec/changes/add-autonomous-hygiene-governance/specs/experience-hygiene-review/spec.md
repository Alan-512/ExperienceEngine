## ADDED Requirements

### Requirement: Hygiene findings can feed autonomous governance
ExperienceEngine SHALL expose hygiene findings as stable, read-only inputs for autonomous hygiene governance planning.

#### Scenario: Governance planner consumes hygiene findings
- **WHEN** autonomous hygiene governance requests findings for a scope
- **THEN** hygiene review returns bounded structured findings with stable affected ids, evidence refs, severity, type, and recommendation fields
- **AND** hygiene review itself does not mutate candidates, nodes, attribution records, injection records, review events, repo policy, delivery state, or external instruction files

#### Scenario: Hygiene findings are unchanged
- **WHEN** autonomous governance observes that the current hygiene finding set matches the last planned finding hash
- **THEN** ExperienceEngine skips LLM planning for that scope unless a legacy pending approval, failed action, or explicit drain request requires re-evaluation
- **AND** it records that the governance run reused or skipped an unchanged hygiene input
