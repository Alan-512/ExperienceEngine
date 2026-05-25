## Why

The host trace capsule implementation can read richer execution evidence, but its current persistence model risks turning pre-distillation trace data into long-lived EE memory. ExperienceEngine should use rich trace data to improve distillation while keeping the persistent experience store focused on distilled experience, attribution, governance, and minimal provenance.

## What Changes

- Separate runtime trace capture from trace persistence.
- Treat `TraceCapsule` as a transient runtime input by default, used for projection, attribution, and candidate distillation.
- Persist only minimal trace provenance summaries in normal operation, such as completeness, host capability summary, evidence counts, redaction summary, and learning use/rejection reason.
- Re-scope persisted trace capsule rows, full trace events, and evidence refs as explicit diagnostic/debug snapshots with host/scope allowlists, retention limits, redaction, and cleanup.
- Adjust operator inspection so normal trace views explain distillation evidence and provenance, while full trace inspection is available only when a debug snapshot exists.
- Preserve compatibility for existing records and any already-persisted trace capsules.
- Update public documentation to make clear that EE stores distilled experience, not raw agent execution recordings.
- Supersede the persistence semantics from `add-host-trace-capsules`: that change remains the capability foundation, but this change replaces its default persisted-capsule model with transient capture plus optional diagnostic snapshots.

## Capabilities

### New Capabilities

- `trace-data-boundary`: Defines the boundary between runtime trace capture, transient distillation input, minimal persistent provenance, and optional diagnostic trace snapshots.

### Modified Capabilities

- `experience-candidate-distillation`: Distillation may use rich transient trace evidence but must not require full trace events to be persisted.
- `experience-attribution-records`: Attribution records may reference minimal provenance summaries or optional debug snapshots without depending on persisted full trace events.
- `operator-review-flow`: Operator review must show trace summary/provenance by default and only expose full trace details when diagnostic persistence was explicitly enabled.

### Superseded Active-Change Semantics

- `add-host-trace-capsules` / `host-trace-capsules`: Default trace capsule persistence is superseded by runtime-first trace capture. New tasks SHALL NOT persist new `trace_capsules` rows, `trace_events` rows, or `trace_evidence_refs` rows in normal mode; those tables are retained for legacy reads and explicit diagnostic snapshots.

## Impact

- Runtime trace finalization and `ExperienceInput` projection paths.
- Trace capture configuration names and semantics.
- SQLite trace table usage and cleanup behavior.
- `task_runs` and `experience_input_records` trace summary/provenance fields.
- `ee inspect` trace and review output.
- Unit tests for runtime trace capture, persistence boundaries, distillation, attribution, and inspection.
- README, README.zh-CN, and user guide wording for trace capture and privacy boundaries.
