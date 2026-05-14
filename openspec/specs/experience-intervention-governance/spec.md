# experience-intervention-governance Specification

## Purpose
Define ExperienceEngine's live intervention governance contract across delivery-state gating, intervention strength, renderer policy, diagnostic candidate delivery, and regression coverage for current host-facing behavior.
## Requirements
### Requirement: Current intervention governance behavior is frozen before semantic refactors

ExperienceEngine SHALL have regression coverage for current delivery gating, injection decisions, scorecard persistence, and host-facing summaries before adding prompt-strength semantics.

#### Scenario: Delivery-state mapping remains stable

- **WHEN** ExperienceEngine evaluates active, priority candidate, candidate, cooling, retired, and quarantined nodes in the current implementation
- **THEN** golden tests record the current mapping from node state and `delivery_state` to live eligibility
- **AND** the tests cover `shadow_only`, `conservative_only`, `eligible`, and `quarantined` delivery states

#### Scenario: Injection modes remain stable

- **WHEN** the current controller evaluates known active and conservative candidate cases
- **THEN** golden tests assert the resulting `InjectionMode`
- **AND** the selected node ids and conservative hint caps remain unchanged

#### Scenario: Evaluation modes remain stable

- **WHEN** the runtime runs in `live`, `shadow`, and `holdout` evaluation modes
- **THEN** golden tests assert the delivered flag, prompt text presence, injected node ids, and scorecard persistence behavior for each mode

#### Scenario: Existing scorecard fields remain stable

- **WHEN** ExperienceEngine persists an injection event under current behavior
- **THEN** golden tests assert existing scorecard fields such as mode, risk level, confidence, decision reason, selected candidate ids, and rejected candidates where applicable
- **AND** the tests do not require new fields introduced by later phases

#### Scenario: Host-facing summaries remain stable

- **WHEN** CLI, interaction, or Codex MCP surfaces summarize current scorecard decisions
- **THEN** golden tests assert the current summary shape and key wording
- **AND** later renderer policy changes must update those expectations intentionally

### Requirement: Intervention strength is distinct from delivery and evaluation state

ExperienceEngine SHALL model prompt guidance strength separately from node delivery eligibility, run-level evaluation mode, and controller injection action.

#### Scenario: Strength is not added to DeliveryState

- **WHEN** ExperienceEngine defines prompt-strength values such as `diagnostic_hint`
- **THEN** those values are represented by `InterventionStrength`
- **AND** `DeliveryState` remains limited to delivery eligibility values such as `shadow_only`, `conservative_only`, `eligible`, and `quarantined`

#### Scenario: Scorecard records intervention strength

- **WHEN** ExperienceEngine selects an intervention with mode `inject` or `inject_conservative`
- **THEN** the persisted injection scorecard includes the derived intervention strength
- **AND** existing scorecard fields such as mode, risk level, confidence, and selected node ids remain available

#### Scenario: Adding strength does not change live delivery

- **WHEN** the same node set, input, config, and evaluation mode are evaluated before and after this change
- **THEN** the resulting `InjectionMode`, delivered flag, and injected node ids remain unchanged
- **AND** only the diagnostics and scorecard gain strength metadata

### Requirement: Initial strength derivation is conservative

ExperienceEngine SHALL derive intervention strength from existing mode, node maturity, validation, and explicit user-confirmed correction signals without widening candidate delivery.

#### Scenario: Conservative candidate-like guidance remains conservative

- **WHEN** a selected node is delivered through `inject_conservative`
- **THEN** ExperienceEngine derives `diagnostic_hint` or `soft_recommendation`
- **AND** it does not upgrade the controller mode to normal `inject`

#### Scenario: Mature validated guidance can be strong

- **WHEN** a selected active node has reuse validation or enough helped evidence
- **THEN** ExperienceEngine may derive `strong_recommendation`
- **AND** it keeps the existing eligibility and evaluation gates in force

#### Scenario: Hard constraints require explicit support

- **WHEN** ExperienceEngine derives `hard_constraint`
- **THEN** the selected guidance is based on explicit user-confirmed correction or highly validated rule evidence
- **AND** ordinary candidates are not treated as hard constraints

### Requirement: Prompt rendering reflects intervention strength

ExperienceEngine SHALL render delivered guidance with language that communicates the intended strength of the intervention.

#### Scenario: Diagnostic hints are rendered as diagnostic leads

