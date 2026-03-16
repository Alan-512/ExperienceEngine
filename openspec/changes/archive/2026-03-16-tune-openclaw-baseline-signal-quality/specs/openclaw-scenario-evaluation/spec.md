## MODIFIED Requirements

### Requirement: High-confidence OpenClaw scenario packs measure the learning loop
ExperienceEngine SHALL provide a focused OpenClaw scenario evaluation pack that exercises repeated, high-confidence task families and reports candidate, distillation, injection, and outcome behavior from the real OpenClaw baseline environment.

#### Scenario: High-confidence scenario pack produces learning-loop coverage
- **WHEN** operators run the OpenClaw high-confidence scenario pack against a real OpenClaw baseline environment
- **THEN** ExperienceEngine outputs aggregate counts for matched records, candidates, distilled candidates, injected nodes, and outcomes
- **AND** the report includes raw per-scenario evidence and a baseline snapshot

#### Scenario: Repeated debug scenarios surface candidate and distillation activity
- **WHEN** the high-confidence scenario pack repeats the same `test_debug` or `build_debug` task family in the same repo scope
- **THEN** ExperienceEngine reports whether those runs created candidates, spawned distillation jobs, and injected resulting nodes

#### Scenario: Scenario pack captures classification hygiene
- **WHEN** the pack includes a repo-root sanity scenario that embeds shell commands inside inline code spans
- **THEN** ExperienceEngine reports the resulting task type without misclassifying it as a specialized debug family solely because of those inline commands
