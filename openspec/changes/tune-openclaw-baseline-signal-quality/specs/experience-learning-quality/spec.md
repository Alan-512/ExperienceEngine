## MODIFIED Requirements

### Requirement: Semantic candidate retrieval
ExperienceEngine SHALL retrieve candidate nodes using semantic similarity rather than exact scope and task-type filtering alone.

#### Scenario: Semantically similar tasks can retrieve candidates within the same scope
- **WHEN** a new task enters intervention evaluation with wording that differs from a prior task but is semantically similar
- **THEN** ExperienceEngine can retrieve the prior node as a candidate within the same scope

#### Scenario: Task-family proximity is softer than exact task-type equality
- **WHEN** two tasks are close enough to belong to related coding families but not the exact same task-type label
- **THEN** ExperienceEngine can consider those nodes during retrieval
- **AND** scope-local relevance still receives higher weight than unrelated candidates

#### Scenario: Low-specificity legacy nodes are downranked
- **WHEN** retrieval compares a low-specificity legacy node against a more specific distilled node with similar semantic relevance
- **THEN** ExperienceEngine MUST downrank the legacy node
- **AND** the more specific node SHOULD win selection when all other quality signals are comparable

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
