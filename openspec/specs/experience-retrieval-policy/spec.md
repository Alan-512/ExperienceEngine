# experience-retrieval-policy Specification

## Purpose
TBD - created by archiving change stage-retrieval-policy-v2-phase-a. Update Purpose after archive.
## Requirements
### Requirement: Retrieval policy uses an explicit staged contract

ExperienceEngine SHALL define retrieval and policy decision flow as explicit stages while preserving current runtime behavior during Phase A.

#### Scenario: Retrieval context is built without replacing ExperienceInput

- **WHEN** ExperienceEngine prepares retrieval for a task
- **THEN** it builds a retrieval context from the existing runtime input and available host/task context
- **AND** `ExperienceInput` remains the source-compatible runtime entry contract
- **AND** missing opportunistic fields such as tool names, failure signature, read-only intent, or module paths do not cause retrieval to fail or skip by themselves

#### Scenario: Stage boundaries are observable for diagnostics

- **WHEN** ExperienceEngine evaluates candidates
- **THEN** retrieval preparation, hard filtering, shortlisting, policy enrichment, and decision assembly are represented as distinct internal stages
- **AND** diagnostics can identify which stage accepted, rejected, or passed through a candidate without scraping prompt text

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

