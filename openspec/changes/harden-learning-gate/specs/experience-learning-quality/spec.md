## ADDED Requirements

### Requirement: Learning candidate creation is gated by deterministic eligibility

ExperienceEngine SHALL evaluate task records with deterministic learning eligibility rules before creating a learning candidate.

#### Scenario: Expression-only task is rejected

- **WHEN** a finalized task only changes wording, formatting, or documentation expression without substantive execution evidence
- **THEN** ExperienceEngine SHALL persist the task record and SHALL NOT create an experience candidate

#### Scenario: Ordinary successful task is rejected

- **WHEN** a finalized task succeeds without failure repair, retry evidence, directional correction, objective verification change, repeated task evidence, reusable error signature, or verified project execution constraint
- **THEN** ExperienceEngine SHALL persist the task record and SHALL NOT create an experience candidate

#### Scenario: Failure repair success is accepted

- **WHEN** a finalized task contains a failure signal followed by a successful repair path with reusable execution evidence
- **THEN** ExperienceEngine SHALL allow candidate creation for that task

#### Scenario: Directional correction is accepted

- **WHEN** the user explicitly corrects the agent's direction, boundary, validation order, or quality standard and the final task outcome supports that correction
- **THEN** ExperienceEngine SHALL allow candidate creation for that task

#### Scenario: Verified project constraint is accepted

- **WHEN** a successful task produces a reusable project execution constraint backed by objective verification
- **THEN** ExperienceEngine SHALL allow candidate creation for that task

### Requirement: Learning rejection reasons are inspectable

ExperienceEngine SHALL expose a stable learning reason for tasks that are recorded but rejected from candidate creation.

#### Scenario: Rejected task has reason code

- **WHEN** a finalized task is rejected by the learning eligibility gate
- **THEN** ExperienceEngine SHALL make a stable reason code available through persistence or inspection
