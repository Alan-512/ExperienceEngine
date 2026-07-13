## ADDED Requirements

### Requirement: Imported activation, control, handshake, and projection tables are exhaustive

ExperienceEngine SHALL implement the complete activation authority schema, state table, gateway whitelist, blocked-boundary exit table, control/idempotency schema, handshake schema/transitions, timing policy, status projection, readiness predicates, and value projection rules imported from Sections 4.15–4.17, 4.20, and 9.1–10.3.

#### Scenario: Imported field, state, boundary, operation, writer branch, transition, or predicate input is omitted

- **WHEN** a schema, enum, switch, repository, service, projection, or test fixture omits an imported member
- **THEN** exhaustive contract tests SHALL fail
- **AND** the omitted case SHALL NOT be handled by a generic default branch

### Requirement: Package activation state machine is exhaustive

ExperienceEngine SHALL represent package activation with an exhaustive state and identity contract covering `uninitialized`, transition states, `active`, and `blocked` without undefined stable or rollback-preparing aliases.

#### Scenario: State is inspected

- **WHEN** the current package activation row is read
- **THEN** its active/pending/previous generation identities, transition kind, blocked boundary/from-state, deadline, and current pointers SHALL match the single allowed shape for that state

#### Scenario: Unlisted transition is attempted

- **WHEN** a writer attempts a state edge, identity mutation, or deadline change not present in the exhaustive contract
- **THEN** the mutation SHALL be rejected

### Requirement: Revision zero is reserved for empty-home bootstrap

ExperienceEngine SHALL use activation revision zero only when creating the absent package-activation authority row for a fixed empty home.

#### Scenario: Empty home is bootstrapped

- **WHEN** no activation authority row exists and all required home/key/schema bootstrap predicates match
- **THEN** one transaction MAY create the `uninitialized` authority row at revision zero with no generation or current authorization/handshake pointer

#### Scenario: Existing uninitialized row is reused

- **WHEN** an `uninitialized` authority row already exists at any revision
- **THEN** bootstrap SHALL NOT reset or recreate it at revision zero

### Requirement: Package initialization accepts any exact uninitialized revision

ExperienceEngine SHALL implement `initialize_package_activation` for an exact valid `uninitialized` activation revision `N >= 0`.

#### Scenario: Initialization starts at revision N

- **WHEN** state is `uninitialized` at expected revision `N`, no active/pending/previous generation or transition residue exists, current authorization/handshake pointers are null, package closure is verified, the gateway is current, and objective supervisor freshness is false
- **THEN** one transaction SHALL set the exact verified initial generation pending, enter `preparing`, set revision `N + 1`, create a deadline/launch budget, issue the initial authorization, and set current pointers

#### Scenario: Caller expects an old revision

- **WHEN** the caller's expected activation revision differs from the authoritative current revision
- **THEN** initialization SHALL be rejected as stale
- **AND** the authoritative state SHALL remain unchanged

### Requirement: Gateway package-authority mutations are exhaustively whitelisted

ExperienceEngine SHALL permit gateway-owned package-authority changes only through the frozen exhaustive mutation whitelist.

The whitelist SHALL contain exactly these operation identities: `bootstrap_package_activation_authority`, `initialize_package_activation`, `consume_launch_authorization_and_reserve_attempt`, `expire_or_cancel_unconsumed_authorization`, `issue_active_restart_authorization`, `issue_deterministic_replacement_authorization`, `enter_blocked_transition`, `retry_package_activation`, `cancel_package_transition`, `retry_production_activation`, and `prepare_package_rollback`.

#### Scenario: Whitelisted gateway operation runs

- **WHEN** a named operation's exact state, identity, revision, current gateway, deadline, authorization, attempt, and objective no-fresh-supervisor predicates match
- **THEN** it MAY change only the fields assigned to that operation

#### Scenario: Another section implies gateway authority

- **WHEN** code or a caller attempts a gateway-owned package mutation not represented in the whitelist
- **THEN** the mutation SHALL be rejected

#### Scenario: Stale-owner recovery is requested

- **WHEN** prior supervisor authority becomes terminal and objective freshness is false
- **THEN** recovery SHALL use `issue_deterministic_replacement_authorization` or the exact legal blocked-boundary operation
- **AND** it SHALL NOT create a separate stale-owner mutation class

### Requirement: Gateway and supervisor writer modes are mutually exclusive

ExperienceEngine SHALL require each package/control mutation request to select exactly one writer mode.

#### Scenario: Supervisor-owned request is submitted

