## ADDED Requirements

### Requirement: Trace capsules capture bounded host-neutral execution evidence

ExperienceEngine SHALL represent per-task host execution evidence as a bounded host-neutral trace capsule without replacing `ExperienceInput`.

#### Scenario: Trace capsule is created from host lifecycle evidence

- **WHEN** a supported host emits prompt, tool, file, verification, correction, or finalization evidence for a meaningful task
- **THEN** ExperienceEngine can normalize that evidence into a trace capsule with task metadata, normalized events, evidence refs, outcome metadata, and capture metadata
- **AND** the trace capsule remains upstream of `ExperienceInput`

#### Scenario: Trace capsule does not store hidden reasoning

- **WHEN** trace capture processes host payloads, transcripts, artifacts, or plugin events
- **THEN** ExperienceEngine SHALL only summarize user-visible prompts, user-visible assistant messages, tool inputs, tool outputs, final summaries, documented hook payloads, documented plugin events, and tool-visible artifacts
- **AND** it SHALL NOT persist hidden chain-of-thought, provider reasoning fields, internal model traces, or non-user-visible deliberation streams

### Requirement: Trace task separates user-origin constraints from EE-origin expectations

ExperienceEngine SHALL keep user-origin task requirements separate from ExperienceEngine-origin injected expectations.

#### Scenario: User constraints are captured without injected guidance contamination

- **WHEN** ExperienceEngine captures a trace task with both user instructions and delivered EE guidance
- **THEN** user-origin goal, constraints, non-goals, and acceptance signals are stored separately from injected expectations and delivered node ids
- **AND** injected expectations are used for adoption and attribution analysis rather than as proof of user intent

### Requirement: Host capability profiles are versioned and provenance-aware

ExperienceEngine SHALL describe host trace support through versioned capability profiles with observed provenance.

#### Scenario: Capability profile records provenance

- **WHEN** ExperienceEngine reports trace support for a host
- **THEN** the capability profile includes host, profile version, adapter version, capability names, capability states, provenance, transcript stability, and tool coverage
- **AND** each capability is classified as verified, documented, inferred, or disabled

#### Scenario: Doctor probe can override static capability assumptions

- **WHEN** a host doctor or validation probe observes trace capability behavior at runtime
- **THEN** ExperienceEngine treats the observed capability result as more authoritative than static adapter defaults
- **AND** inspection can show whether a capability is verified, documented, inferred, or disabled

### Requirement: Trace persistence is gated, bounded, and redacted

ExperienceEngine SHALL prevent trace capture from becoming an unbounded or unsafe local log store.

#### Scenario: Full trace persistence defaults to disabled or metadata-only

- **WHEN** trace capsule support is installed before host-specific validation is enabled
- **THEN** full event and evidence persistence is disabled by default or limited to metadata-only capture
- **AND** full trace persistence requires explicit configuration per host or scope

#### Scenario: Trace storage applies retention and redaction limits

- **WHEN** ExperienceEngine persists trace events or evidence refs
- **THEN** it applies configured event count, payload size, capsule size, retained capsule, and TTL limits
- **AND** secret-looking data is redacted or replaced by bounded summaries and hashes

### Requirement: Trace projection preserves legacy ExperienceInput compatibility

ExperienceEngine SHALL project trace capsules into the existing `ExperienceInput` contract without making trace data mandatory.

#### Scenario: Trace-backed task produces legacy-compatible input

- **WHEN** ExperienceEngine finalizes a task with a trace capsule
- **THEN** the projector creates an `ExperienceInput` using existing scope resolution, task-type resolution, context adaptation, tool-event normalization, and outcome behavior unless higher-confidence trace outcome evidence is explicitly enabled
- **AND** the resulting input can be persisted and consumed by existing learning, retrieval, attribution, and inspection paths

#### Scenario: Legacy records remain reusable without trace data

- **WHEN** ExperienceEngine reads an existing `experience_input_records` row that has no trace capsule id
- **THEN** the record remains valid for retrieval, learning history, inspection, feedback, and governance
- **AND** no backfill is required before the record can be reused

### Requirement: Host-specific trace data is isolated from reusable experience content

ExperienceEngine SHALL normalize host-specific evidence before it influences reusable experience nodes.

#### Scenario: Host-neutral experience is distilled from normalized evidence

- **WHEN** a trace-backed candidate is distilled into reusable guidance
- **THEN** host hook names, raw host payload shapes, and unstable transcript details are not copied into host-neutral experience text
- **AND** host-specific guidance is marked through host-local applicability or correction scope when it cannot be generalized

### Requirement: Trace inspection explains projection and evidence quality

ExperienceEngine SHALL expose trace completeness, projection, and evidence-quality diagnostics through operator inspection.

#### Scenario: Operator inspects trace projection

- **WHEN** an operator requests trace projection inspection for a capsule
- **THEN** ExperienceEngine shows the projected `ExperienceInput`, dropped or ignored events, redaction decisions, unstable evidence sources, completeness, and learning use or rejection reason
- **AND** projection inspection does not require scraping raw transcripts
