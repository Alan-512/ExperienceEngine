## Context

ExperienceEngine now records richer intervention evidence through attribution records, episode projection, and repo policy inspection. That makes it possible to report quality issues in the experience library without changing delivery behavior.

This change adds a read-only hygiene review surface. It is deliberately not a cleanup job: it should help operators decide what to inspect or fix, but it must not mutate node lifecycle, candidates, attribution, review events, or repo policy.

## Goals / Non-Goals

**Goals:**

- Detect stale, duplicate, conflicting, over-generalized, and evidence-drifted experience.
- Return structured findings with severity, affected ids, evidence, and recommendation text.
- Expose findings through interaction and CLI inspection surfaces.
- Keep recommendations reviewable and non-mutating.

**Non-Goals:**

- Automatically delete, merge, retire, quarantine, promote, or rewrite experience.
- Add background hygiene jobs.
- Add export drafts or instruction-file patches.
- Add team/org review workflows.
- Change intervention selection, repo policy thresholds, attribution, or lifecycle state machines.

## Decisions

### 1. Use a pure hygiene analyzer

Create `src/maintenance/experience-hygiene.ts` as a pure analyzer over existing nodes, candidates, attribution records, injections, and repo summaries.

Rationale:

- Keeps hygiene review testable without requiring runtime sessions.
- Reduces risk of accidental state machine changes.

### 2. Findings are recommendations, not actions

Each finding should include a stable type, severity, affected ids, evidence summary, and recommended operator action. It should not include executable mutation payloads.

Rationale:

- Phase 7 is about making governance reviewable, not automating cleanup.

### 3. Conservative heuristics first

The first pass should use deterministic heuristics:

- Stale: unused active/cooling guidance older than a configurable age or with no recent successful attribution.
- Duplicate: highly similar trigger/hint text in the same scope/task family.
- Conflict: guidance with opposing recommendations or avoid/recommended overlap in the same scope/task family.
- Over-generalized: broad trigger/hint text with low support, high harmed ratio, or cross-family usage evidence.
- Evidence drift: nodes whose attribution or episode evidence no longer supports current delivery state.

Rationale:

- Deterministic findings are easier to inspect, test, and tune than model-authored cleanup suggestions.

### 4. CLI starts as inspect, not a new console app

Expose the first surface as an inspect/report command, such as `ee inspect hygiene`, backed by the interaction service.

Rationale:

- This matches the repo policy console slice and avoids prematurely committing to a richer console UI.

## Risks / Trade-offs

- [False positives from simple heuristics] -> Label findings with severity and evidence; do not mutate automatically.
- [Hygiene output becomes too noisy] -> Support scope/type filters and cap default output.
- [Duplicate detection becomes expensive] -> Start with lexical normalization and same-scope/task-family comparisons only.
- [Recommendations imply automatic authority] -> Phrase output as review recommendations and require explicit separate control commands for any future mutation.