- **WHEN** `expected_supervisor_lease_epoch` is an integer
- **THEN** the exact owner/epoch SHALL satisfy objective fresh supervisor authority
- **AND** gateway-writer identity SHALL be absent

#### Scenario: Gateway-owned request is submitted

- **WHEN** `expected_supervisor_lease_epoch = none`
- **THEN** the exact current gateway identity and objective `fresh_supervisor_authority = false` SHALL be proven in the transaction
- **AND** supervisor-writer identity SHALL be absent

#### Scenario: Request mixes writer identities

- **WHEN** a request supplies both or neither required writer identity modes
- **THEN** it SHALL be rejected as invalid authority

### Requirement: Preactivation verification is not production activation

ExperienceEngine SHALL keep preactivation verification and post-CAS production activation as distinct revisioned handshake kinds with one persistent writer, expected prior state/revision, expiry, and replay rejection.

#### Scenario: Preactivation verification completes

- **WHEN** the pending generation passes package/schema/configuration/route validation under exact transition authority
- **THEN** the preactivation handshake MAY complete for that pending identity
- **AND** it SHALL NOT make `learning_runtime_active` true or authorize production queue work

#### Scenario: Preactivation record is replayed after identity changes

- **WHEN** activation revision, package identity, supervisor epoch, worker fence, configuration generation, route set, schema, or handshake revision no longer matches
- **THEN** the old handshake SHALL be rejected as stale evidence

#### Scenario: Handshake state is persisted

- **WHEN** the plugin creates a new activation request
- **THEN** it SHALL insert only the `requested` row with state revision one and a single-use nonce
- **AND** every later persistent transition SHALL be written by the current supervisor through expected-state/revision CAS

#### Scenario: Worker acknowledges activation

- **WHEN** the worker participates in a handshake
- **THEN** it SHALL return the imported nonce proof and complete authority envelope through authenticated IPC
- **AND** it SHALL NOT write the handshake table directly

### Requirement: Production activation binds current and historical authority correctly

ExperienceEngine SHALL complete production activation only after the package identity CAS and shall bind the current package activation revision plus the immutable launch evidence that granted the current supervisor lease.

#### Scenario: Transition supervisor continues after identity CAS

- **WHEN** the same authoritative supervisor continues from a transition into the active package identity
- **THEN** the production handshake SHALL preserve its historical transition-role authorization/attempt and launch activation revision
- **AND** it SHALL bind the new current package activation revision separately

#### Scenario: Replacement supervisor activates production

- **WHEN** a new supervisor is launched after package identity is active
- **THEN** it SHALL require a new `active` authorization and attempt
- **AND** the production handshake SHALL bind that replacement evidence

#### Scenario: Already-active runtime restarts

- **WHEN** package state remains `active` but the prior supervisor or production worker authority was lost
- **THEN** recovery SHALL use a new `active` authorization/attempt when a replacement supervisor is needed, a fresh production worker fence, and a new production handshake
- **AND** the current production-handshake pointer MAY advance while package state and current activation revision remain unchanged

### Requirement: Production activation authority is canonical

ExperienceEngine SHALL define `production_activation_authorized` from the exact current active package generation, current activation revision, complete unexpired production handshake, supervisor epoch, production worker mode/fence, configuration generation, effective route set/revision, and schema bindings.

#### Scenario: All current bindings match

- **WHEN** every required current authority row and handshake binding matches in one transaction
- **THEN** `production_activation_authorized` SHALL be true for that transaction

#### Scenario: Any current binding is lost

- **WHEN** package state leaves `active`, the handshake is invalidated/expired, supervisor epoch changes, worker mode/fence changes, configuration or route authority changes, or schema binding becomes stale
- **THEN** `production_activation_authorized` SHALL be false immediately for later transactions

#### Scenario: Package transaction invalidates production authority

- **WHEN** a package-authority transaction leaves `active`, enters `blocked` or `production_activating`, changes the production-handshake pointer, or changes a handshake-bound configuration, route, schema, package, or home identity
- **THEN** the same transaction SHALL invalidate the matching production handshake authority
- **AND** when a matching current worker lease exists it SHALL set the worker to the frozen draining or blocked state with shutdown request and bounded drain deadline

### Requirement: Protected writes use one operation-specific predicate

ExperienceEngine SHALL define `production_write_authorized(operation)` as `production_activation_authorized` plus the exact current worker owner/fence and operation-specific lease/claim predicates.

#### Scenario: New queue claim is attempted

- **WHEN** a worker attempts a production claim
- **THEN** `production_write_authorized(new_claim)` SHALL be revalidated in the claim transaction

#### Scenario: Existing claim is renewed or completed

