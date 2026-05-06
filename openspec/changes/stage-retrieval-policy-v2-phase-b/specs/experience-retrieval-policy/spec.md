## MODIFIED Requirements

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

## ADDED Requirements

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
