# Trace Data Boundary Redesign

Status: proposed
Date: 2026-05-25
Related change: `add-host-trace-capsules`

## Purpose

This document corrects the product boundary for host trace capture.

ExperienceEngine should read as much useful host trace data as each host can safely provide, because richer trace data improves attribution and experience distillation. However, pre-distillation trace data should not become part of the long-lived experience store by default.

The long-lived EE database should primarily store distilled experience, attribution, governance state, and minimal provenance summaries.

## Problem

The current host trace capsule implementation introduced a persistent evidence layer:

```text
host trace -> persisted trace capsule -> projection -> distillation -> persisted experience
```

This is useful for diagnostics, replay, and implementation verification, but it blurs an important product boundary:

- trace data is raw or near-raw task evidence
- experience data is distilled, reusable knowledge

If EE persists full pre-distillation trace data by default, EE can start behaving like an agent execution recorder instead of an experience governance layer.

## Product Principle

The corrected boundary is:

```text
Read wide. Distill carefully. Persist narrow.
```

In practical terms:

- EE should attempt to read the best available trace data from each supported host.
- Trace data should be normalized and used as runtime evidence for projection, attribution, and distillation.
- The normal persistent output should be distilled experience and minimal provenance, not full trace events.
- Full trace persistence is a diagnostic feature, not the default learning path.

## Target Data Flow

Normal path:

```text
host trace stream
  -> transient trace capsule
  -> projection / attribution / distillation
  -> distilled experience + governance + minimal provenance
  -> SQLite
```

Diagnostic path:

```text
host trace stream
  -> transient trace capsule
  -> optional debug trace snapshot
  -> short TTL / explicit cleanup / operator inspection
```

## Persistence Rules

Default persistent data:

- distilled experience node text
- candidate and attribution metadata
- confidence, quality, scope, and governance state
- trace completeness score
- host capability/profile summary
- source provenance summary
- evidence counts and bounded redaction summary
- learning use or rejection reason

Default non-persistent data:

- full normalized trace event lists
- raw or near-raw tool output
- prompt or transcript contents
- detailed artifact contents
- hidden reasoning or chain-of-thought
- host-specific raw payloads

Diagnostic-only persistent data:

- diagnostic trace capsule rows
- bounded normalized trace events
- bounded evidence refs
- projection diagnostics
- dropped event summaries
- redaction decisions

Diagnostic persistence must require explicit opt-in and should remain bounded by event limits, evidence limits, redaction, TTL, and cleanup.

## Implementation Direction

The existing `TraceCapsule` model should not be removed. It should be re-scoped:

- Primary role: transient runtime input for projection and distillation.
- Secondary role: optional diagnostic snapshot for operator debugging.
- Not its normal role: long-lived evidence store for every task.

The current trace tables can remain, but their product meaning should change:

- normal learning should not depend on persisted trace capsules or trace events
- new `trace_capsules`, `trace_events`, and `trace_evidence_refs` rows should be written only when diagnostic snapshot persistence is explicitly enabled
- summary fields may still be attached to `task_runs` and `experience_input_records`, or stored in an equivalent bounded summary record
- legacy persisted capsules should remain inspectable but should not be required for retrieval or learning

## Configuration Direction

Recommended configuration semantics:

- `traceCaptureEnabled`: allow runtime trace collection for distillation
- `tracePersistDiagnosticSnapshots`: explicitly persist diagnostic trace snapshots
- `traceDiagnosticSnapshotHosts`: host allowlist for diagnostic snapshot persistence
- `traceDiagnosticSnapshotScopes`: scope allowlist for diagnostic snapshot persistence
- `traceRetentionDays`, `traceMaxEvents`, and `traceMaxEvidenceRefs`: apply only to diagnostic snapshots

The key distinction is:

- capture for distillation can be broadly enabled
- persistence of trace capsule rows and full trace details must be explicitly diagnostic

Deprecated compatibility mapping:

- `traceMetadataOnly=true`: diagnostic snapshot persistence disabled
- `traceMetadataOnly=false` plus old full-capture host/scope allowlists: diagnostic snapshot persistence enabled for the same allowlisted hosts/scopes
- `traceFullCaptureHosts`: compatibility alias for `traceDiagnosticSnapshotHosts`
- `traceFullCaptureScopes`: compatibility alias for `traceDiagnosticSnapshotScopes`

## Operator Surface Direction

Inspection should prefer distilled and summary views:

- show whether trace evidence was available
- show completeness and host capability status
- show why a candidate was accepted, rejected, downgraded, or scoped locally
- show what category of evidence was used without exposing full task evidence by default

`ee inspect --trace <id>` should be available only when a diagnostic snapshot or legacy capsule exists. Summary-only traces should be inspected through latest/verbose and review surfaces, which explain that the trace was used transiently and only summary/provenance was retained.

## Compatibility

Existing data remains valid:

- records without trace metadata continue to work
- records with trace capsule ids remain inspectable
- existing experience nodes do not need backfill
- retrieval must not require persisted trace data

The schema can keep nullable trace linkage fields, but code should treat them as optional diagnostic/provenance links, not as mandatory learning inputs.

## Implementation Phases

1. Update the OpenSpec to capture this corrected product boundary.
2. Rename or clarify configuration so runtime capture and diagnostic persistence are separate.
3. Change runtime finalization so full trace events are not persisted by default.
4. Keep minimal provenance summaries on finalized records.
5. Adjust inspection output to prefer summary/provenance and explain when full trace was not retained.
6. Keep debug trace snapshot support behind explicit host/scope configuration.
7. Add tests proving that experience distillation can use rich transient trace data without persisting full pre-distillation trace events.
8. Update public docs so users understand that EE stores distilled experience, not agent execution recordings.

## Success Criteria

The redesign is successful when:

- EE can still use ideal host trace data during a task.
- Full pre-distillation trace events are not persisted in normal mode.
- Distilled experience quality does not regress.
- Operators can still debug trace capture when they explicitly enable diagnostic snapshots.
- Existing trace-linked records remain readable.
- Public documentation clearly states that ExperienceEngine is not a raw transcript or execution recording system.