- **WHEN** a worker attempts renewal or semantic completion
- **THEN** `production_write_authorized(existing_claim)` and every claim-time binding SHALL be revalidated in that transaction

#### Scenario: New standalone or route-projection write is attempted

- **WHEN** a worker-originated new claim, blocked/failure/discard transition, mutable route projection, or standalone semantic mutation is attempted
- **THEN** the exact current worker lease SHALL be active with no shutdown request in addition to canonical production activation

#### Scenario: Existing claim commits during deliberate drain

- **WHEN** renewal or completion is attempted while worker lease state is the deliberate runtime draining state
- **THEN** it MAY proceed only while package activation remains active, the claim uses the same activation revision and handshake id, and commit occurs no later than the drain deadline
- **AND** package-transition or authority-loss draining SHALL NOT preserve old-claim semantic authority

#### Scenario: Authority is lost after claim

- **WHEN** the predicate becomes false before completion
- **THEN** only S5 interruption recovery MAY mutate the unfinished claim
- **AND** no semantic content or content-retry consumption SHALL occur

### Requirement: Blocked controls are boundary-specific

ExperienceEngine SHALL define the legal retry, cancellation, production-retry, or rollback operations separately for each blocked boundary.

#### Scenario: Operator retries a blocked transition

- **WHEN** the request matches the exact blocked boundary, source state, identities, expected revisions, terminal prior authority, and current gateway predicates
- **THEN** only the boundary-assigned identity, deadline, authorization, handshake, lease, and fence effects SHALL commit

#### Scenario: Wrong control is used for a boundary

- **WHEN** a retry/cancel/rollback operation is not legal for the current blocked boundary
- **THEN** the request SHALL be rejected without changing package authority

#### Scenario: Post-identity blocked state retries

- **WHEN** the boundary is `post_identity`
- **THEN** only `retry_production_activation` or `prepare_package_rollback` SHALL be legal according to the frozen table
- **AND** no operation SHALL transition directly from blocked post-identity state to active

#### Scenario: Pre-identity cancellation runs

- **WHEN** the boundary is pre-identity initial, upgrade, or rollback and cancellation predicates match
- **THEN** package identities, authorization/handshake projections, lease/attempt terminalization, and target state SHALL follow the exact imported boundary row
- **AND** historical rows SHALL remain immutable

#### Scenario: Pre-identity rollback cancellation runs

- **WHEN** a rollback transition is cancelled before the pending rollback generation becomes active
- **THEN** the selected active generation SHALL remain unchanged, pending rollback identity SHALL be cleared, and package state SHALL become `production_activating`
- **AND** the operation SHALL create a new activation deadline and SHALL NOT restore or reuse a prior production handshake
- **AND** a current supervisor MAY continue only when it belongs to the selected active generation
- **AND** when no such supervisor is current, the gateway branch SHALL require terminal prior supervisor/attempt authority and SHALL issue a fresh `active` authorization atomically with the cancellation
- **AND** a fresh pending/rollback-generation supervisor SHALL be rejected until it releases its authority

#### Scenario: Pre-identity upgrade cancellation preserves active

- **WHEN** an upgrade transition is cancelled and the selected active generation's production handshake remains current
- **THEN** the package MAY return directly to `active` without changing selected identity
- **BUT WHEN** that handshake is absent
- **THEN** cancellation SHALL enter `production_activating` and follow the same continuing-selected-supervisor or gateway replacement-authorization rule

### Requirement: Control requests are crash-safe and idempotent

ExperienceEngine SHALL commit a control mutation and its completed or rejected idempotency result in one transaction keyed by request id and request digest.

#### Scenario: Exact request is replayed

- **WHEN** the same request id and digest are submitted again
- **THEN** ExperienceEngine SHALL return the committed stable result without reapplying the mutation

#### Scenario: Request id is reused with another digest

- **WHEN** an existing request id is submitted with different operation content
- **THEN** the request SHALL be rejected as an idempotency conflict

### Requirement: OpenClaw-native control surface includes the frozen minimum operations

ExperienceEngine SHALL expose `status`, `pause_learning`, `resume_learning`, `retry_blocked_system_work`, `initialize_package_activation`, `prepare_package_generation`, `prepare_package_rollback`, `retry_package_activation`, `cancel_package_transition`, `retry_production_activation`, `request_drain`, and `repair_explanation` through the package-local control contract.

#### Scenario: Read-only control is invoked

- **WHEN** `status` or `repair_explanation` is requested
- **THEN** ExperienceEngine SHALL return the deterministic current projection and exact next action
- **AND** it SHALL NOT create package, queue, lease, configuration, route, or activation mutation authority

