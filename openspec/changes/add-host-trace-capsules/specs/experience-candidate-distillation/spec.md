## ADDED Requirements

### Requirement: Trace-backed candidates preserve provenance without leaking host payloads

ExperienceEngine SHALL carry trace provenance through candidate creation and distillation while keeping reusable node content host-neutral unless explicitly host-local.

#### Scenario: Candidate stores trace provenance

- **WHEN** ExperienceEngine creates an experience candidate from a trace-backed task
- **THEN** the candidate source signal includes trace completeness and source provenance metadata
- **AND** the candidate can reference the originating trace capsule without copying raw host payloads into candidate text

#### Scenario: Distilled node avoids host-specific leakage

- **WHEN** ExperienceEngine distills a trace-backed candidate into an experience node
- **THEN** the distilled hint, trigger pattern, and evidence summary are based on normalized task evidence
- **AND** host hook names, raw payload shapes, and unstable transcript details are excluded unless the candidate is explicitly host-local
