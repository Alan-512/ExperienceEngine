## ADDED Requirements

### Requirement: Real-host scenario execution is adapter-based and sealed

ExperienceEngine SHALL execute inject, correct-skip, and harm-recovery scenarios through one common OpenClaw matched-block harness with separately sealed scenario adapters.

#### Scenario: Scenario adapter is changed after block sealing

- **WHEN** task sequence, candidate corpus, deterministic checks, or evidence requirements change
- **THEN** a new scenario version and new block id SHALL be required

### Requirement: Multi-scenario evidence uses a new protocol stratum

ExperienceEngine SHALL NOT append the new scenarios to retained v1-v4 campaigns.

#### Scenario: Runner points at an existing campaign output

- **WHEN** output directory, runtime directory, campaign id, or database already exists
- **THEN** the runner SHALL fail before formal execution

### Requirement: Independent validation proves scenario-specific invariants

The validator SHALL prove common block/arm invariants and each scenario's candidate, decision, delivery, task, and governance requirements.

#### Scenario: Correct-skip evidence lacks plausible-candidate consideration

- **WHEN** the runtime scorecard does not bind a declared plausible id to considered, selected, or rejected evidence
- **THEN** independent validation SHALL fail

#### Scenario: Harm-recovery evidence lacks authoritative transition

- **WHEN** delivered harm, bound harmed evidence, non-live node transition, or fresh-session suppression is missing
- **THEN** independent validation SHALL fail

### Requirement: Claim limitations remain explicit

The durable evidence record SHALL identify exact artifact, host, model route, scenario count, repetition count, available/unavailable metrics, and unsupported claims.

#### Scenario: Infrastructure pilot completes

- **WHEN** the new campaign has insufficient repetitions or scenario clusters for a general claim
- **THEN** the result SHALL remain labeled infrastructure/directional evidence
- **AND** `support_claim_allowed` and `production_learning_ready` SHALL remain false

