## ADDED Requirements

### Requirement: Custom-origin shadow cap overrides existing live diagnostic paths

ExperienceEngine SHALL keep every node whose semantic-origin provenance contains an unbenchmarked custom generation in record-only `shadow_only` for the full lifetime of `custom-shadow-only-v1`.

#### Scenario: Custom-origin node matches a strong same-scope diagnostic trigger

- **WHEN** a custom-origin node would otherwise satisfy the existing strong same-scope candidate diagnostic-hint conditions
- **THEN** ExperienceEngine MAY record the match and decision evidence for shadow evaluation
- **AND** it SHALL NOT add that node's semantic guidance to prompt text

#### Scenario: Custom-origin node gains positive governance evidence

- **WHEN** the node accumulates repeated helpful outcomes, governance maturity, confidence, manual promotion, or same-scope applicability evidence
- **THEN** it SHALL remain `shadow_only`
- **AND** it SHALL NOT enter conservative, diagnostic-live, or normal eligible delivery

#### Scenario: Evaluated-origin node uses existing governance

- **WHEN** a node's complete semantic provenance contains only benchmark-backed supported or recommended origins
- **THEN** existing intervention-governance and diagnostic-delivery requirements MAY continue to apply
- **AND** this custom-origin cap SHALL NOT silently broaden or remove those evaluated-origin paths
