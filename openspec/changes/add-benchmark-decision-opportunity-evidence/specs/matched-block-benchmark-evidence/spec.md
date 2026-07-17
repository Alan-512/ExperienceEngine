## MODIFIED Requirements

### Requirement: Ground truth predeclares every scored decision opportunity

ExperienceEngine SHALL support a versioned ground-truth sequence for task trials containing more than one decision opportunity while preserving the legacy one-opportunity contract.

#### Scenario: Legacy v1 ground truth is scored

- **WHEN** a retained v1 campaign contains one aggregate observation per arm
- **THEN** it SHALL remain readable and SHALL score as one decision opportunity
- **AND** no v2-only field SHALL be invented in the retained record

#### Scenario: V2 ground truth is sealed

- **WHEN** a scenario contains one or more scored decision opportunities
- **THEN** every opportunity SHALL have a unique stable id, ordinal, expected action, and evidence requirements before the block is sealed
- **AND** later observations SHALL NOT add or remove opportunities

### Requirement: Arm observations are opportunity-exhaustive

ExperienceEngine SHALL retain one immutable observation for every predeclared decision opportunity and SHALL verify arm aggregates against those records.

#### Scenario: Observation aggregate differs from opportunity records

- **WHEN** opportunity count, delivery count, helped/harmed/uncertain count, or primary decision does not match the opportunity array
- **THEN** scoring SHALL fail with a stable input-validation error

#### Scenario: Opportunity id is missing, duplicated, or undeclared

- **WHEN** an arm observation does not contain exactly the sealed opportunity id set
- **THEN** the block SHALL NOT receive a valid score

### Requirement: Correct skips require plausible-candidate evidence

ExperienceEngine SHALL count a correct skip only when a skip-labeled opportunity contains evidence that a declared plausible candidate or distractor was considered and validly rejected.

#### Scenario: Retrieval returns no candidate

- **WHEN** no declared plausible id appears in considered, selected, or rejected candidate evidence
- **THEN** the opportunity SHALL NOT count as a correct skip
- **AND** the scorer SHALL report missing/incomparable correct-skip evidence rather than treating absence as success

#### Scenario: Valid correct skip completes

- **WHEN** a declared plausible id was considered, decision is skip, delivery is zero, a stable reason is recorded, deterministic checks succeed, and skipped guidance was not required
- **THEN** the opportunity SHALL count as one correct skip

### Requirement: Confusion and delivery coverage use decision opportunities

ExperienceEngine SHALL compute treatment delivery rate and the 3x3 confusion matrix from decision opportunities while preserving block-level task-trial deltas.

#### Scenario: One task trial contains multiple opportunities

- **WHEN** a treatment arm contains more than one sealed decision opportunity
- **THEN** delivery-rate denominator and confusion-matrix total SHALL include every opportunity
- **AND** task success, latency, cost, token, and tool-call pairwise deltas SHALL still contribute one task-trial value for the block

### Requirement: False-positive injection is delivery on a skip label

ExperienceEngine SHALL count a false-positive injection only when treatment actually delivers an intervention on a skip-labeled opportunity.

#### Scenario: Forced holdout would have injected

- **WHEN** forced holdout records an inject decision but delivery remains false
- **THEN** that evidence SHALL be reported as would-have-delivered control evidence
- **AND** it SHALL NOT increment delivered false-positive injections

