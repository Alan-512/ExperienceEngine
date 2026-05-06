## ADDED Requirements

### Requirement: Policy enrichment exposes structured components

ExperienceEngine SHALL expose policy enrichment as structured governance evidence in addition to existing flat reason strings.

#### Scenario: Policy components preserve score compatibility

- **WHEN** ExperienceEngine enriches a candidate with policy evidence
- **THEN** it returns structured policy components with stable names, categories, signed values, and concise reasons
- **AND** the sum of component values equals the policy adjustment used for candidate scoring
- **AND** existing `policyAdjustment`, `policyScore`, and flat `policyReasons` remain available

#### Scenario: Policy evidence remains separate from retrieval similarity

- **WHEN** a candidate receives lexical or semantic retrieval evidence
- **THEN** policy components classify governance evidence separately from retrieval similarity
- **AND** retrieval-context signals such as host, tools, failure signature, read-only intent, module paths, or correction intent remain soft evidence unless another spec defines hard-filter semantics

#### Scenario: Policy explainability does not retune behavior

- **WHEN** structured policy components are added
- **THEN** candidate order, final injection mode, selected node ids, intervention strength, and prompt text remain unchanged for representative existing cases
- **AND** any inspect output changes are additive
