## ADDED Requirements

### Requirement: OpenClaw efficacy campaigns use matched three-arm blocks

ExperienceEngine SHALL evaluate publishable OpenClaw efficacy through sealed matched blocks containing exactly `treatment`, `forced_holdout`, and `no_ee` arms under the S8 benchmark protocol.

#### Scenario: Existing high-confidence scenario is benchmarked

- **WHEN** an eligible OpenClaw scenario is included in a matched efficacy campaign
- **THEN** the block SHALL seal the scenario/repository/task/corpus/host/model/environment/instrumentation contract before formal execution
- **AND** all three arms SHALL use isolated workspaces, EE homes, runtime artifacts, and host sessions

#### Scenario: Forced holdout arm executes

- **WHEN** the forced-holdout arm runs the scenario
- **THEN** ExperienceEngine retrieval and decision SHALL run and record would-have-delivered evidence
- **AND** prompt delivery SHALL be suppressed unconditionally

#### Scenario: No-EE arm executes

- **WHEN** the no-EE arm runs the scenario
- **THEN** no ExperienceEngine runtime SHALL participate
- **AND** the common external harness SHALL collect comparable outcome, duration, tool-call, timeout, cost/token-when-available, and infrastructure evidence

### Requirement: OpenClaw scenario retries preserve formal attempt authority

ExperienceEngine SHALL keep setup retries in preflight and permit at most one formal attempt for each `(block_id, arm)` after the task input release boundary.

#### Scenario: Host setup fails before task release

- **WHEN** OpenClaw host startup, workspace setup, or common provider readiness fails before the formal attempt row is inserted
- **THEN** bounded preflight retry MAY occur without consuming the arm's formal slot

#### Scenario: Arm fails after formal start

- **WHEN** the scenario reaches task timeout, product runtime failure, task failure, infrastructure failure, cancellation, or invalidity after formal start
- **THEN** that outcome SHALL consume the one formal arm slot
- **AND** a rerun SHALL require a newly sealed replacement block containing all three arms

### Requirement: OpenClaw scenario reports separate efficacy and reliability

ExperienceEngine SHALL compute matched efficacy from complete eligible blocks and infrastructure reliability from every attempted arm, including attempts in incomplete, invalid, or replaced blocks.

#### Scenario: One arm has benchmark infrastructure failure

- **WHEN** a required arm is infrastructure-failed, harness-timed-out, contaminated, invalid, or lacks comparable instrumentation
- **THEN** the entire block SHALL be excluded from primary efficacy deltas
- **AND** all attempts and the block disposition SHALL remain in coverage/reliability reporting

#### Scenario: ExperienceEngine product runtime fails validly

- **WHEN** the common host/harness/transcript/scorer completes but ExperienceEngine activation, route, queue, retrieval, or delivery fails
- **THEN** the attempt SHALL remain a completed product outcome in the matched block
- **AND** the report SHALL expose the stable product failure codes
