# experience-retrieval-policy Specification

## Purpose
Define ExperienceEngine's staged retrieval-policy contract, keeping retrieval evidence separate from governance authority while supporting lexical-first recall, semantic rerank/backfill, and inspectable diagnostics.
## Requirements
### Requirement: Retrieval policy uses an explicit staged contract

ExperienceEngine SHALL define retrieval and policy decision flow as explicit stages.

#### Scenario: Retrieval context is built without replacing ExperienceInput

- **WHEN** ExperienceEngine prepares retrieval for a task
- **THEN** it builds a retrieval context from the existing runtime input and available host/task context
- **AND** `ExperienceInput` remains the source-compatible runtime entry contract
- **AND** missing opportunistic fields such as tool names, failure signature, read-only intent, or module paths do not cause retrieval to fail or skip by themselves

#### Scenario: Stage boundaries are observable for diagnostics

- **WHEN** ExperienceEngine evaluates candidates
- **THEN** retrieval preparation, hard filtering, lexical shortlisting, semantic rerank/backfill, policy enrichment, and decision assembly are represented as distinct internal stages
- **AND** diagnostics can identify which stage accepted, rejected, skipped, backfilled, or passed through a candidate without scraping prompt text

### Requirement: Phase A preserves existing intervention behavior

ExperienceEngine SHALL keep live intervention behavior unchanged while introducing retrieval-policy structure.

#### Scenario: Existing decisions remain stable

- **WHEN** the same node set, input, config, and evaluation mode are evaluated before and after Phase A
- **THEN** the resulting injection mode, delivered flag, injected node ids, intervention strength, prompt text, and key scorecard fields remain unchanged
- **AND** any new retrieval-stage diagnostics are additive

#### Scenario: Existing hard gates remain authoritative

- **WHEN** a node is disabled by scope, quarantined, retired, blocked by destructive-risk policy, or outside the current diagnostic-live gate
- **THEN** Phase A does not allow retrieval restructuring to reintroduce that node into prompt delivery
- **AND** existing delivery-state and repo-policy gates remain authoritative

### Requirement: Retrieval and policy signals remain separated

ExperienceEngine SHALL separate similarity/retrieval evidence from governance/policy evidence in the internal contract.

#### Scenario: Similarity does not become governance authority

- **WHEN** a candidate has high lexical or semantic similarity
- **THEN** similarity can contribute retrieval evidence
- **AND** policy gates still decide whether the candidate should influence the agent
- **AND** Phase A does not introduce a single total-score threshold as the only intervention authority

#### Scenario: Soft inferred fields stay soft

- **WHEN** read-only intent, module paths, tool names, or failure signatures are inferred with limited confidence
- **THEN** those fields may be recorded as retrieval context evidence
- **AND** they are not used as mandatory hard filters until a later spec defines stable collection and confidence semantics

### Requirement: Lexical shortlist is the first recall stage

ExperienceEngine SHALL run lexical/sparse shortlisting over the hard-filtered node pool before semantic rerank or semantic backfill.

#### Scenario: Lexical evidence defines the primary shortlist

- **WHEN** hard-filtered nodes have lexical overlap with the retrieval query
- **THEN** ExperienceEngine builds a bounded lexical shortlist from those nodes
- **AND** semantic retrieval reranks or augments that shortlist rather than replacing the shortlist as the primary recall authority

#### Scenario: Strong lexical evidence outranks semantic-only noise

- **WHEN** one candidate has strong lexical overlap and another candidate only has semantic similarity
- **THEN** the strong lexical candidate remains available ahead of the semantic-only candidate unless later policy or governance evidence rejects it
- **AND** semantic similarity alone does not bypass policy enrichment or intervention gates

### Requirement: Semantic retrieval is rerank or bounded backfill

ExperienceEngine SHALL treat semantic retrieval as expression-variant reranking or bounded backfill after lexical shortlisting.

#### Scenario: Semantic backfill recovers weak lexical matches

- **WHEN** lexical shortlisting produces no candidates or only weak candidates
- **THEN** ExperienceEngine may use semantic retrieval as a bounded backfill source
- **AND** backfilled candidates are labeled in retrieval diagnostics
- **AND** backfilled candidates still pass policy enrichment and final intervention gates before delivery

#### Scenario: Low-signal input skips semantic work

- **WHEN** the task input is low-signal and lacks useful context
- **THEN** ExperienceEngine skips semantic retrieval
- **AND** diagnostics identify semantic retrieval as skipped for low-signal input
- **AND** the absence of semantic candidates does not create a shared/global fallback pool

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

### Requirement: Retrieval policy diagnostics are inspectable

ExperienceEngine SHALL expose staged retrieval-policy diagnostics through operator inspection surfaces.

#### Scenario: Latest verbose inspection shows stage outcomes

- **WHEN** an operator runs the latest verbose inspection for a task with retrieval-policy diagnostics
- **THEN** the output includes each retrieval-policy stage name and outcome counts
- **AND** semantic rerank/backfill mode is visible when available
- **AND** the output does not require scraping injected prompt text to understand the retrieval path

#### Scenario: Policy components are visible for the top candidate

- **WHEN** the latest scorecard contains structured policy components for the top candidate
- **THEN** inspection output shows the top policy components with category, signed value, and reason
- **AND** the flat policy reasons remain available for compatibility

#### Scenario: Host-native summaries include retrieval-policy explanation

- **WHEN** a host-native inspect or lookup summary returns a scorecard summary
- **THEN** it includes a bounded retrieval-policy explanation derived from the scorecard
- **AND** the explanation is additive and does not change retrieval, scoring, delivery, or prompt text

### Requirement: Retrieval does not imply injection

ExperienceEngine SHALL treat retrieved candidates as inputs to intervention policy, not as automatic prompt content.

#### Scenario: Candidate retrieved but policy rejects injection

- **WHEN** retrieval returns a candidate that intervention policy rejects because of maturity, delivery state, recent harm, or confidence
- **THEN** ExperienceEngine SHALL keep the candidate diagnostic and SHALL NOT inject it

