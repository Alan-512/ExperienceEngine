## ADDED Requirements

### Requirement: Diagnostic candidates can be evaluated without prompt delivery

ExperienceEngine SHALL support record-only diagnostic evaluation for same-scope candidate nodes that are not normally live injectable.

#### Scenario: Same-scope shadow candidate is recorded but not delivered

- **WHEN** a same-scope candidate node has `DeliveryState=shadow_only`
- **AND** it matches the current task strongly enough for diagnostic evaluation
- **THEN** ExperienceEngine records the candidate in a named decision diagnostics or scorecard metadata field such as `recordOnlyDiagnosticCandidateIds`
- **AND** it does not add the node id to the delivered `injected_node_ids`
- **AND** it does not add prompt text for that candidate during record-only evaluation
- **AND** the durable event remains `mode=skip`, `delivered=false`, and `injected_node_ids=[]`

#### Scenario: Cross-scope shadow candidate is not diagnostic-live eligible

- **WHEN** a shadow candidate belongs to a different scope
- **THEN** ExperienceEngine does not deliver it as a live diagnostic hint
- **AND** it keeps the candidate out of prompt text

### Requirement: Live diagnostic hints are strictly gated

ExperienceEngine SHALL deliver a candidate as a live diagnostic hint only when it passes same-scope, diagnostic-safe, strong-trigger conditions.

#### Scenario: Strong same-scope candidate can produce one diagnostic hint

- **WHEN** a candidate is same-scope, same task family, high match band, has no negative evidence, has no harm history, contains no destructive or irreversible action guidance, and clears score and margin thresholds
- **THEN** ExperienceEngine may deliver it with `InjectionMode=inject_conservative`
- **AND** the intervention strength is `diagnostic_hint`
- **AND** at most one candidate node is delivered in the prompt

#### Scenario: Weak or risky candidate remains shadow-only

- **WHEN** a candidate has weak match, negative evidence, harm history, destructive or irreversible action guidance, cross-scope origin, retired state, or quarantined delivery state
- **THEN** ExperienceEngine does not deliver it as prompt text
- **AND** it does not mutate the candidate into an active node

#### Scenario: Diagnostic hint delivery does not promote lifecycle state

- **WHEN** ExperienceEngine delivers a candidate as a diagnostic hint
- **THEN** the candidate remains in its existing lifecycle state
- **AND** promotion still requires existing helped/support/validation governance
- **AND** diagnostic delivery does not mutate `usage_count`, helped count, harmed count, `delivery_state`, or promotion metadata
