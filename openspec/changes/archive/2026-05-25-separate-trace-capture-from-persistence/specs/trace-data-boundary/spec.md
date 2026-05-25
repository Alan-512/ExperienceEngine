## ADDED Requirements

### Requirement: Runtime trace capture is separate from trace persistence
ExperienceEngine SHALL separate host trace data capture for distillation from persistence of full trace details.

#### Scenario: Trace evidence is used transiently during task finalization
- **WHEN** a supported host provides prompt, tool, correction, verification, artifact, transcript metadata, or finalization evidence for a task
- **THEN** ExperienceEngine can normalize that evidence into a runtime trace capsule
- **AND** it can use the capsule for projection, attribution, and distillation without persisting a new `trace_capsules` row, full trace events, or evidence refs by default

#### Scenario: Runtime capture does not imply full trace storage
- **WHEN** trace capture is enabled for a host or scope
- **THEN** ExperienceEngine SHALL NOT persist a new trace capsule row, full normalized trace events, or evidence refs unless diagnostic snapshot persistence is explicitly enabled
- **AND** the absence of persisted trace capsule rows and full trace events SHALL NOT prevent learning, retrieval, attribution, or governance from using the finalized task

### Requirement: Normal persistence stores minimal trace provenance
ExperienceEngine SHALL persist only minimal trace provenance summaries during normal trace-backed learning.

#### Scenario: Trace-backed task finalizes in normal mode
- **WHEN** a task finalizes with runtime trace evidence and diagnostic snapshot persistence is not enabled
- **THEN** ExperienceEngine persists distilled experience data and bounded provenance summaries
- **AND** the summaries include trace completeness, host and capability status, evidence category counts, redaction or dropped-event summary, source provenance, and learning use or rejection reason
- **AND** the summaries SHALL NOT include full prompt, transcript, tool output, artifact content, hidden reasoning, chain-of-thought, or raw host payloads

#### Scenario: Normal provenance explains downgraded learning
- **WHEN** runtime trace evidence is incomplete, unstable, redacted, or insufficient for high-confidence learning
- **THEN** ExperienceEngine records a bounded reason that explains the learning downgrade or rejection
- **AND** it does not need to retain full pre-distillation trace events to explain that decision

### Requirement: Full trace persistence is diagnostic-only
ExperienceEngine SHALL persist full trace details only as explicitly enabled diagnostic snapshots.

#### Scenario: Diagnostic snapshot persistence is enabled
- **WHEN** an operator explicitly enables diagnostic snapshot persistence for a host or scope
- **THEN** ExperienceEngine may persist a trace capsule row, bounded normalized trace events, bounded evidence refs, projection diagnostics, dropped event summaries, and redaction decisions
- **AND** the diagnostic snapshot is subject to configured redaction, event limits, evidence limits, retention, and cleanup

#### Scenario: Diagnostic snapshot persistence is disabled
- **WHEN** diagnostic snapshot persistence is disabled for the host and scope
- **THEN** ExperienceEngine SHALL NOT write a new trace capsule row, full trace event rows, or full evidence ref rows for the finalized task
- **AND** operator inspection can still show the persisted trace summary/provenance

### Requirement: Trace data boundaries remain compatible
ExperienceEngine SHALL preserve compatibility for legacy records and existing trace-linked records.

#### Scenario: Existing trace capsule rows remain readable
- **WHEN** ExperienceEngine reads a record that references an already-persisted trace capsule
- **THEN** it can inspect the existing capsule according to bounded diagnostic inspection rules
- **AND** it does not require that future tasks persist equivalent full trace details

#### Scenario: Records without trace data remain reusable
- **WHEN** ExperienceEngine reads a task run, input record, candidate, attribution record, or experience node without trace provenance
- **THEN** the record remains valid for retrieval, learning history, inspection, feedback, and governance
- **AND** no backfill is required
