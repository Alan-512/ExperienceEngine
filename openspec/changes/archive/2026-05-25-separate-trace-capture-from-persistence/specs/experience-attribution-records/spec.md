## MODIFIED Requirements

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
