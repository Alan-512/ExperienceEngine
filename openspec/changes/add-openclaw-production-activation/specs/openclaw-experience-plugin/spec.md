## ADDED Requirements

### Requirement: OpenClaw plugin service lifecycle calls the package-local supervisor

ExperienceEngine SHALL use the OpenClaw plugin service lifecycle as the canonical host trigger for starting and stopping the package-local supervisor without placing provider, queue, migration, or semantic worker execution inside the gateway process.

#### Scenario: OpenClaw starts the plugin service

- **WHEN** OpenClaw invokes the registered ExperienceEngine service start lifecycle
- **THEN** the plugin SHALL resolve the current package-local supervisor entrypoint and submit the S6-governed launch/control request
- **AND** service startup SHALL NOT infer full learning activation from successful process creation

#### Scenario: OpenClaw stops the plugin service

- **WHEN** OpenClaw invokes the registered service stop lifecycle
- **THEN** the plugin SHALL publish or submit the idempotent drain/stop request through the package-local control contract
- **AND** worker and supervisor authority SHALL terminate through the frozen drain, fence, lease, and attempt protocols

### Requirement: Gateway interaction and learning runtime activation remain separate

ExperienceEngine SHALL keep prompt-time retrieval, bounded interaction, short producer writes, and status availability distinct from package-local production learning activation.

#### Scenario: Plugin interaction is available while runtime is warming

- **WHEN** plugin registration and canonical home status are available but migration, configuration, supervisor, worker, or production handshake is incomplete
- **THEN** the plugin MAY expose the bounded behavior allowed by the current schema mode
- **AND** it SHALL report learning runtime inactive or warming rather than full background learning

#### Scenario: Producer write is accepted

- **WHEN** the plugin schema mode permits a short idempotent producer write
- **THEN** the plugin MAY record the bounded source event or candidate-trigger input assigned to the gateway role
- **AND** it SHALL NOT perform distillation, semantic merge, embedding generation, queue consumption, or provider-backed posttask work inside the gateway process

### Requirement: OpenClaw-native controls use authoritative projections

ExperienceEngine SHALL serve routine OpenClaw status, pause/resume, blocked-work retry, drain, package activation, rollback, and repair explanation through the S6 control/idempotency contract.

#### Scenario: Model explains runtime status

- **WHEN** OpenClaw presents an ExperienceEngine status or repair explanation to the user
- **THEN** the explanation SHALL be grounded in the deterministic authoritative projection
- **AND** it SHALL NOT invent activation, route health, worker ownership, readiness, or value state from process presence or prose
