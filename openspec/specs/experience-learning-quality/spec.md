# experience-learning-quality Specification

## Purpose
Raise ExperienceEngine's core learning quality so extracted experience, candidate retrieval, outcome attribution, harm attribution, and formal experience expression reflect actual task evidence instead of temporary heuristics.

## Requirements

### Requirement: Evidence-driven experience extraction
ExperienceEngine SHALL derive strategy and warning candidates from task evidence rather than from fixed outcome-only templates.

#### Scenario: Successful tasks produce differentiated strategy candidates
- **WHEN** a finalized successful task contains a distinct task summary, terminal tool sequence, and verification evidence
- **THEN** ExperienceEngine stores a strategy candidate whose hint text reflects that evidence
- **AND** the stored candidate is not limited to a single fixed strategy template shared by all successful tasks

#### Scenario: Failed tasks produce differentiated warning candidates
- **WHEN** a finalized failed task contains a distinct failure signature or repeated failing path
- **THEN** ExperienceEngine stores a warning candidate whose hint text reflects that failure evidence
- **AND** the stored candidate is not limited to a single fixed warning template shared by all failed tasks

### Requirement: Semantic candidate retrieval
ExperienceEngine SHALL retrieve candidate nodes using semantic similarity rather than exact scope and task-type filtering alone.

#### Scenario: Semantically similar tasks can retrieve candidates within the same scope
- **WHEN** a new task enters intervention evaluation with wording that differs from a prior task but is semantically similar
- **THEN** ExperienceEngine can retrieve the prior node as a candidate within the same scope

#### Scenario: Task-family proximity is softer than exact task-type equality
- **WHEN** two tasks are close enough to belong to related coding families but not the exact same task-type label
- **THEN** ExperienceEngine can consider those nodes during retrieval
- **AND** scope-local relevance still receives higher weight than unrelated candidates

### Requirement: Outcome resolution prefers terminal evidence over intermediate noise
ExperienceEngine SHALL resolve task outcomes from terminal evidence rather than treating any intermediate failing tool step as the final task outcome.

#### Scenario: Exploratory tool failure does not force final failure
- **WHEN** a task contains an intermediate exploratory tool event with a failure exit code
- **AND** later terminal evidence indicates the task was completed successfully
- **THEN** ExperienceEngine does not mark the overall outcome as `failure`

#### Scenario: Low-confidence terminal evidence remains unknown
- **WHEN** the task does not provide enough terminal evidence for either success or failure
- **THEN** ExperienceEngine stores the final outcome as `unknown`

### Requirement: Harm attribution is relevance-aware
ExperienceEngine SHALL avoid marking an injected node as harmed when the observed failure is environmental or plausibly unrelated to the injected guidance.

#### Scenario: Environmental failure does not harm injected nodes
- **WHEN** a task fails because of environmental conditions such as network, permission, or resource exhaustion errors
- **AND** the task had injected nodes
- **THEN** ExperienceEngine does not automatically mark those injected nodes as harmed

#### Scenario: Unrelated failure does not harm injected nodes
- **WHEN** a task fails in a way that is not plausibly related to the injected node's task family, trigger, or recommended path
- **THEN** ExperienceEngine does not automatically mark that injected node as harmed

### Requirement: General coding tasks remain eligible for the engine
ExperienceEngine SHALL support a conservative fallback path for coding tasks that do not match the current narrow debug-focused task classifiers.

#### Scenario: Unmatched coding task falls back to a general task family
- **WHEN** a task summary does not match a specialized task-type pattern
- **THEN** ExperienceEngine assigns it to a conservative general coding family rather than dropping it from the engine entirely

#### Scenario: General tasks can still produce conservative learning signals
- **WHEN** a task resolves into the general coding family with sufficient evidence
- **THEN** ExperienceEngine may still extract, retrieve, and inject conservative experience for that task

#### Scenario: Inline command spans do not force specialized classification
- **WHEN** a task summary contains specialized command keywords only inside inline code spans
- **AND** the surrounding narrative does not express that specialized task family
- **THEN** ExperienceEngine MUST ignore those code-span keywords for task-type matching

### Requirement: Finalize persistence is transactional
ExperienceEngine SHALL persist finalize-time state changes atomically enough to avoid partial drift between input records, nodes, stats, and related audit records.

#### Scenario: Finalize writes commit together
- **WHEN** ExperienceEngine finalizes a task successfully
- **THEN** the input record, node updates, stats updates, and related persistence side effects commit as one transaction

#### Scenario: Finalize write failure does not leave partial state drift
- **WHEN** a finalize-time write fails after one persistence step has started
- **THEN** ExperienceEngine rolls back the incomplete finalize transaction
- **AND** it does not leave partially updated node or stats state behind

### Requirement: Node provenance and attribution are inspectable
ExperienceEngine SHALL persist enough provenance and attribution metadata to explain why a node exists and why its state changed.

#### Scenario: Node origin references are stored
- **WHEN** ExperienceEngine creates or updates a node from a finalized task
- **THEN** it stores references that let operators trace the node back to one or more originating task records

#### Scenario: Harm and help attribution remain explainable
- **WHEN** ExperienceEngine updates helped or harmed counters on a node
- **THEN** it stores enough attribution detail to inspect the task records associated with that feedback later

### Requirement: LLM-first distillation is the primary path for formal experience expression
ExperienceEngine SHALL use an extractor-model distillation step as the default path for producing final experience wording once a candidate passes rule-based filtering.

#### Scenario: Rules gate but do not author final experience text
- **WHEN** a candidate passes the rule-based pre-filter
- **THEN** ExperienceEngine sends it through the configured distillation model to produce the final compact hint and related structured fields
- **AND** rule heuristics do not directly serve as the final experience wording in the primary path

#### Scenario: Distillation uses a model profile independent from the host's main execution loop
- **WHEN** ExperienceEngine performs candidate distillation
- **THEN** it selects a configured extractor profile suitable for distillation work
- **AND** that profile remains conceptually separate from the host agent's main execution model
