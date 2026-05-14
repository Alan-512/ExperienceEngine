## ADDED Requirements

### Requirement: Distillation only processes eligible candidates

ExperienceEngine SHALL only create distillation jobs for tasks that passed learning eligibility and produced an experience candidate.

#### Scenario: Rejected task does not enqueue distillation

- **WHEN** a finalized task is rejected by the learning eligibility gate
- **THEN** ExperienceEngine SHALL NOT create a distillation job for that task

#### Scenario: Accepted task can enqueue distillation

- **WHEN** a finalized task passes learning eligibility and candidate creation succeeds
- **THEN** ExperienceEngine MAY create a distillation job according to the existing distillation pipeline behavior
