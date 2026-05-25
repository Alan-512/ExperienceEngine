# experience-attribution-records Specification

## Purpose
Define durable per-node attribution evidence that explains whether delivered or record-only ExperienceEngine guidance helped, harmed, or remained unknown without replacing the existing feedback and lifecycle governance state machine.
## Requirements
### Requirement: Per-node attribution records are durable

ExperienceEngine SHALL store append-only attribution records that link an intervention outcome to an individual experience node without requiring full trace details to be persisted.

#### Scenario: Delivered injection writes one attribution record per node

- **WHEN** a task with delivered injected nodes is finalized
- **THEN** ExperienceEngine writes one attribution record for each selected delivered node
- **AND** each record includes `injection_id`, `node_id`, `intervention_strength`, `delivered=true`, outcome signal, attribution verdict, confidence, bounded evidence references or provenance summaries, and creation time
- **AND** missing or ambiguous evidence is represented as `unknown` rather than forced helped or harmed attribution
- **AND** the attribution record SHALL NOT require persisted full trace events to remain valid

#### Scenario: Suppressed injection can record unknown attribution

- **WHEN** an intervention was evaluated but not delivered
- **THEN** ExperienceEngine may write an attribution record with `delivered=false`
- **AND** the attribution verdict is `unknown` unless bounded evidence supports a different verdict

#### Scenario: Trace-backed attribution uses summaries by default

- **WHEN** runtime trace evidence helps determine adoption, violation, helped, harmed, or unknown attribution
- **THEN** ExperienceEngine may store bounded trace provenance, evidence categories, confidence, and reasoning summaries on the attribution record
- **AND** full trace event linkage is optional and only points to an explicit diagnostic snapshot when one exists

### Requirement: Attribution records do not rewrite feedback governance

ExperienceEngine SHALL add attribution evidence without changing the existing feedback counters, review events, or delivery-state transitions.

#### Scenario: Automatic attribution leaves existing feedback counters unchanged

- **WHEN** attribution records are written during task finalization
- **THEN** existing helped and harmed counters are not incremented by the attribution write itself
- **AND** existing lifecycle promotion, quarantine, retirement, and delivery-state transitions remain governed by the current feedback/state machine

#### Scenario: Manual feedback is represented as an override

- **WHEN** a user marks an intervention as `helped` or `harmed`
- **THEN** ExperienceEngine preserves the current manual feedback behavior
- **AND** attribution inspection can show that the attribution was overridden by manual feedback

### Requirement: Diagnostic candidate attribution remains record-only

ExperienceEngine SHALL record diagnostic candidate attribution without making record-only candidates look delivered.

#### Scenario: Record-only diagnostic match writes diagnostic attribution

- **WHEN** Phase 3 diagnostic candidate evaluation records `recordOnlyDiagnosticCandidateIds`
- **THEN** ExperienceEngine can write attribution records for those candidates with `delivered=false`
- **AND** the records indicate a diagnostic or record-only source/reason
- **AND** `injected_node_ids`, `session.injectedNodeIds`, usage counts, helped counts, harmed counts, and delivery state remain unchanged

### Requirement: Attribution is inspectable

ExperienceEngine SHALL expose attribution records through inspection surfaces without making default output noisy.

#### Scenario: Verbose inspection shows attribution records

- **WHEN** an operator runs verbose inspection for the latest task or injection
- **THEN** ExperienceEngine includes attribution records with verdict, confidence, delivered status, intervention strength, and evidence references
- **AND** non-verbose inspection remains concise and source-compatible unless it already includes attribution detail

