## 1. Configuration Boundary

- [ ] 1.1 Add configuration fields that explicitly separate runtime trace capture from diagnostic trace snapshot persistence.
- [ ] 1.2 Keep backward-compatible parsing or migration behavior for existing trace persistence flags where practical, including mapping `traceMetadataOnly` and old full-capture allowlists to diagnostic snapshot semantics.
- [ ] 1.3 Update config schema descriptions so operators understand capture-for-distillation is different from diagnostic persistence.
- [ ] 1.4 Add unit tests for default config, environment overrides, deprecated aliases, and host/scope diagnostic allowlists.

## 2. Runtime Trace Lifecycle

- [ ] 2.1 Refactor runtime finalization so a `TraceCapsule` can be built and used as transient in-memory evidence.
- [ ] 2.2 Ensure projection, attribution, learning eligibility, and candidate creation can consume transient trace evidence before it is discarded.
- [ ] 2.3 Persist the minimum trace provenance summary in normal mode: completeness, host/capability status, evidence category counts, redaction or dropped-event summary, source provenance, and learning use/rejection reason.
- [ ] 2.4 Persist new `trace_capsules` rows, full trace events, and evidence refs only when diagnostic snapshot persistence is explicitly enabled for the host or scope.
- [ ] 2.5 Add tests proving runtime trace evidence improves projection/distillation without writing `trace_capsules`, `trace_events`, or `trace_evidence_refs` rows in normal mode.

## 3. Storage And Compatibility

- [ ] 3.1 Decide and implement the summary storage shape using task/input summary fields or an equivalent summary table; do not use `trace_capsules` as the normal summary store.
- [ ] 3.2 Re-scope trace repositories so trace capsule/event/evidence writes represent diagnostic snapshots or legacy reads, not normal learning storage.
- [ ] 3.3 Preserve existing `trace_capsule_id` semantics for legacy rows and distinguish any new diagnostic snapshot id from normal summary-only records.
- [ ] 3.4 Keep existing trace capsule rows readable and inspectable.
- [ ] 3.5 Ensure records without trace metadata remain valid for retrieval, history, inspection, feedback, and governance.
- [ ] 3.6 Add cleanup coverage for diagnostic snapshots with TTL, event limits, and evidence limits.
- [ ] 3.7 Add tests for old persisted capsules, new summary-only records, normal-mode rows without capsule ids, and diagnostic snapshot records.

## 4. Candidate Distillation And Attribution

- [ ] 4.1 Update candidate creation so persisted candidates keep bounded source signals and provenance summaries, not full pre-distillation trace events.
- [ ] 4.2 Update distillation inputs so transient trace evidence can inform the candidate before finalization completes.
- [ ] 4.3 Update attribution record writing so trace-backed attribution stores bounded evidence categories, confidence, and provenance summaries.
- [ ] 4.4 Ensure attribution records remain valid when no diagnostic trace snapshot exists.
- [ ] 4.5 Add tests for accepted candidates, rejected candidates, unknown attribution, and diagnostic snapshot references.

## 5. Operator Surfaces

- [ ] 5.1 Update `ee inspect latest --verbose` and related task inspection to show trace summary/provenance without requiring full trace persistence.
- [ ] 5.2 Update `ee inspect review` to include trace provenance quality and learning use/rejection reasons without exposing full trace by default.
- [ ] 5.3 Keep `ee inspect --trace <id>` scoped to diagnostic snapshots and legacy capsules, and make summary-only trace inspection available through latest/verbose and review surfaces.
- [ ] 5.4 Update MCP/operator resources if they expose trace inspection or review data.
- [ ] 5.5 Add CLI/MCP tests for summary-only traces, missing diagnostic snapshots, and explicit diagnostic snapshots.

## 6. Documentation

- [ ] 6.1 Update `README.md`, `README.zh-CN.md`, and `docs/user-guide.md` to state that EE stores distilled experience, not raw agent execution recordings.
- [ ] 6.2 Document the new trace capture versus diagnostic persistence configuration model.
- [ ] 6.3 Document how operators can temporarily enable diagnostic snapshots for host adapter validation or debugging.
- [ ] 6.4 Update or supersede trace capsule development docs so future implementation follows the corrected data boundary.

## 7. Validation

- [ ] 7.1 Run focused tests for config, runtime trace lifecycle, storage compatibility, candidate distillation, attribution, and inspection.
- [ ] 7.2 Run broad regression validation with typecheck, unit tests, and build.
- [ ] 7.3 Validate at least one fixture-backed or real-host trace path in normal summary-only mode.
- [ ] 7.4 Validate one explicit diagnostic snapshot path and confirm cleanup/inspection behavior.
- [ ] 7.5 Confirm OpenSpec validation passes before implementation is marked complete.