- **WHEN** an intervention has strength `diagnostic_hint`
- **THEN** the injected prompt text labels it as a low-confidence diagnostic hint
- **AND** instructs the agent to verify whether the same signal exists before acting
- **AND** states that the hint is not a required fix

#### Scenario: Soft recommendations are rendered as relevant prior experience

- **WHEN** an intervention has strength `soft_recommendation`
- **THEN** the injected prompt text labels it as relevant prior experience
- **AND** frames the guidance as something to check before making unrelated changes

#### Scenario: Strong recommendations are rendered as validated prior experience

- **WHEN** an intervention has strength `strong_recommendation`
- **THEN** the injected prompt text labels it as validated prior experience
- **AND** tells the agent to follow it unless current evidence contradicts it

#### Scenario: Hard constraints are rendered as constraints

- **WHEN** an intervention has strength `hard_constraint`
- **THEN** the injected prompt text labels it as a project constraint or explicit instruction
- **AND** tells the agent not to violate it without explicit user approval

### Requirement: Policy-aware rendering remains compact

ExperienceEngine SHALL keep injected policy-aware guidance compact enough for prompt-time use.

#### Scenario: Full scorecard is not dumped into prompt text

- **WHEN** ExperienceEngine renders an intervention with scorecard metadata
- **THEN** the prompt text includes only compact usage semantics and selected node guidance
- **AND** it does not include full runner-up diagnostics or the full scorecard JSON

#### Scenario: Older call sites remain compatible

- **WHEN** a call site renders injection text without an intervention strength
- **THEN** ExperienceEngine falls back to the existing generic injected-hints behavior
- **AND** it does not throw or suppress otherwise valid guidance

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

### Requirement: Routine injection defaults to one compact hint

ExperienceEngine SHALL inject at most one compact hint during routine prompt-time intervention unless a documented strong-candidate path explicitly permits more.

#### Scenario: Ordinary eligible match

- **WHEN** a routine task has one or more ordinary eligible matching nodes
- **THEN** ExperienceEngine SHALL inject no more than one compact hint by default

### Requirement: Raw history is never injected

ExperienceEngine SHALL NOT inject raw task records, raw tool histories, or raw learning candidates into a host prompt.

#### Scenario: Candidate exists but is not a mature node

- **WHEN** retrieval or learning diagnostics include a candidate that has not become an injectable experience node
- **THEN** ExperienceEngine SHALL NOT inject that candidate into the prompt

### Requirement: Conservative injection remains compact

ExperienceEngine SHALL render conservative injections as compact hints without expanded structured guidance.

#### Scenario: Conservative delivery selected

- **WHEN** intervention mode is conservative
- **THEN** the injected prompt content SHALL omit expanded Goal, Steps, Avoid, and raw evidence details

### Requirement: Expanded guidance is gated by maturity

ExperienceEngine SHALL render expanded structured guidance only when node maturity and delivery confidence allow it.

#### Scenario: Mature high-confidence node

- **WHEN** a node is mature, delivery-eligible, and selected through a high-confidence path
- **THEN** ExperienceEngine MAY render bounded Goal, Avoid, or Success Signal fields according to injection policy

### Requirement: No-injection decisions expose structured reasons

ExperienceEngine SHALL produce a structured skip reason when an intervention decision does not inject guidance.

#### Scenario: No candidate exists

- **WHEN** no relevant experience candidate is available for a task
- **THEN** ExperienceEngine SHALL expose a skip reason indicating that no candidate was available

#### Scenario: Candidate is not mature enough

- **WHEN** a similar candidate exists but delivery or lifecycle state prevents injection
- **THEN** ExperienceEngine SHALL expose a skip reason indicating that the candidate is not mature enough or is not eligible for delivery

#### Scenario: Policy rejects injection

- **WHEN** retrieval finds a semantically similar candidate but policy rejects it
- **THEN** ExperienceEngine SHALL expose a skip reason indicating policy rejection

### Requirement: Skip explanations do not pollute routine prompts

ExperienceEngine SHALL keep no-injection explanations out of normal prompt injection unless a user or agent explicitly asks for an explanation.

#### Scenario: Routine task has no injection

- **WHEN** ExperienceEngine skips injection during routine prompt-time lookup
- **THEN** it SHALL NOT add a verbose no-injection explanation to the task prompt by default

