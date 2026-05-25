## Context

`add-host-trace-capsules` added a host-neutral trace model, adapters, persistence tables, projection, and inspection. That implementation gives EE enough structure to use richer host execution evidence, but it also introduced a persistent evidence layer that can retain pre-distillation trace data.

The corrected product boundary is documented in `docs/internal/trace-data-boundary-redesign.md`: EE should read trace data broadly, use it during distillation, and persist only distilled experience plus minimal provenance by default. Persisted trace capsule rows, full trace event rows, and evidence ref rows should be explicit diagnostic snapshots, not normal learning storage.

This change supersedes the default persistence semantics from `add-host-trace-capsules`. The existing trace model, adapters, projector, and repositories remain useful, but newly finalized normal tasks should not create long-lived `trace_capsules` records unless diagnostic snapshot persistence is enabled.

## Goals / Non-Goals

**Goals:**

- Separate runtime trace capture from persistent trace snapshots.
- Keep rich trace evidence available to projection, attribution, and candidate distillation during finalization.
- Persist minimal trace provenance in normal operation.
- Make persisted trace capsule rows, full trace event rows, and evidence ref rows diagnostic-only, explicit, bounded, redacted, and cleanable.
- Preserve existing trace-linked records and legacy records.
- Keep operator inspection useful without exposing full task evidence by default.

**Non-Goals:**

- Do not remove the `TraceCapsule` domain model.
- Do not remove trace tables immediately if they are needed for debug snapshots or compatibility.
- Do not weaken redaction, retention, or event/evidence bounds.
- Do not store hidden reasoning, chain-of-thought, or raw host payloads.
- Do not require historical backfill.

## Decisions

### Decision: TraceCapsule becomes runtime-first

`TraceCapsule` remains the normalized host-neutral evidence model, but its primary role becomes transient runtime input. Runtime finalization can build a capsule, project it into `ExperienceInput`, run attribution and distillation, and then discard full event details unless diagnostic persistence is enabled.

Alternative considered: remove trace capsules and let each host adapter feed distillation directly. This was rejected because it would duplicate host-specific logic and weaken compatibility with the existing projector and tests.

### Decision: Persist a minimum provenance summary in normal mode

Normal task finalization persists a bounded trace provenance summary directly on finalized task/input records or through an equivalent summary record. The minimum summary includes trace completeness, host and capability status, evidence category counts, redaction or dropped-event summary, source provenance, learning use or rejection reason, and an optional diagnostic snapshot id. These summaries are enough to explain confidence and inspect decisions without storing full pre-distillation evidence.

Alternative considered: persist only distilled experience with no trace summary. This was rejected because operators still need to understand why trace-backed learning was accepted, downgraded, or rejected.

Alternative considered: keep writing metadata-only `trace_capsules` rows in normal mode. This was rejected because capsule metadata can still contain pre-distillation task evidence and keeps the data model centered on long-lived trace records.

### Decision: Full trace persistence is renamed and re-scoped as diagnostic snapshots

Existing full trace persistence controls should be renamed or clarified so they do not imply normal learning storage. Diagnostic snapshot persistence requires explicit host or scope allowlisting and remains subject to TTL, event limits, evidence limits, redaction, and cleanup.

Backward-compatible config parsing should map old settings into the new model. `traceMetadataOnly=true` means diagnostic snapshots are disabled. `traceMetadataOnly=false` only enables diagnostic snapshots when paired with the old host/scope full-capture allowlists, and it should be treated as deprecated terminology.

Alternative considered: keep current `traceMetadataOnly` semantics. This was rejected because it keeps the product model centered on persisted capsules rather than runtime capture plus optional diagnostics.

### Decision: Inspect defaults to summary/provenance

Operator review and latest/verbose inspection should show trace availability, completeness, capability, provenance, and learning decisions. `ee inspect --trace <id>` remains a diagnostic snapshot or legacy capsule inspection command. It should show full event details only when a diagnostic snapshot or legacy capsule exists. Summary-only traces are inspected through latest/verbose and review surfaces, not by overloading `--trace` with task run ids.

Alternative considered: always store enough trace data for `ee inspect --trace` to work. This was rejected because normal inspection should not require retaining pre-distillation evidence.

### Decision: Compatibility remains tolerant

Already persisted trace capsules remain readable and inspectable as legacy diagnostic-like records. Existing records without trace metadata remain valid. Retrieval, learning history, feedback, and governance must not require persisted trace capsules or persisted trace events.

## Risks / Trade-offs

- Loss of post-hoc replay for normal tasks -> keep minimum provenance summaries and allow explicit diagnostic snapshots when replay/debugging is needed.
- Distillation bugs become harder to diagnose without full trace -> keep debug snapshot mode and fixture-backed tests for transient trace use.
- Configuration migration can confuse operators -> document the distinction between runtime capture and diagnostic persistence, and keep backward-compatible aliases where practical.
- Existing tests may assume persisted trace events -> update tests to assert transient trace use and normal non-persistence separately from diagnostic snapshot persistence.

## Migration Plan

1. Add or rename config fields so capture and diagnostic persistence are distinct.
2. Keep old config fields as aliases or deprecated compatibility inputs where practical.
3. Change runtime finalization so new `trace_capsules`, full events, and evidence refs are only written for diagnostic snapshots.
4. Persist minimum provenance summaries for normal finalized tasks.
5. Update inspection to prefer summary/provenance and gracefully handle missing full snapshots.
6. Keep existing trace capsule rows readable.
7. Update docs and tests.

Rollback is straightforward: diagnostic persistence can be disabled without affecting distilled experience, because learning must not depend on persisted trace events.

## Resolved Implementation Choices

- Store minimum provenance summaries on finalized task/input records or an equivalent summary record; do not use `trace_capsules` as the normal summary store.
- Keep `traceMetadataOnly` and old full-capture allowlists as deprecated compatibility inputs when practical, mapped into diagnostic snapshot persistence semantics.
- Keep `ee inspect --trace <id>` scoped to diagnostic snapshots and legacy capsules; use latest/verbose and review surfaces for summary-only traces.
