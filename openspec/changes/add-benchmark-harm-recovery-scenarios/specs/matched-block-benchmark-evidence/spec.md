## ADDED Requirements

### Requirement: Harm recovery is a causal production-governed sequence

ExperienceEngine SHALL measure harm recovery through a predeclared harm-exposure and recovery-recheck sequence.

#### Scenario: Treatment guidance causes deterministic harm

- **WHEN** the treatment arm delivers the sealed harmful node and the deterministic task check proves the harmful path occurred
- **THEN** the intervention event SHALL be classified harmed
- **AND** authoritative feedback or attribution SHALL bind the harm to the delivered node

#### Scenario: Harm is followed by governance transition

- **WHEN** authoritative harmed evidence is accepted
- **THEN** the production governance path SHALL move the implicated node to a non-live delivery state
- **AND** the benchmark harness SHALL only observe the transition

#### Scenario: Benchmark directly edits governance state

- **WHEN** benchmark setup or scoring writes harmed counters, node state, delivery state, attribution, or review-event rows directly
- **THEN** the block SHALL be invalid for harm-recovery evidence

### Requirement: Recovery recheck uses a fresh equivalent opportunity

ExperienceEngine SHALL test recovery in a fresh host session and reset workspace while retaining the production-governed node state.

#### Scenario: Harmful node is suppressed on recheck

- **WHEN** the same task family is presented after the harm transition
- **THEN** treatment SHALL not deliver the implicated harmful node
- **AND** stable candidate/rejection and post-transition evidence SHALL be retained

#### Scenario: Harmful node is delivered again

- **WHEN** treatment delivers the same implicated node on recovery recheck
- **THEN** harm recovery SHALL fail
- **AND** the repeated delivery SHALL remain visible as a harmful product outcome

### Requirement: Control arms preserve declared treatment differences

Forced holdout SHALL run the same decision pipeline with delivery suppressed, and no-EE SHALL contain no ExperienceEngine runtime.

#### Scenario: Forced holdout has no delivered exposure

- **WHEN** forced holdout records would-have-delivered on harm exposure
- **THEN** no synthetic harmed feedback SHALL be created for that non-delivered event

#### Scenario: No-EE arm runs the sequence

- **WHEN** the no-EE arm executes both task inputs
- **THEN** the external harness SHALL collect the same task and host metrics
- **AND** no ExperienceEngine database, decision, delivery, feedback, or governance evidence SHALL exist

### Requirement: Harm-recovery evidence is reported separately

ExperienceEngine SHALL report opportunity count, success count, and harm-recovery rate as supplemental campaign evidence.

#### Scenario: Campaign has no harm-recovery ground truth

- **WHEN** no complete treatment block contains the sealed harm-recovery sequence
- **THEN** harm-recovery rate SHALL be unavailable rather than zero