#### Scenario: Mutating control is invoked

- **WHEN** pause, resume, blocked-work retry, initialization, generation preparation, rollback, activation retry/cancel, production retry, or drain is requested
- **THEN** the request SHALL use the frozen request digest, expected projection/writer authority, operation-specific predicates, and atomic idempotency result
- **AND** an alias SHALL NOT bypass the named package-authority whitelist or S5 queue transition contract

### Requirement: OpenClaw-native activation projections are truthful

ExperienceEngine SHALL derive separate interaction, learning-runtime, and production-learning readiness predicates.

#### Scenario: Plugin interaction works without learning runtime

- **WHEN** prompt-time plugin interaction is active but production activation is incomplete
- **THEN** `interaction_active` MAY be true
- **AND** `learning_runtime_active` and `production_learning_ready` SHALL be false

#### Scenario: Learning runtime is active

- **WHEN** package state is `active`, the exact active generation is current, worker mode is `production`, and the complete post-CAS production handshake is authoritative
- **THEN** `learning_runtime_active` MAY be true
- **AND** loaded plugin state, file existence, PID presence, or database creation alone SHALL NOT satisfy it

#### Scenario: Production learning is ready

- **WHEN** `learning_runtime_active` is true and every required capability has current `validation_status = valid`, benchmark assurance in `recommended | supported`, and runtime health in `healthy | degraded_fallback`
- **THEN** `production_learning_ready` MAY be true

#### Scenario: Custom profile is contract-valid but unbenchmarked

- **WHEN** the runtime is active under a valid custom profile without required benchmark assurance
- **THEN** `production_learning_ready` SHALL be false
- **AND** status SHALL preserve the separate contract-valid, quality-unbenchmarked conclusion

### Requirement: Setup, quality, health, capability, and value projections remain orthogonal

ExperienceEngine SHALL derive separate setup state, quality profile, core learning quality, learning health, per-capability route/validation/assurance/health detail, first-value state, and outcome-confirmed value.

#### Scenario: Setup is ready but learning is paused

- **WHEN** host installation and initialization are current but one required capability is blocked
- **THEN** setup MAY remain ready while learning health is paused
- **AND** existing governed guidance MAY remain available under its normal delivery gates

#### Scenario: Custom profile is healthy

- **WHEN** all required custom capability routes are contract-valid and currently healthy
- **THEN** status SHALL report custom profile and contract-valid quality-unbenchmarked separately from learning health
- **AND** custom-origin guidance SHALL remain shadow evaluation only under `custom-shadow-only-v1`

#### Scenario: Default status is rendered

- **WHEN** status is requested without verbose detail
- **THEN** it SHALL show the current setup, quality, health, value summary, most important next action, and at most the capability warning that changes user action
- **AND** low-level fingerprints and route details SHALL remain verbose-only

### Requirement: Activation and value milestones are derived before adding persistence

ExperienceEngine SHALL derive first task, first node, first intervention, first attribution, and first helpful/harmful intervention milestones from existing records whenever those records are sufficient.

#### Scenario: A milestone can be derived

- **WHEN** existing task, node, injection, or attribution records contain the required timestamp and evidence
- **THEN** ExperienceEngine SHALL derive the milestone
- **AND** it SHALL NOT create a second activation/value event ledger

#### Scenario: Host readiness is evaluated

- **WHEN** current host/session readiness is requested
- **THEN** it SHALL be derived live for that host/session
- **AND** one global `host_ready_at` SHALL NOT be added

### Requirement: Outcome-confirmed value uses the frozen helpful predicate

ExperienceEngine SHALL mark outcome-confirmed value reached only for the earliest delivered intervention satisfying the frozen manual-or-strong-help predicate.

#### Scenario: Manual helped override exists

- **WHEN** `delivered = true`, attribution source is `manual_override`, and `user_override = helped`
- **THEN** outcome-confirmed value SHALL be reached

#### Scenario: Strong automatic helpful attribution exists

- **WHEN** `delivered = true`, `attribution_verdict = strong_helped`, and confidence is medium or high
- **THEN** outcome-confirmed value SHALL be reached

#### Scenario: Evidence is weaker or not delivered

- **WHEN** evidence is weak-helped, low-confidence, neutral, unknown, suppressed, or non-delivered
- **THEN** outcome-confirmed value SHALL remain not reached

#### Scenario: Published closure is not yet proven

- **WHEN** local source-repo activation passes but S7 published npm/ClawHub validation is incomplete
- **THEN** the product SHALL NOT claim the canonical published path is supported
