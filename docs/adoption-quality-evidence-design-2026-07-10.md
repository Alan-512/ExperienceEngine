# ExperienceEngine Adoption, Quality, Evidence, And Distribution Design

Date: `2026-07-10`
Protocol freeze approved: `2026-07-11`
Status: Phase 0.5A.1 protocol frozen; eight-slice OpenSpec plan independently reviewed and approved
Implementation status: Phase 0.5A.0 complete; Phase 0.5A.1 freeze and OpenSpec slicing approved; S1 implementation permitted but not started
Owner: ExperienceEngine

## 1. Executive Decision

ExperienceEngine should continue to treat provider-backed reasoning as the supported production learning path.

The product should reduce setup ambiguity, duplicated configuration, and failure-recovery friction without lowering the intelligence quality of learned experience.

The following decisions remain valid:

- do not introduce a rule-only onboarding profile as an equivalent production mode
- do not silently generate rule-distilled production learning content when a configured provider fails
- continue serving already-governed experience when the learning path is paused, subject to normal delivery gates
- keep setup readiness, learning quality, and value realization separate
- keep diagnostics local and allowlisted by default
- prove product value with matched multi-arm evidence rather than download count or isolated successful demos
- validate npm, ClawHub, packed artifacts, and host-native integrations independently

The previous draft was not implementation-ready. Its most important errors were:

1. treating the current ClawHub/OpenClaw package as a complete background-learning runtime
2. modeling quality as one mutually exclusive status enum
3. treating all rule behavior as one fallback switch
4. assuming the current queue can pause and resume provider-blocked work
5. treating configured provider/model fields as proof of initialization quality
6. proposing more activation persistence than the existing data model requires
7. leaving diagnostic and benchmark protocols underspecified

The second review confirmed the direction and authorized Phase 0.5A.0 as a reality-validation and architecture-decision phase.

Phase 0.5A.0 is now complete. Its artifact, host, process, SQLite, upgrade, and Windows validation results are recorded in:

- `phase-0.5a.0-distribution-runtime-reality-report-2026-07-10.md`
- `phase-0.5a.0-openclaw-architecture-decision-2026-07-10.md`

The third review confirmed that the core architecture remained sound but rejected Phase 0.5A.1 protocol freeze. The fourth review then confirmed that most A1 contracts had reached implementation-level precision but rejected freeze because six authority, retry, assurance, and benchmark branches remained open.

This revision preserves the A0 architecture and closes those fourth-review blockers:

1. package launch authority is explicit for initial, active, pending, rollback, and stale-owner recovery paths;
2. activation-handshake persistence has one writer and revisioned CAS transitions;
3. control idempotency is committed atomically with the bounded state mutation;
4. the machine integrity key is create-once before control-plane bootstrap and cannot rotate in the initial protocol;
5. automatic candidate-to-route escalation is disabled and custom-generated nodes remain shadow-only;
6. one formal benchmark attempt is allowed per block/arm, with all reruns using replacement blocks.

The fifth review confirmed that most of those contracts now meet freeze precision but identified three remaining mechanical gaps. This revision closes them without changing the A0 architecture:

1. activation-only verification is explicitly separated from the fresh production lease/fence and production activation handshake required after the package becomes active;
2. launch authorization is consumed atomically by exactly one launch attempt, and retry issuance is defined for initial, active, pending, rollback, and stale-owner recovery paths;
3. `custom-shadow-only-v1` is a hard delivery-state cap: outcome evidence, governance maturity, promotion fields, and conservative-delivery logic cannot move a custom-origin node out of shadow-only in v1.

The sixth review accepted those three corrections but found four narrower lifecycle gaps. This revision closes them:

1. a gateway service controller may reissue an initial authorization after an exact terminal attempt that never acquired a supervisor lease;
2. launch attempts have their own revisioned state machine, terminal predicate, writers, and late-child rejection rules;
3. production handshakes bind the launch evidence that actually granted the current supervisor lease, without rewriting transition roles after the identity CAS;
4. package activation now uses an exhaustive state table with `uninitialized`, transition states, `active`, and `blocked`; undefined `stable` and `rollback_preparing` states are removed.

The seventh review accepted those corrections but found four remaining authority-closure gaps. This revision closes them:

1. launch authorization now has two explicit revision namespaces: immutable issuance revision and mutable authorization-row state revision;
2. spawned child identity is bound through a revisioned `reserved_unbound -> reserved_bound` CAS before supervisor lease acquisition;
3. every blocked package boundary has a distinct idempotent retry/cancel/rollback protocol covering identity, authorization, deadline, handshake, and lease/fence outcomes;
4. supervisor renewal, graceful release, verified process-exit revocation, and natural expiry compete on one lease-state revision and atomically terminalize the matching launch attempt.

The eighth review accepted those corrections but found five final cross-contract gaps. This revision closes them without changing the A0 architecture:

1. every worker-originated queue or semantic write now requires one canonical production-activation authority bound to the current complete handshake, activation revision, supervisor epoch, worker fence, configuration, route set, and schema;
2. `uninitialized` supports a revision-checked re-initialization at any nonnegative activation revision, so explicit initial cancellation does not create a dead state;
3. gateway package-authority writes are defined by one exhaustive whitelist rather than conflicting local “only” lists;
4. every fresh/no-fresh supervisor branch uses one canonical lease/attempt/process/epoch/revision predicate;
5. current package activation revision and historical launch activation revision are stored and compared independently throughout authorization, attempt, lease, and handshake evidence.

The ninth closed-scope review accepted the gateway writer whitelist and activation-revision separation, but found three remaining cross-section contradictions. This revision closes only those final blockers:

1. the Section 8 queue metadata and transition contract now carries the same activation revision, production-handshake id, supervisor epoch, and `production_write_authorized` guard as the canonical queue claim/commit protocol;
2. the remaining revision-zero-only initial-authorization sentence is replaced by the any-revision `initialize_package_activation` contract, while revision zero remains exclusive to absent-row empty-home bootstrap;
3. `fresh_supervisor_authority` is now an objective database authority predicate independent of caller expectations, with stale expected epoch/revision values used only by the outer mutation CAS.

The document also retains the earlier quality-contract and A0 carry-forward requirements:

1. route, validation, and benchmark assurance must be represented per capability rather than as one global model state
2. the evaluated recommended profile requires a minimum versioned local profile registry
3. custom-generated node provenance and the v1 shadow-only delivery cap must be independent from model self-claims; any future conservative canary policy requires a separate freeze
4. validation state must be machine-owned bounded state committed with an immutable configuration generation
5. multi-file initialization must use a crash-atomic generation pointer rather than best-effort rollback
6. queue states and failure metadata require a mechanical transition table
7. the A0-selected OpenClaw topology, supervisor ownership, worker lease, fencing, queue claim, SQLite, migration, shared-home, generation, restart, control, distribution, Windows, and activation contracts must be mechanically frozen
8. benchmark arms, statistical units, forced holdout, arm-neutral instrumentation, block manifests, failure/exclusion handling, and rerun rules must be frozen

The next sequence is:

```text
runtime and distribution reality baseline
-> product contract and schema freeze
-> provider validation
-> production learning failure semantics
-> status and doctor projection
-> minimal activation observability
-> diagnostics and feedback
-> evidence and public presentation
-> distribution release gates
-> evidence-driven core optimization
```

Phase 0.5A.0 completed without changing runtime semantics. Its selected target architecture is carried into this document as a design constraint, not as a supported capability.

The final three-blocker closure confirmation passed on `2026-07-11`, and Phase 0.5A.1 protocol freeze is approved. The eight independently reviewable OpenSpec slices subsequently passed independent slicing review. Runtime implementation may now begin with S1 package/home identity only; later slices remain dependency-gated.

## 2. Verified Current Reality

This section records current implementation facts. It is not a future product promise.

### 2.1 OpenClaw is currently interaction-only for background learning

The current OpenClaw runtime defaults are:

```text
OPENCLAW_BACKGROUND_LEARNING_ENABLED = false
OPENCLAW_HYBRID_POSTTASK_ENABLED = false
learningLoopState = interaction_only
```

The current OpenClaw safe overrides also force:

```text
embeddingProvider = legacy
hybridEnabled = false
hybridSyncExplainEnabled = false
hybridAsyncPostmortemEnabled = false
hybridAsyncPostmortemLlmEnabled = false
hybridExplainLlmEnabled = false
```

The copied OpenClaw runtime closure excludes at least:

```text
analyzer/llm-learning-gate.js
distillation/queue-worker.js
store/vector/api-embedding-provider.js
store/vector/local-provider.js
```

Therefore the current OpenClaw package can be validated for:

- plugin installation and gateway loading
- lifecycle event capture
- current task/input persistence that remains in the packaged closure
- retrieval and delivery of already-available experience supported by the packaged runtime
- routine interaction and governance writeback supported by the plugin

It must not currently be described as proving:

- provider-backed background candidate generation
- queue-backed distillation
- first learning decision produced inside the packaged OpenClaw runtime
- first formal node created by a ClawHub-only installation
- hybrid posttask review in the packaged OpenClaw runtime

### 2.2 ClawHub installation does not prove that `ee` is on `PATH`

The npm package exposes the `ee` binary, but a host-native plugin installation may install the package into a host-managed extension location rather than the user's global executable path.

The following must be verified independently:

- whether a ClawHub install exposes `ee`
- whether the plugin can invoke a package-local runtime command
- whether a separate global npm installation is required
- whether plugin and CLI processes resolve the same ExperienceEngine home

Until verified, the canonical path must not assume:

```text
openclaw plugins install ...
-> ee init
```

### 2.3 Current rule behavior is distributed across multiple stages

The current product has several distinct deterministic or rule-backed behaviors.

#### Rule-generated learning content

The learning gate may call deterministic experience analysis when:

- no LLM endpoint is available
- the provider request fails

This can generate new candidate drafts.

#### Passthrough or rule distillation

The distiller may generate a rule/passthrough result when provider-backed distillation is unavailable and passthrough is allowed.

#### Deterministic control and safety behavior

Deterministic behavior is also used for:

- learning eligibility
- retrieval gates
- applicability checks
- merge control
- delivery-state enforcement
- skip decisions
- harm circuit breakers
- attribution fallback
- lifecycle governance

These safety and control rules are not equivalent to rule-generated semantic learning content and must not be removed.

### 2.4 Current queue semantics do not support provider pause/resume

The current distillation worker:

- drains `pending` jobs
- retries `failed` jobs below the retry limit
- increments retry counts on failure
- moves work to `discarded` after the retry budget is exceeded

This model does not distinguish:

```text
the provider or configuration is temporarily unavailable
```

from:

```text
this specific candidate cannot be processed successfully
```

Long provider outages can therefore consume content retry budgets and discard otherwise valid work.

### 2.5 `Initialized` currently means configured, not validated

The current setup model considers shared state initialized when provider and model fields are present.

It does not prove:

- credentials are valid
- the endpoint is reachable
- the model accepts ExperienceEngine's request shape
- the response satisfies the learning or distillation contract
- embedding write/query is healthy
- the selected model has benchmark-backed ExperienceEngine quality

The revised design must preserve the existing setup term while adding separate assurance and health projections.

### 2.6 Existing first-value semantics remain authoritative

Current onboarding semantics allow `First value reached` after visible output from real work, including:

- the first visible real task record
- the first visible learning decision
- the first visible intervention

The revised design must not redefine first value as only a confirmed helpful intervention.

A separate deeper milestone may be introduced:

```text
First outcome-confirmed value
```

### 2.7 Existing evaluation infrastructure must be extended, not replaced

The repository already contains:

- OpenClaw baseline evaluation
- OpenClaw scenario evaluation
- Codex lifecycle validation
- benchmark report generation
- benchmark summaries
- evaluation bundles
- case-study and evidence-package patterns
- holdout/shadow concepts

The next evidence program should evolve these assets into matched treatment/holdout/no-EE evaluation rather than creating a parallel benchmark framework.

## 3. Product Principles

### 3.1 Quality-preserving simplification

Acceptable simplification includes:

- detecting existing provider environment variables
- reusing shared credentials with explicit user consent
- validating candidate configuration before committing it
- recommending evaluated model routes
- reusing shared ExperienceEngine configuration across hosts
- avoiding repeated prompts for already-valid configuration
- generating exact repair guidance
- preserving blocked work until the learning route recovers

Unacceptable simplification includes:

- silently switching to rule-generated semantic learning
- silently switching to an unevaluated weak model
- reporting production readiness when only configuration fields exist
- creating weak nodes only to shorten time-to-first-node metrics
- lowering learning eligibility or delivery safety to improve activation numbers
- claiming a ClawHub-only full learning path before the published artifact proves it

### 3.2 Provider-backed production learning

The supported production learning route requires:

- an explicit supported or compatible provider route
- successful ExperienceEngine contract validation
- a valid embedding route for the configured profile
- host/runtime wiring appropriate to the selected distribution architecture

Rule-generated semantic learning remains available only for:

- backward compatibility
- deterministic tests
- explicit developer experiments
- explicitly selected recovery workflows that do not claim production-equivalent quality

### 3.3 Existing governed experience is independent from current learning health

A provider outage affects new learning and optional LLM review.

It does not automatically invalidate already-governed nodes.

Already-governed nodes may continue to be retrieved and delivered when:

- their delivery state permits it
- repo/scope policy permits it
- current retrieval and applicability gates permit it
- no current harm or quarantine gate blocks them

### 3.4 Do not create a second event ledger

Activation and value progress should be derived from existing records whenever possible.

New persistence is allowed only for facts that cannot be recovered reliably from existing state, such as:

- configuration validation records
- a precise learning-decision timestamp if the existing task record cannot express it
- a bounded first-ready marker if product measurement truly requires it

## 4. OpenClaw And ClawHub Product Boundary

### 4.1 Current supported boundary

Until a new architecture is implemented and validated, the product must distinguish:

#### OpenClaw interaction runtime

The currently packaged plugin path provides the verified plugin/runtime capabilities that are actually present in the artifact.

#### Full ExperienceEngine learning runtime

Provider-backed candidate generation, queue processing, provider validation, and full background learning require a separately verified runtime path.

The docs must not imply that these two are already identical.

### 4.2 Architecture alternatives evaluated in Phase 0.5A.0

Phase 0.5A.0 evaluated the OpenClaw target across three independent decision axes. A control surface is not itself an execution architecture.

#### Execution placement

```text
- gateway_process
- package_local_companion
- separately_installed_runtime
```

`gateway_process` places the complete learning runtime inside the OpenClaw plugin process.

Advantages:

- one host-native install
- no separate worker process

Risks:

- gateway stability and resource coupling
- larger packaged runtime closure
- background queue lifecycle tied to the gateway
- more difficult provider recovery and upgrade isolation

`package_local_companion` keeps lifecycle capture and prompt-time delivery in the plugin while a worker shipped in the same package handles:

- provider validation
- candidate generation
- distillation queue
- optional posttask LLM review
- queue pause/resume

Advantages:

- preserves one package/distribution target
- isolates learning failures from the gateway hot path
- does not require a global `ee` binary on `PATH`

Risks:

- process startup, ownership, and recovery must be designed
- OpenClaw support for launching or supervising it must be verified
- shared-database concurrency and upgrade compatibility become product requirements

`separately_installed_runtime` keeps the plugin plus a separately installed global EE runtime/CLI.

Advantages:

- closest to the current full-runtime architecture
- clear separation of plugin and learning worker responsibilities

Risks:

- two installation channels
- ClawHub-only installation remains incomplete
- PATH and shared-home ambiguity
- more onboarding and repair complexity

#### Lifecycle ownership

```text
- openclaw_gateway
- package_local_supervisor
- operator_or_os_service
```

Any lifecycle-owner choice had to define:

- single-worker ownership
- duplicate-start prevention
- stale worker lease recovery
- crash and gateway-restart behavior
- orphan worker cleanup
- graceful shutdown
- version compatibility during package upgrade

#### Control surface

```text
- openclaw_native
- package_local_command
- global_ee_cli
```

An OpenClaw-native command or service surface may control any of the execution placements above. It must not be treated as a fourth peer execution architecture.

### 4.3 Accepted target architecture

Phase 0.5A.0 selected:

```text
execution placement: package_local_companion
lifecycle ownership: package_local_supervisor
control surface: openclaw_native
shared state: one explicit ExperienceEngine home
```

This target preserves:

- host-native installation
- production learning quality
- gateway hot-path isolation
- one shared data/governance store
- CLI as fallback rather than mandatory first interaction

It is not implemented or supported in v0.4.8.

The A0 ADR remains authoritative for architecture selection. The more specific A1 contracts below supersede the ADR only where they add mechanical fields, state transitions, transaction predicates, or acceptance rules.

### 4.4 Shared database and process-safety gate

Phase 0.5A.0 validated the feasibility and current gaps for the following shared-home process-safety requirements; Phase 0.5A.1 freezes their mechanics:

- only one learning worker owns runnable queue work at a time
- duplicate process startup is rejected or converges safely
- stale worker leases recover after crash
- SQLite writer contention remains bounded
- whether WAL is required for the selected process model
- schema bootstrap and migration have one owner
- simultaneous plugin/worker startup cannot race migrations
- gateway restart does not leave an orphan worker
- package upgrade cannot run incompatible old and new workers against the same schema
- repair and rollback preserve database and worker ownership invariants

The current database configuration's `busy_timeout` is not by itself a cross-process ownership or migration protocol.

### 4.5 Canonical activation publication remains blocked

The architecture is selected, but the activation path is not publishable until implementation and published-artifact validation succeed.

Current public documentation may describe only verified interaction-only behavior and must distinguish:

- npm-spec installation from ClawHub artifact installation
- CLI inspection from live gateway activation
- interaction capability from full learning capability
- package-local controls from a globally installed `ee` CLI

### 4.6 Phase 0.5A.1 A0 carry-forward contract set

Phase 0.5A.1 must freeze all of the following before implementation slicing:

1. process topology and component write ownership
2. package-local supervisor lifecycle, heartbeat, crash, and restart budget
3. singleton worker lease and stale takeover
4. fencing for every protected write
5. atomic queue claim, renewal, completion, and interruption recovery
6. system/interruption attempts separated from candidate-content retry
7. WAL, transaction bounds, busy handling, and lock-failure mapping
8. schema versioning, migration ownership, compatibility, and plugin warming/read-only behavior
9. canonical shared-home resolution and home-identity agreement
10. package identity, package generation, artifact integrity, and compatibility ranges
11. gateway restart, worker crash, orphan cleanup, upgrade, and rollback mechanics
12. OpenClaw-native controls and deterministic status projection
13. ClawHub/published artifact closure and executable dependency validation
14. Windows executable resolution without extensionless PATH assumptions
15. a live activation predicate stronger than install metadata or CLI inspection

These contracts do not enable the runtime. They define the minimum semantics that later implementation must satisfy.

### 4.7 Process topology and write ownership

Canonical topology:

```text
OpenClaw gateway process
  -> ExperienceEngine gateway plugin
       -> package-local supervisor process
            -> package-local learning worker process
```

Component ownership is exclusive:

| Component | Allowed writes | Forbidden responsibilities |
| --- | --- | --- |
| Gateway plugin/service controller | Short idempotent producer records, explicit user feedback, insertion of `requested` activation-handshake rows, gateway heartbeat, launch reservation/child-binding/pre-lease terminal CAS, natural-expiry or verified-exit lease/attempt terminal transaction, the exhaustive package-authority whitelist including revision-zero bootstrap and any-revision initialization, deterministic retry/recovery authorization, active-generation restart authorization, bounded gateway-owned blocked exits | Later activation-handshake transitions, package-authority writes outside the whitelist, learning-table/schema migration, queue claim, capability route-health mutation, semantic provider work |
| Package-local supervisor | Supervisor/worker leases, lease renewal and graceful lease/attempt terminal transaction, package-generation and launch-authorization authority after bootstrap, supervisor-owned blocked exits, control mutation plus idempotency result, activation-handshake transitions, runtime-route projection, restart/orphan records | Semantic candidate/node generation, long provider calls, accepting stale worker acknowledgments |
| Learning worker | Production-activation-authorized and fenced queue claims/results; activation acknowledgment returned only through package-local IPC | Supervisor authority, package activation pointer, direct activation-handshake table writes, schema migration without migration ownership, any learning write under a lease/fence without the current production handshake predicate |
| Migration owner | Schema metadata and migration steps under a migration lease | Queue processing or semantic generation while migration is active |

All long provider calls occur outside SQLite transactions.

The plugin may remain available for bounded interaction/status while learning is warming or blocked, but it must not report full learning as active until the live activation predicate passes.

#### Stable control-plane bootstrap

The shared ExperienceEngine database contains a small versioned control-plane schema used before ordinary learning tables are considered ready.

Minimum control-plane tables:

```text
runtime_control_meta
gateway_heartbeats
supervisor_launch_state
supervisor_launch_attempts
supervisor_leases
worker_leases
migration_state
configuration_generations
configuration_pointer
package_activation_state
package_launch_authorizations
control_request_idempotency
activation_handshakes
```

The control plane stores ownership, compatibility, pointer, and current-state authority. It is not a second event ledger and stores no task transcript, candidate semantic content, node content, or secret value.

Minimum `runtime_control_meta` fields:

```text
control_schema_version
home_id
home_layout_version
path_normalization_version
normalized_path_fingerprint
integrity_key_id
home_path_fingerprint_key_id
database_relative_path
created_at
```

Bootstrap rules:

- the canonical home path plus the versioned home-layout contract resolves the shared database path before configuration generation loading;
- before the control-plane database is opened or created, the gateway service controller, package-local initializer, or supervisor must complete the machine-integrity-key create-or-adopt protocol;
- only the package-local initializer, gateway service controller, or supervisor may create the fixed control-plane bootstrap schema;
- bootstrap runs in a bounded exclusive SQLite transaction and uses a versioned idempotent bootstrap DDL;
- concurrent empty-home bootstrap attempts serialize and converge on the same `control_schema_version`;
- the first successful bootstrap stores the adopted `integrity_key_id`, `path_normalization_version`, and `home_path_fingerprint_key_id` in `runtime_control_meta` together with `home_id` and the normalized path fingerprint;
- a losing bootstrap must adopt the committed key and home identity; a mismatch fails closed and cannot replace the committed identity;
- ordinary gateway hook paths never create, alter, or migrate tables;
- the gateway service controller's sole schema exception is the fixed empty-home control-plane bootstrap; it may not alter an existing control schema or any learning table;
- after bootstrap, all control-schema changes require the normal migration-ownership protocol;
- an unknown or unsupported control-schema version produces `blocked_incompatible`, not opportunistic repair.

The fixed bootstrap schema breaks the circular dependency between “a lease is required to migrate” and “the lease table does not exist yet.” It may create only the minimum authority tables; legacy learning-table changes remain owned by the migration protocol.

### 4.8 Package-local supervisor lifecycle contract

One supervisor authority exists per canonical ExperienceEngine home and host integration.

The gateway plugin includes a minimal package-local service controller. This controller is not the learning worker and does not own semantic/runtime correctness. It owns only:

- resolving the supervisor entrypoint from the current package generation;
- spawning the supervisor process;
- observing supervisor process exit;
- applying the bounded supervisor launch/restart budget;
- publishing the current gateway-instance heartbeat;
- forwarding graceful drain/stop requests.

Minimum gateway heartbeat record:

```text
home_id
gateway_instance_id
gateway_process_id
gateway_process_start_token
package_generation_id
heartbeat_at
expires_at
```

Minimum supervisor launch state:

```text
home_id
launch_revision
gateway_instance_id
package_generation_id
launch_authorization_id
launch_authorized_generation_id
launch_authorization_role: initial_candidate | active | pending | rollback_candidate
launch_authorization_revision
launch_authorization_state_revision
expected_current_activation_revision
expected_active_package_generation_id
expected_pending_package_generation_id
current_launch_attempt_id
launch_owner_gateway_instance_id
launch_owner_process_start_token
restart_window_started_at
launch_count_in_window
last_supervisor_owner_id
last_process_exit_code
last_process_exit_at
next_launch_at
launch_started_at
launch_expires_at
launch_state: idle | launching | running | backoff | blocked | stopping
last_failure_code
```

Every issued launch authorization has its own monotonic authority row in `package_launch_authorizations`:

```text
home_id
launch_authorization_id
authorization_revision
authorization_state_revision
authorization_state: issued | consumed | expired | cancelled
authorized_package_generation_id
authorization_role: initial_candidate | active | pending | rollback_candidate
launch_activation_revision_at_issuance
expected_active_package_generation_id
expected_pending_package_generation_id
issued_by_kind: gateway_service_controller | supervisor
issued_by_gateway_instance_id
issued_by_supervisor_owner_id
issued_by_supervisor_lease_epoch
issued_at
expires_at
consumed_by_launch_attempt_id
consumed_at
terminal_at
terminal_code
```

The two authorization revision namespaces are distinct:

- `authorization_revision` is the immutable issuance revision. Each newly inserted authorization receives the next monotonically increasing value for the home package-activation authority. It never changes after insertion.
- `authorization_state_revision` is the mutable CAS revision of that one authorization row. It begins at `1` in state `issued` and increments on the single transition to `consumed`, `expired`, or `cancelled`.

`package_activation_state.launch_authorization_revision` projects the immutable issuance revision of the current authorization pointer. `package_activation_state.launch_authorization_state_revision` projects the current row-state revision. `supervisor_launch_state`, attempt evidence, supervisor lease evidence, and activation handshakes never infer one revision from the other.

Authorization identity, immutable issuance revision, generation, role, `launch_activation_revision_at_issuance`, expected package identities, and issuer provenance are immutable after insertion. `launch_activation_revision_at_issuance` is copied from the current package `activation_revision` at authorization insertion and remains historical even when package activation later advances. Only `authorization_state_revision`, state, and matching consumed/terminal evidence may advance. `consumed`, `expired`, and `cancelled` are terminal authorization states. A terminal authorization row is never overwritten or reactivated. `package_activation_state.launch_authorization_id` points to the current authorization row and may advance to a newly inserted id; it does not erase the prior row.

Authorization transitions are mechanical:

| Transition | Persistent writer | Required CAS predicate |
| --- | --- | --- |
| absent -> `issued` | current supervisor, or gateway service controller only through the exhaustive whitelist | new authorization id; next expected immutable `authorization_revision`; `authorization_state_revision = 1`; `launch_activation_revision_at_issuance` equals current package activation revision; expected current-pointer revisions; exact deterministic generation/role; writer provenance valid; deadline/budget valid |
| `issued -> consumed` | launch-owning gateway service controller in the spawn CAS | exact authorization id, immutable authorization revision, and expected state revision; package current pointer/revisions match; authorization unexpired; unique attempt insertion succeeds |
| `issued -> expired` | current fresh supervisor authority, or gateway only through `expire_or_cancel_unconsumed_authorization` when freshness is false | exact authorization id/state revision; `expires_at` elapsed; no consumed attempt id and no attempt row exists |
| `issued -> cancelled` | current fresh supervisor authority, or gateway only through the whitelist before any attempt exists | exact authorization id/state revision; current package identities/transition still match; no consumed attempt id and no attempt row exists |

Every transition updates the authorization row and the matching `package_activation_state` current-authorization projection in one `BEGIN IMMEDIATE` transaction when that authorization is still current. A stale historical authorization may be observed as terminal but never becomes current again. `consumed` records `terminal_at = consumed_at` and the unique attempt id; `expired` and `cancelled` record their stable terminal code/time.

`supervisor_launch_state` is the current controller projection and retry-budget authority. Individual attempts are never overwritten in that row. They are stored in `supervisor_launch_attempts`:

```text
home_id
launch_attempt_id
attempt_state_revision
attempt_state: reserved_unbound | reserved_bound | lease_acquired | spawn_failed | timed_out | cancelled | lease_expired | terminated
launch_authorization_id
launch_authorization_revision
launch_authorization_state_revision_at_consumption
launch_authorization_role
package_generation_id
launch_activation_revision_at_consumption
expected_active_package_generation_id
expected_pending_package_generation_id
launch_owner_gateway_instance_id
launch_owner_process_start_token
child_process_id
child_process_start_token
supervisor_owner_id
supervisor_lease_epoch
reserved_at
attempt_expires_at
lease_acquired_at
terminal_at
terminal_code
```

`launch_attempt_id` and `launch_authorization_id` are each unique in this table. `launch_authorization_revision` is the immutable issuance revision; `launch_authorization_state_revision_at_consumption` is the authorization row revision produced by the atomic `issued -> consumed` transition; `launch_activation_revision_at_consumption` copies the authorization's historical launch revision. Attempt rows are monotonic authority records: identity and authorization-binding fields are immutable after insertion; only the revisioned attempt state and its corresponding child/lease/terminal evidence may advance through the allowed transitions. `supervisor_launch_state.current_launch_attempt_id` is a projection pointer, not the historical authority.

Current package activation and historical launch activation use separate revision domains:

```text
package_activation_state.activation_revision
  = current package transition/activation authority revision

package_launch_authorizations.launch_activation_revision_at_issuance
supervisor_launch_attempts.launch_activation_revision_at_consumption
supervisor_leases.launch_activation_revision_at_consumption
activation_handshakes.launch_activation_revision_at_consumption
  = immutable historical package revision under which the current supervisor launch was authorized
```

Authorization insertion requires the historical launch revision to equal the then-current package activation revision. Consumption, child binding, lease acquisition, and later handshake validation preserve that historical value. A pending-to-active identity CAS or same-supervisor blocked retry may increment current package activation revision without changing historical launch evidence. Equality is required only at authorization issuance and when validating the authorization/attempt/lease evidence chain, not after every package state transition.

Before each spawn, the plugin service controller performs one `BEGIN IMMEDIATE` CAS that requires:

- `fresh_supervisor_authority = false`;
- no unexpired `launching` attempt is owned by another live gateway heartbeat;
- `next_launch_at` is due;
- the expected `launch_revision`, gateway instance, activation revision, active generation, and pending generation still match;
- `package_activation_state` points to the same authorization id, immutable issuance revision, and expected state revision, and the exact `package_launch_authorizations` row is still `issued` at those revisions;
- `launch_authorized_generation_id` equals the generation being spawned;
- `launch_authorization_role` is valid for the current package-activation state;
- the launch authorization has not expired and, when activation state is preparing/draining/migrating/preactivation-verifying/production-activating, `activation_deadline_at` has not expired;
- the restart budget remains available.

The winning CAS consumes the authorization and reserves the launch attempt in one transaction:

1. create a unique `launch_attempt_id`;
2. change the exact `package_launch_authorizations` row from `issued` to `consumed` using its immutable authorization revision and expected authorization-state revision;
3. set its consumed attempt/time, increment `authorization_state_revision`, and update only the matching current-authorization state-revision projection in `package_activation_state`; the immutable issuance revision does not change;
4. insert one `supervisor_launch_attempts` row with `attempt_state = reserved_unbound`, `attempt_state_revision = 1`, the immutable authorization revision, the consumed authorization-state revision, immutable activation bindings, cleared child/lease/terminal fields, and an attempt expiry no later than the authorization expiry;
5. set `supervisor_launch_state.current_launch_attempt_id` to that row and copy the current authorization projection;
6. record launch owner/start identity, set aggregate launch state `launching`, increment `launch_revision`, and increment the launch count before process creation.

One authorization therefore maps to exactly one launch attempt. A crash or process-spawn failure after this transaction leaves the authorization consumed at the exact state revision recorded by the attempt; it cannot be replayed.

Launch-attempt transitions are mechanical:

| Transition | Persistent writer | Required CAS predicate |
| --- | --- | --- |
| `reserved_unbound -> reserved_bound` | launch-owning gateway service controller | exact attempt id and expected attempt-state revision; exact launch-owner gateway identity; expected controller launch revision/current attempt pointer; child fields null; process creation succeeded; authorization/attempt unexpired; bind exact child PID/start token and increment attempt revision |
| `reserved_unbound -> spawn_failed` | launch-owning gateway service controller | exact attempt id and expected attempt-state revision; expected launch revision/current pointer; child fields null; no supervisor lease was acquired; process creation returned failure |
| `reserved_unbound -> timed_out` | launch-owning or current gateway service controller | exact attempt id and expected attempt-state revision; expected launch revision/current pointer; attempt expiry elapsed; child binding absent; no lease was acquired |
| `reserved_unbound -> cancelled` | current gateway service controller | exact attempt id and expected attempt-state revision; expected launch revision/current pointer; shutdown/transition cancellation authoritative; child binding absent; no lease acquired |
| `reserved_bound -> lease_acquired` | child supervisor in the supervisor-lease acquisition transaction | exact attempt id/authorization revisions; expected attempt-state revision from the completed child-binding CAS; exact bound child identity; attempt and authorization unexpired; no fresh competing supervisor lease |
| `reserved_bound -> timed_out` | launch-owning or current gateway service controller | exact attempt id/revision; expected launch revision/current pointer; attempt expiry elapsed; no lease was acquired |
| `reserved_bound -> cancelled` | current gateway service controller | exact attempt id/revision; expected launch revision/current pointer; authoritative shutdown/transition cancellation; no lease acquired |
| `reserved_bound -> terminated` | launch-owning or current gateway service controller | exact attempt id/revision, expected launch revision/current pointer, and exact bound child identity has exited before lease acquisition |
| `lease_acquired -> lease_expired` | current gateway service controller in the natural-expiry transaction | exact attempt id/revision, expected launch revision/current pointer, matching supervisor owner/epoch and lease revision, exact stored lease expiry elapsed, no renewal CAS won; lease and attempt terminalize atomically |
| `lease_acquired -> terminated` | current supervisor in graceful release, or current gateway service controller in verified process-exit revocation | exact attempt id/revision, expected launch revision/current pointer, matching supervisor owner/epoch and lease revision; lease and attempt terminalize atomically under the transaction defined below |

Each transition increments the exact attempt row's `attempt_state_revision`, records the child-binding, terminal, or lease-acquisition fields, and updates aggregate `launch_state`/current-attempt projection in the same `BEGIN IMMEDIATE` transaction. `spawn_failed`, `timed_out`, `cancelled`, `lease_expired`, and `terminated` are terminal attempt states. `reserved_unbound`, `reserved_bound`, and `lease_acquired` are nonterminal.

Every attempt transition CAS also requires the expected `supervisor_launch_state.launch_revision` and `current_launch_attempt_id` to match the exact attempt. A controller holding an older launch revision cannot terminate, acquire, time out, or cancel a newer attempt. Once the current pointer advances to a replacement attempt, prior terminal rows are immutable history and accept no further transition.

Process creation occurs only for the current `reserved_unbound` attempt. Successful process creation does not by itself authorize the child. The launch-owning controller must complete `reserved_unbound -> reserved_bound` through the revisioned child-binding CAS before the child may acquire a supervisor lease. A repeated bind is idempotent only when the exact child identity and resulting attempt revision already match; a different identity is rejected. A new gateway controller cannot invent or replace child identity for an existing attempt. If the launch owner crashes before binding, the child cannot acquire authority and the attempt eventually transitions to `timed_out`.

Process-creation failure performs `reserved_unbound -> spawn_failed`. Failure to persist that CAS leaves the attempt `reserved_unbound` until timeout; it does not make the authorization reusable. A child that exits after binding but before lease acquisition is terminalized through `reserved_bound -> terminated` using exact child identity evidence.

The service controller changes aggregate launch state to `running` only in the same transaction that changes the exact attempt to `lease_acquired`. A timeout or pre-lease terminal transition changes aggregate state to `backoff` when retry remains allowed, or `blocked` when the launch/activation budget is exhausted. `backoff` is a controller scheduling state, not an attempt terminal state.

A late child is rejected when the attempt is not `reserved_bound`, the child-binding revision does not match, the attempt/authorization is expired, its process identity differs, or its expected attempt-state/launch revision no longer matches. It cannot acquire a lease directly from `reserved_unbound` or after `spawn_failed`, `timed_out`, `cancelled`, `lease_expired`, or `terminated`. A process still alive after `lease_expired` is fenced stale authority and cannot block a deterministic replacement launch.

A losing gateway service controller does not spawn. It observes the current launch/supervisor state and exposes status for the existing owner.

Launch authorization is an explicit bounded authority, not an inference from “current package generation.”

`package_activation_state` is the authority for package identity/transition and the current authorization pointer. `package_launch_authorizations` is the authority for authorization issuance/consumption/terminal history. `supervisor_launch_attempts` is the authority for the exact authorization-to-attempt binding and attempt lifecycle. `supervisor_launch_state` only projects the current attempt and scheduling state. All four must match in the spawn CAS; later retries never mutate or erase prior authorization or attempt rows.

Allowed authorization predicates:

| Activation condition | Authorized generation | Required role | Allowed purpose |
| --- | --- | --- | --- |
| exact pending generation with `pending_transition_kind = initial`, created by `initialize_package_activation` at any expected uninitialized revision | exact pending generation | `initial_candidate` | bootstrap, migration, validation, preactivation handshake |
| `active` with no package transition, or `production_activating` after the active identity CAS | current active generation | `active` | ordinary supervisor recovery, production-handshake recovery, and runtime operation |
| exact pending generation with `pending_transition_kind = upgrade` | exact pending generation | `pending` | migration, validation, health probes, preactivation handshake only |
| exact pending generation with `pending_transition_kind = rollback` | exact pending generation | `rollback_candidate` | compatibility checks, preactivation handshake, rollback activation only |

The `active` row authorizes a launch only when a supervisor must be started or replaced. It does not require an already-running transition supervisor to obtain a second authorization after the package identity CAS.

Initial launch authorization may be created only through `initialize_package_activation` for an exact `uninitialized` package-activation revision `N >= 0`. Revision zero is required only when `bootstrap_package_activation_authority` creates an absent authority row in a fixed empty home. `initialize_package_activation` requires verified package closure, no active/pending/previous generation, and no current transition/authorization/handshake pointer; it creates the new pending initial generation, deadline, launch-budget window, and new `initial_candidate` authorization in the same `BEGIN IMMEDIATE` transaction without overwriting historical authorization, attempt, lease, or handshake rows.

For an ordinary start or restart of the current active generation, the gateway service controller may create one `active` launch authorization only when package activation is `active` or `production_activating`, the generation exactly equals `active_package_generation_id`, no pending generation exists, `fresh_supervisor_authority = false`, and the expected current activation revision plus both current authorization revisions still match. This bounded transaction may change only launch-authorization fields; it cannot change active, pending, or previous package identity.

For upgrade and rollback, the current package-activation authority may issue the first authorization before drain. After the prior supervisor lease expires, a bounded gateway-service-controller retry transaction may issue a replacement authorization only for the deterministic generation and role derived from the unchanged package-activation state. A plugin cannot authorize an arbitrary package generation.

For initial activation when the consumed attempt never acquired a supervisor lease, the current gateway service controller is explicitly authorized to issue the replacement authorization even though no prior supervisor lease row exists. The retry CAS requires the exact pending initial generation, unchanged active/pending/previous identities, the prior exact attempt in `spawn_failed`, `timed_out`, `cancelled`, or pre-lease `terminated`, `lease_acquired_at IS NULL`, `fresh_supervisor_authority = false`, a current gateway heartbeat, remaining launch budget, and an unexpired activation deadline. It leaves the prior attempt and consumed authorization rows unchanged, writes gateway provenance, inserts a new authorization row/id, advances the package current-authorization pointer/revision, and leaves package identities unchanged. If the deadline is expired, the same authority may only CAS activation to `blocked`; it cannot issue another authorization.

Authorization retry rules are mechanical:

- a new authorization inserts a new random `launch_authorization_id` authority row and advances the current pointer/revision in `package_activation_state`;
- issuance sets the new row state `issued` and an expiry no later than the pending transition's activation deadline when one exists; prior authorization rows remain unchanged;
- `issued -> consumed` occurs only in the atomic spawn CAS; `issued -> expired` occurs only after authorization expiry with no successful consumption; `issued -> cancelled` requires the current package authority to abort or replace the exact transition;
- `consumed`, `expired`, and `cancelled` never transition back to `issued`; reissue always creates a new authorization id and revision;
- when the prior authorization was consumed, reissue requires its exact launch attempt to be in a terminal attempt state; when an unconsumed authorization became `expired` or `cancelled`, reissue requires `launch_authorization_consumed_by_attempt_id IS NULL` and no launch attempt for that authorization;
- every gateway reissue additionally requires `fresh_supervisor_authority = false`, a current gateway heartbeat, remaining launch budget, and an unexpired activation deadline whenever an activation transition is active;
- supervisor-lease absence is a valid retry condition when the exact terminal attempt has `lease_acquired_at IS NULL`; an expired prior lease is required only when that attempt previously reached `lease_acquired`;
- initial activation deterministically selects the exact pending generation with `pending_transition_kind = initial` and role `initial_candidate`;
- upgrade deterministically selects the exact pending generation with `pending_transition_kind = upgrade` and role `pending`;
- rollback deterministically selects the exact pending generation with `pending_transition_kind = rollback` and role `rollback_candidate`;
- ordinary recovery with no pending generation selects the exact active generation and role `active`;
- stale-owner recovery is an authorization issuer path, not a separate package role or worker mode;
- if the activation deadline expires, package activation becomes `blocked` and no automatic authorization is issued.

Every authorization is single-use. A late process from an old or consumed authorization cannot acquire the supervisor lease even when its package files still exist.

Initial activation timing policy:

```text
policy_version: package-activation-v1
activation_deadline_ms: 600000
launch_authorization_ttl_ms: 60000
launch_attempt_timeout_ms: 30000
preactivation_handshake_ttl_ms: 60000
production_handshake_ttl_ms: 60000
```

For pending transitions and `production_activating`, authorization expiry is `min(issued_at + launch_authorization_ttl_ms, activation_deadline_at)`. For an ordinary `active` runtime restart with no activation transition, authorization expiry is `issued_at + launch_authorization_ttl_ms`. A launch-attempt expiry is `min(launch_started_at + launch_attempt_timeout_ms, launch_authorization_expires_at)`. A consumed authorization that acquired a valid supervisor lease before expiry remains historical launch evidence; subsequent transition progress is bounded by `activation_deadline_at`, supervisor/worker leases, and handshake expiry rather than by extending or reusing that authorization.

Preactivation handshake expiry is `min(requested_at + preactivation_handshake_ttl_ms, activation_deadline_at)`. Production handshake expiry during `production_activating` is `min(requested_at + production_handshake_ttl_ms, activation_deadline_at)`; during an ordinary active-runtime restart it is `requested_at + production_handshake_ttl_ms`.

Minimum supervisor lease record:

```text
supervisor_lease_key
home_id
owner_id
owner_process_id
owner_process_start_token
gateway_instance_id
launch_attempt_id
launch_authorization_id
launch_authorization_revision
launch_authorization_state_revision_at_consumption
launch_authorization_role
launch_activation_revision_at_consumption
package_generation_id
artifact_integrity
supervisor_protocol_version
lease_state_revision
lease_epoch
state: starting | active | draining | backoff | blocked | stopped | expired
launch_attempt_state_revision_at_acquisition
worker_restart_window_started_at
worker_restart_count_in_window
started_at
heartbeat_at
expires_at
shutdown_requested_at
lease_terminal_at
lease_terminal_reason: graceful_release | verified_process_exit | natural_expiry
last_failure_code
```

`owner_process_start_token` is a process-start identity or random boot nonce persisted by the process. PID alone is never sufficient identity.

#### Canonical fresh-supervisor predicate

Every phrase `fresh supervisor`, `fresh supervisor lease`, `healthy current supervisor`, or `no fresh supervisor` in this contract refers to one mechanical predicate evaluated at a captured `observed_now` inside the governing transaction.

`fresh_supervisor_authority(home_id, observed_now)` is true only when exactly one supervisor lease row satisfies all of:

```text
lease state in {starting, active, draining, backoff, blocked}
lease_terminal_at IS NULL
expires_at > observed_now
owner_id, owner_process_id, and owner_process_start_token are all present
the row is the unique current supervisor lease authority for home_id
launch_attempt_id = supervisor_launch_state.current_launch_attempt_id
matching launch attempt state = lease_acquired
matching attempt supervisor owner/epoch = lease owner/epoch
matching attempt child identity = lease process identity
matching attempt authorization/activation evidence = lease launch evidence
```

States `stopped` and `expired`, any non-null terminal time, an elapsed lease expiry, a non-`lease_acquired` attempt, a mismatched current-attempt pointer, or any mismatch between the authoritative lease row and its attempt/process/authorization evidence make the predicate false. `backoff` and `blocked` remain fresh authority states while the lease predicate is true; they limit runtime work but do not silently transfer package-authority ownership to the gateway.

Caller-supplied expected owner, epoch, or lease-state revision are not inputs to `fresh_supervisor_authority`. They are outer mutation-CAS predicates. When objective freshness is true but a caller's expected values differ from the authoritative current lease row, that caller is stale and the mutation is rejected; freshness does not become false. A gateway operation requiring no fresh supervisor must prove that no authoritative lease row satisfies this objective predicate at the transaction's captured `observed_now`.

Gateway heartbeat is deliberately not part of supervisor freshness. A fresh supervisor remains the sole package-authority writer until it atomically releases, is revoked by exact process-exit evidence, or reaches natural lease expiry. A gateway service controller may execute a gateway-owned recovery or mutation only when `fresh_supervisor_authority = false` and its own gateway heartbeat/identity predicate is current. Loss of gateway heartbeat instructs the supervisor to drain, but it does not give another gateway concurrent authority before the supervisor lease becomes terminal.

Supervisor acquisition protocol:

1. resolve the canonical home and `home_id`;
2. validate package identity, supervisor protocol compatibility, and the unexpired launch attempt owned by the current gateway instance;
3. execute `BEGIN IMMEDIATE`;
4. read the current supervisor lease;
5. insert when absent only when the exact authorization row is `consumed`, its immutable issuance revision, consumed state revision, and historical launch activation revision equal the attempt evidence, its consumed-attempt id equals the presented attempt, `package_activation_state` still points to the same authorization for this launch, and the exact attempt row is `reserved_bound` at the child-binding revision with matching authorization/activation identities, child identity, and unexpired deadline;
6. in the same transaction insert/take over the supervisor lease with `lease_state_revision = 1`, copy the immutable authorization/attempt evidence including `launch_activation_revision_at_consumption` into the lease, increment `lease_epoch` on every takeover, and CAS the exact attempt `reserved_bound -> lease_acquired` with the resulting supervisor owner/epoch and `lease_acquired_at`;
7. renew only through a lease-revision CAS when owner identity, `lease_epoch`, launch attempt, and attempt state `lease_acquired` all match; replace only after the prior lease/attempt authority has been atomically terminalized and a newly consumed current launch attempt authorizes takeover;
8. commit before spawning or adopting a worker, then publish heartbeat before `expires_at` using a versioned interval policy.

Supervisor lease renewal and launch-attempt terminalization share one revision domain and are mutually exclusive CAS outcomes:

| Transaction | Persistent writer | Required CAS predicate | Atomic result |
| --- | --- | --- | --- |
| lease renewal | current supervisor owner | exact owner/process identity, lease epoch, expected `lease_state_revision`, lease state in `starting | active | draining`, exact launch attempt in `lease_acquired` at expected attempt revision, expected controller launch revision/current pointer, current heartbeat not superseded | advance heartbeat/expiry and increment `lease_state_revision`; attempt remains `lease_acquired` |
| graceful supervisor release | current supervisor owner after worker drain/release | exact owner/epoch and lease revision; exact attempt/revision; expected launch revision/current pointer; no current worker authority remains | set lease state `stopped`, expiry/terminal time to now, reason `graceful_release`, increment lease revision; CAS attempt `lease_acquired -> terminated`, increment attempt revision, and update aggregate launch state in the same transaction |
| verified process-exit revocation | current gateway service controller | exact lease owner/process start identity and epoch; expected lease revision; exact bound child identity is confirmed exited; exact attempt/revision; expected launch revision/current pointer | set lease state `stopped`, expiry/terminal time to now, reason `verified_process_exit`, increment lease revision; CAS attempt `lease_acquired -> terminated`, increment attempt revision, and set aggregate state to retry backoff or blocked in the same transaction |
| natural lease expiry | current gateway service controller | exact owner/epoch, expected lease revision, stored heartbeat/expiry unchanged, current time at or after expiry, exact attempt/revision, expected launch revision/current pointer | set lease state `expired`, terminal time/reason `natural_expiry`, increment lease revision; CAS attempt `lease_acquired -> lease_expired`, increment attempt revision, and set aggregate state to retry backoff or blocked in the same transaction |

There is no two-transaction sequence that first releases/revokes the lease and later terminalizes the attempt. Renewal and every terminal transaction compare the same `lease_state_revision`; only one can commit. After a terminal transaction, renewal affects zero rows because the lease state/revision and attempt state/revision no longer match.

Verified process exit may revoke an otherwise unexpired lease only when the full stored process identity matches and the OS/process evidence proves that exact process exited. PID alone is insufficient. Loss of heartbeat without exact process-exit evidence uses natural expiry, not early revocation.

A replacement authorization may be inserted only after one of these atomic terminal transactions commits and `fresh_supervisor_authority = false`. Until then, the prior attempt remains nonterminal and cannot authorize retry. A stale process still running after natural expiry is fenced by the terminal lease/attempt transaction and cannot renew or perform protected writes.

Supervisor parent contract:

- the supervisor verifies the gateway heartbeat belongs to the gateway instance and package generation that launched it;
- the supervisor stops new work when the gateway heartbeat expires or verified parent identity is lost;
- it enters `draining`, shuts down the worker, releases authority, and exits within the orphan timeout;
- a supervisor launched by an old gateway/package generation cannot attach to a newer gateway instance without a new lease epoch;
- the plugin service controller may respawn a crashed supervisor only while its own gateway heartbeat is current and launch budget is available.

When another healthy supervisor owns the home, a newly started plugin must converge on that owner through the control/status channel or report `supervisor_already_owned`. It must not start another worker.

Initial supervisor policy:

```text
policy_version: supervisor-runtime-v1
heartbeat_interval_ms: 5000
lease_duration_ms: 20000
max_supervisor_launches_per_window: 3
max_worker_restarts_per_window: 3
restart_window_ms: 600000
restart_backoff_ms: [1000, 5000, 30000]
graceful_drain_timeout_ms: 30000
orphan_exit_timeout_ms: 20000
```

Exact values may change only through a versioned policy revision, not ad hoc runtime mutation.

If the supervisor launch budget is exhausted, the plugin service controller marks supervisor launch state `blocked` and stops spawning. If the worker restart budget is exhausted, the active supervisor becomes `blocked` and stops worker respawn. In both cases interaction/status may remain available, but learning health is not healthy.

### 4.9 Worker lease and fencing contract

Minimum worker lease record:

```text
worker_lease_key
home_id
owner_id
owner_process_id
owner_process_start_token
supervisor_owner_id
supervisor_lease_epoch
package_generation_id
artifact_integrity
worker_protocol_version
schema_version
fencing_token
worker_mode: production | activation_only
state: starting | active | draining | blocked | stopped
started_at
heartbeat_at
expires_at
shutdown_requested_at
drain_deadline_at
last_failure_code
```

Worker lease acquisition occurs only after:

- the caller owns the current supervisor lease;
- migration state is `ready`;
- the current schema is inside the package generation's write-compatibility range;
- `worker_mode = production` only when the package generation equals the current active generation and package activation state is `production_activating` or `active`;
- `worker_mode = activation_only` only when the generation is the exact pending generation, `pending_transition_kind` and launch-authorization role agree on initial/upgrade/rollback, and the current activation revision/deadline remain valid;
- the resolved home fingerprint matches the plugin and configuration generation.

Acquisition and takeover use `BEGIN IMMEDIATE` and a compare-and-swap predicate over:

```text
expected prior owner_id
expected prior fencing_token
expected prior expires_at
current supervisor_owner_id
current supervisor_lease_epoch
current package_generation_id
```

A takeover increments `fencing_token` monotonically. It never reuses an old token.

An `activation_only` worker may execute only migration-adjacent validation, health probes, and activation-handshake work. It cannot claim learning jobs or commit candidate, node, embedding, attribution, or governance mutations. Changing worker mode requires releasing the prior lease and acquiring a new lease/fencing token after the package-activation CAS.

A `production` worker lease is necessary but not sufficient authority for learning writes. It may be acquired in `production_activating` only so the fresh fence can participate in the production handshake. Until the canonical production-activation predicate below is true, that worker is activation-only in effect for queue and semantic data even though its lease mode is `production`.

Protected writes include:

- queue claim, renewal, completion, blocking, failure, and discard
- candidate lifecycle changes
- node create/update/merge
- embedding writes and migration markers
- hybrid postmortem artifacts
- mutable runtime-route projection updates submitted by the worker

Canonical production activation authority is derived as `production_activation_authorized` and is true only when all of these match in the same read/CAS snapshot:

```text
package_activation_state.activation_state = active
pending_package_generation_id IS NULL
pending_transition_kind = none
blocked_boundary = none
production_activation_handshake_id IS NOT NULL
referenced handshake purpose = production_activation
referenced handshake status = complete
handshake.current_activation_revision = package_activation_state.activation_revision
handshake.active_package_generation_id = active_package_generation_id
handshake supervisor owner/epoch = one fresh supervisor authority
handshake worker owner/fencing token = current production worker lease
handshake configuration generation = current configuration generation
handshake effective route set = current effective route set
handshake schema version = current ready schema
handshake home/gateway/package identities = current authority
```

`production_write_authorized(operation)` always requires `production_activation_authorized`, the exact current worker owner/fence, and the operation-specific lease state:

- `new_claim`, worker-originated blocking/failure/discard, mutable route projection, and standalone semantic mutations require worker lease state `active` and no shutdown request;
- renewal or completion of an already-owned claim may use lease state `active` or a deliberate runtime `draining` state only while package activation remains `active`, the claim was created under the same activation revision/handshake id, and its renewal/commit is no later than `drain_deadline_at`;
- interruption recovery and claim release after authority loss are supervisor/recovery maintenance transactions, not production semantic writes, and cannot create or update candidate/node/embedding content.

Every package-authority transaction that leaves `active`, enters `blocked` or `production_activating`, changes the production-handshake pointer, or changes a handshake-bound configuration/route/schema identity makes `production_activation_authorized = false` immediately. When a matching fresh production worker lease exists, the same transaction also changes that lease to `draining` or `blocked`, records `shutdown_requested_at`, and sets a bounded drain deadline. This worker-lease mutation accelerates shutdown; the package/handshake predicate is the safety boundary even if the process has not observed the state change yet.

After that invalidation:

- no new claim or worker-originated protected write may commit;
- existing claims cannot renew or semantically complete under the old activation binding;
- local computation may finish but its commit is rejected as `EE_ACTIVATION_FENCING_REJECTED`;
- the claim is returned to `pending` by interruption recovery after exact claim/lease expiry or explicit fenced recovery, incrementing `interruption_count` and not `content_retry_count`.

Every protected write transaction must:

1. begin with `BEGIN IMMEDIATE`;
2. verify `production_write_authorized(operation)`, including current package activation, production handshake, worker owner/fence, supervisor epoch, package generation, configuration, route set, and schema bindings;
3. perform all related writes;
4. commit only while the guard still matches inside the same transaction.

An old worker may finish local computation after lease loss, but its result commit must affect zero rows or abort with `EE_FENCING_REJECTED`. That rejection is an interruption, not candidate-content failure.

### 4.10 Atomic queue claim and result-commit contract

Required job execution metadata:

```text
state_revision
claim_id
claim_owner_id
claim_fencing_token
claimed_package_generation_id
claimed_configuration_generation_id
claimed_route_fingerprint
claimed_activation_revision
claimed_production_activation_handshake_id
claimed_supervisor_lease_epoch
claimed_at
claim_heartbeat_at
claim_expires_at
system_attempt_count
interruption_count
content_retry_count
next_attempt_at
failure_code
failure_class
```

Atomic claim protocol:

1. begin `BEGIN IMMEDIATE`;
2. require `production_write_authorized(new_claim)`;
3. select one runnable job whose `next_attempt_at` is due;
4. conditionally update exactly that job using its expected `status` and `state_revision`;
5. set `status = processing`, a new `claim_id`, owner/fencing/generation fields, the current activation revision, production-handshake id, supervisor epoch, claim expiry, and increment `state_revision`;
6. require exactly one changed row;
7. commit before provider work begins.

List-then-upsert is explicitly rejected.

Claim renewal is allowed only when all of these still match:

```text
status = processing
claim_id
claim_owner_id
claim_fencing_token
state_revision
current worker lease
claimed_activation_revision = current activation revision
claimed_production_activation_handshake_id = current production handshake id
claimed_supervisor_lease_epoch = current supervisor epoch
production_write_authorized(existing_claim)
```

Successful semantic completion is one fenced transaction that revalidates `production_write_authorized(existing_claim)` and every activation/claim binding recorded at claim time, then contains, as applicable:

- node create/update/merge
- provenance aggregation
- candidate transition to `distilled`
- job transition to `succeeded`
- claim-field clearing

If renewal or completion loses the production-activation predicate, all computed output is discarded and the job is recovered as an interruption. A prior production lease, stale complete handshake, or still-running process cannot preserve semantic write authority after package/handshake/configuration/route/schema authority changes.

System-route blocking, candidate-content failure, terminal discard, and interruption recovery also update job and candidate state in one transaction. A partial job/candidate transition is invalid.

### 4.11 Retry-budget separation

The runtime tracks three independent counters:

```text
system_attempt_count
interruption_count
content_retry_count
```

- `system_attempt_count` covers provider health probes, route backoff, SQLite busy, configuration unavailability, and other machine-route failures.
- `interruption_count` covers worker crash, lease loss, supervisor shutdown, gateway restart, fencing rejection, and claim expiry.
- `content_retry_count` covers only candidate-specific semantic/schema failure after the route itself is valid.

Only `content_retry_count` can exhaust a candidate into content-failure discard.

System and interruption counters remain bounded for diagnostics and backoff but never relabel candidate content as bad.

### 4.12 SQLite WAL, transaction, and busy contract

The selected multi-process topology requires the initial runtime policy:

```text
sqlite_runtime_policy_version: sqlite-runtime-v1
journal_mode: WAL
synchronous: FULL
foreign_keys: ON
busy_timeout_ms: 5000
```

Startup must read back and verify the effective PRAGMA values. Merely issuing the PRAGMA is insufficient.

Transaction rules:

- provider/network/model calls are forbidden inside transactions;
- plugin producer writes are short, idempotent, and keyed by a stable producer idempotency key;
- lease, claim, migration, and protected result commits use `BEGIN IMMEDIATE`;
- read-only retrieval uses bounded read transactions where needed;
- no runtime process may hold an idle write transaction while waiting for child or host events.

After bounded busy waiting:

- lease/claim/migration contention before semantic work maps to `EE_SQLITE_BUSY` with `failure_class = system_route`;
- a fenced result commit that cannot complete before claim expiry maps to `EE_SQLITE_COMMIT_INTERRUPTED` with `failure_class = interruption`;
- candidate content retry is unchanged;
- supervisor status exposes the operation category and last occurrence;
- repeated busy failures may block learning but cannot prove candidate failure.

WAL does not authorize multiple queue owners or migration owners.

### 4.13 Schema version, migration ownership, and plugin modes

Minimum schema metadata:

```text
schema_contract_version
current_schema_version
target_schema_version
migration_id
migration_owner_id
migration_supervisor_lease_epoch
migration_fencing_token
migration_package_generation_id
migration_started_at
migration_heartbeat_at
migration_expires_at
migration_status: idle | preparing | migrating | verifying | ready | failed
last_completed_migration_id
last_error_code
```

Each package generation declares:

```text
min_read_schema_version
max_read_schema_version
min_write_schema_version
max_write_schema_version
target_schema_version
supported_migration_from_versions
```

Only the current package-local supervisor generation may acquire the migration lease. The plugin and ordinary worker must never execute opportunistic `ALTER TABLE` operations.

Migration protocol:

1. acquire the current supervisor lease;
2. stop queue claims and enter `warming`;
3. acquire the migration lease with a new migration fencing token;
4. verify source schema and package compatibility;
5. execute one versioned migration step at a time, transactionally where SQLite permits;
6. persist and verify the new schema version;
7. mark migration `ready` and release migration ownership;
8. only then acquire or activate the worker lease.

Plugin modes during startup or migration:

| Mode | Condition | Allowed behavior |
| --- | --- | --- |
| `interaction_ready` | Schema read/write compatible and current plugin host wiring complete | Normal bounded interaction and producer writes; learning may still be warming until the production handshake completes |
| `interaction_read_only` | Schema read-compatible but writes or migration are not ready | Retrieval/status only; no producer or learning writes |
| `status_only_warming` | Schema not safely readable or migration is active | Status/repair explanation only; no DB-backed prompt injection |
| `blocked_incompatible` | Package/schema compatibility failed | Status only; no learning or DB-backed interaction |

Missing or failed migration must never project learning as active.

### 4.14 Canonical shared-home contract

OpenClaw runtime resolution order is frozen as:

```text
1. explicit OpenClaw ExperienceEngine home configuration
2. EXPERIENCE_ENGINE_HOME inherited by the gateway process
3. product default ~/.experienceengine
```

Automatic data-presence fallback to `~/.openclaw/experienceengine` is not part of the selected architecture. Legacy data must be imported or migrated explicitly.

The gateway plugin resolves the path once and passes the resolved home to the supervisor. The supervisor and worker must not independently re-run environment precedence.

Minimum home identity:

```text
home_id
home_layout_version
path_normalization_version
normalized_path_fingerprint
home_path_fingerprint_key_id
database_relative_path
created_at
```

The initial selected layout is:

```text
home_layout_version: home-layout-v1
path_normalization_version: home-path-normalization-v1
database_relative_path: sqlite/experienceengine.db
```

Changing the database location for this architecture means selecting or migrating the canonical home, not independently overriding `sqlitePath` in one process.

`home_id` is a random stable identifier created once in `runtime_control_meta` during control-plane bootstrap. `normalized_path_fingerprint` is a domain-separated HMAC over the platform-normalized canonical home path using the machine key adopted before bootstrap; diagnostics expose the fingerprint, not the raw path by default.

In the initial protocol, `home_path_fingerprint_key_id` must equal `integrity_key_id` and is immutable for the life of the home.

`home-path-normalization-v1` freezes these rules:

- resolve to an absolute path without requiring the database file to exist;
- normalize separators to `/` for fingerprint input;
- remove redundant `.` segments and resolve `..` segments;
- remove a trailing separator except for filesystem roots;
- normalize path text to Unicode NFC;
- on Windows, uppercase the drive letter, then lowercase the remaining normalized path text with locale-independent Unicode lowercasing for fingerprint input;
- preserve UNC server/share structure while applying the same NFC and locale-independent lowercase rules to server, share, and remaining path text;
- do not silently change identity by later resolving a symlink or junction target; relocation requires an explicit home-migration protocol.

Concurrent first bootstrap creates `home_id` with insert-if-absent semantics inside the same exclusive control-plane transaction. A losing bootstrap reads and adopts the committed identity; it never creates a second identity for the same database.

The configuration generation, supervisor lease, worker lease, package state, activation handshake, and runtime-route projection must all bind to the same `home_id` and path fingerprint.

Any mismatch fails closed with `EE_HOME_IDENTITY_MISMATCH` before protected writes.

### 4.15 Package generation and compatibility contract

Minimum package generation identity:

```text
package_name
package_version
package_generation_id
artifact_integrity
install_record_identity
plugin_entrypoint
supervisor_entrypoint
worker_entrypoint
supervisor_protocol_version
worker_protocol_version
control_protocol_version
profile_registry_digest
min_read_schema_version
max_read_schema_version
min_write_schema_version
max_write_schema_version
target_schema_version
published_channel: npm | clawhub | local_test
```

`package_generation_id` is derived from the immutable install generation identity and artifact integrity, not version text alone.

The active supervisor and worker leases bind to one package generation. A different generation cannot perform protected writes merely by owning a newer supervisor epoch and worker fencing token; it must also become the selected active generation and satisfy the canonical current production-handshake write predicate.

Minimum package activation authority:

```text
home_id
activation_revision
active_package_generation_id
pending_package_generation_id
previous_package_generation_id
pending_transition_kind: none | initial | upgrade | rollback
activation_deadline_at
preactivation_handshake_id
production_activation_handshake_id
launch_authorization_id
launch_authorized_generation_id
launch_authorization_role: none | initial_candidate | active | pending | rollback_candidate
launch_authorization_state: none | issued | consumed | expired | cancelled
launch_authorization_revision
launch_authorization_state_revision
launch_authorization_issued_at
launch_authorization_expires_at
launch_authorization_consumed_by_attempt_id
launch_authorization_consumed_at
activation_state: uninitialized | preparing | draining_old | migrating | preactivation_verifying | production_activating | active | blocked
blocked_boundary: none | pre_identity_initial | pre_identity_upgrade | pre_identity_rollback | post_identity
blocked_from_state: none | preparing | draining_old | migrating | preactivation_verifying | production_activating
updated_by_kind: gateway_service_controller | supervisor
updated_by_gateway_instance_id
updated_by_supervisor_owner_id
updated_by_supervisor_lease_epoch
updated_at
last_failure_code
```

The `launch_authorization_*` fields in `package_activation_state` are a denormalized projection of the current `package_launch_authorizations` row. They must match its id, immutable issuance revision, mutable state revision, state, generation, role, timestamps, and consumed attempt. When no current authorization is needed, the pointer/id fields are null, revisions are zero, and state/role are `none`. The projection is updated only in the same transaction as authorization insertion or state transition.

`activation_revision` is the package activation authority epoch, not a generic row-update counter. It increments exactly when a new activation/retry/cancel/rollback authority epoch begins, when a transition enters a new explicit blocked boundary, or when the pending-to-active identity CAS creates the post-identity production-activation epoch. Intermediate progress inside one epoch may change state only through expected-state CAS while preserving the revision. In particular, the final `production_activating -> active` publication and an ordinary active-runtime production-handshake pointer replacement preserve `activation_revision`, so the current complete handshake remains bound to the published active epoch.

Package activation updates use a compare-and-swap predicate over `activation_revision`, current supervisor owner/epoch when one exists, expected active/pending generations, the immutable current launch-authorization issuance revision, and the current authorization-state revision.

Writer provenance is mandatory. Gateway-service-controller mutations set `updated_by_kind = gateway_service_controller`, record the current gateway instance, and leave supervisor identity null. Supervisor mutations set `updated_by_kind = supervisor`, record the current supervisor owner/epoch, and leave gateway-writer identity null. A row with mixed or missing writer identity is invalid authority state.

#### Exhaustive gateway package-authority mutation whitelist

This table is the only source of gateway service controller write authority over `package_activation_state` or its current authorization projection. Other sections reference these operation names and may narrow their predicates, but cannot add another gateway mutation implicitly.

| Gateway operation | Exact start predicate | Allowed package-authority result | Additional required authority |
| --- | --- | --- | --- |
| `bootstrap_package_activation_authority` | control-plane package row absent in a fixed empty home | create revision `0`, state `uninitialized`, no active/pending/previous identities, no authorization or handshake pointers | fixed empty-home bootstrap transaction only |
| `initialize_package_activation` | state `uninitialized` at expected revision `N >= 0`; no active/pending/previous generation; no transition, blocked boundary, authorization, or handshake pointer | set exact verified generation pending with transition `initial`, state `preparing`, activation revision `N + 1`, new deadline, new `initial_candidate` authorization and current pointer | `fresh_supervisor_authority = false`; current gateway heartbeat; verified package closure; reset supervisor launch budget to a new activation window without deleting history |
| `consume_launch_authorization_and_reserve_attempt` | exact current authorization is `issued`; state/revisions/package identities/role match; `fresh_supervisor_authority = false` | change only authorization state/projection to `consumed` and atomically create the unique launch attempt/current-attempt projection | current gateway heartbeat, launch budget, authorization/deadline predicates |
| `expire_or_cancel_unconsumed_authorization` | exact current authorization is `issued`, unconsumed, has no attempt row, and `fresh_supervisor_authority = false` | change only the authorization row/current projection to `expired` or `cancelled` | current gateway heartbeat plus exact expiry or operation-specific cancellation predicate |
| `issue_active_restart_authorization` | state `active` or `production_activating`; exact active generation; no pending transition; `fresh_supervisor_authority = false` | insert a new `active` authorization and advance only current authorization projection/revisions | current gateway heartbeat, prior authorization/attempt terminal, restart budget |
| `issue_deterministic_replacement_authorization` | exact pending initial/upgrade/rollback transition or post-identity active generation; `fresh_supervisor_authority = false`; prior authorization/attempt terminal | preserve all package identities/state and insert only the role/generation determined by current authority | current gateway heartbeat, unexpired transition deadline where applicable, launch budget |
| `enter_blocked_transition` | state in `preparing | draining_old | migrating | preactivation_verifying | production_activating`; `fresh_supervisor_authority = false`; exact deadline/failure predicate | preserve package identities, set state `blocked`, persist exact boundary/source/failure, increment activation revision once, invalidate current production-handshake authority | current gateway heartbeat; prior supervisor lease/attempt terminal or never acquired; worker semantic authority invalidated in the same transaction when a current lease row matches |
| `retry_package_activation` / `cancel_package_transition` / `retry_production_activation` / `prepare_package_rollback` | exact `blocked` boundary and identities defined in the boundary table; `fresh_supervisor_authority = false` | only the boundary-specific identity/state/deadline/authorization/handshake result defined below | crash-safe control idempotency, current gateway heartbeat, prior lease/attempt terminal, exact expected activation and authorization revisions |

`stale-owner recovery` is not a separate mutation class. It is the use of `issue_deterministic_replacement_authorization` or a listed blocked operation after the canonical fresh-supervisor predicate becomes false and the old lease/attempt is atomically terminal.

No gateway operation outside this whitelist may update package state, identity, deadline, blocked fields, handshake pointers, or authorization projection. A plugin or non-owning package generation cannot mark a package active, bypass compatibility checks, rewrite historical authority, or invent a generation/role.

Compatibility decisions are deterministic:

- plugin entrypoint compatibility is checked before registration readiness;
- supervisor/worker protocol versions must be mutually compatible;
- schema read/write ranges must include the current schema for the requested mode;
- profile registry digest must match the package manifest;
- unknown compatibility is blocking, not assumed compatible.

Initial activation and re-initialization after an explicit initial cancellation use the same `initialize_package_activation` protocol:

1. require `activation_state = uninitialized` at the caller's expected revision `N >= 0`, no active/pending/previous generation, no transition or blocked boundary, null authorization/handshake pointers, and `fresh_supervisor_authority = false`;
2. verify the package closure, protocols, schema ranges, and profile registry;
3. in one transaction, CAS the exact verified generation into `pending_package_generation_id`, set `pending_transition_kind = initial`, establish the versioned activation deadline, clear stale current handshake projections, issue a new launch authorization for that generation with role `initial_candidate`, allocate the next immutable authorization revision with row-state revision `1`, set state `preparing`, set `activation_revision = N + 1`, and start a new supervisor launch-budget window with count zero before the first reservation;
4. the authorized generation starts the supervisor through the matching launch attempt, acquires supervisor authority, bootstrap/migrates schema, and starts a worker in activation-only mode;
5. CAS state to `preactivation_verifying` and complete a `preactivation_verification` handshake bound to the current activation revision, launch authorization, activation-only worker lease/fence, and pending generation;
6. the owning supervisor CASes the pending generation identity to active, clears pending and `pending_transition_kind`, records the completed preactivation handshake, increments `activation_revision`, and sets state `production_activating`; this transition does not satisfy `learning_runtime_active`;
7. release the activation-only worker lease, then acquire a new `production` worker lease with a fresh fencing token for the now-active generation;
8. issue and complete a new `production_activation` handshake bound to the new activation revision, current active package generation, production worker mode, and fresh production fence;
9. after that production handshake completes, CAS package activation state to `active`, record `production_activation_handshake_id`, clear `activation_deadline_at`, and preserve the post-identity `activation_revision` bound by the handshake.

A pending generation may perform control-plane bootstrap, compatibility checks, migration, health probes required for activation, and only the preactivation handshake. It may not claim learning jobs, create semantic candidates/nodes, update embeddings, satisfy `learning_runtime_active`, or project production learning ready. Production learning remains unavailable until the post-CAS production lease and production handshake both complete.

Package activation transition guards:

- the pending-to-active identity CAS requires a completed current `preactivation_verification` handshake, the matching activation-only worker lease/fence, the exact pending generation/transition kind, and an unexpired activation deadline;
- that identity CAS invalidates the preactivation worker for further authority, so the activation-only lease must be released and cannot be converted in place;
- the `production_activating -> active` CAS requires a completed current `production_activation` handshake, the exact active generation, current production worker owner/fence, current activation revision, no pending generation, and an unexpired activation deadline; the same CAS records the production handshake, clears the transition deadline, and preserves that activation revision;
- a failure before the identity CAS leaves the prior active generation authoritative when one exists;
- a failure after the identity CAS leaves the new package identity active but runtime activation false; state remains `production_activating` for bounded retry or becomes `blocked` when the activation deadline expires;
- the previous generation cannot silently resume after the identity CAS; recovery requires the explicit rollback protocol.

Package activation states are exhaustive and have unique meanings:

| State | Required identity facts | Allowed writer and entry edge | Allowed exit edges | Deadline rule |
| --- | --- | --- | --- | --- |
| `uninitialized` | no active, pending, or previous generation; no transition kind; blocked boundary/from state `none`; revision may be zero or nonzero | fixed empty-home bootstrap creates revision zero; `initialize_package_activation` gateway CAS exits at any expected revision; explicit initial cancellation may enter | `preparing` through `initialize_package_activation` for the exact verified initial candidate | no activation deadline |
| `preparing` | exact pending generation and transition kind `initial`, `upgrade`, or `rollback`; active may exist only for upgrade/rollback; blocked boundary/from state `none` | `initialize_package_activation` gateway transaction for initial, current supervisor/control transaction from `active`, or explicit blocked retry/rollback transaction | `draining_old` when an old active owner must drain; otherwise `migrating`; `blocked` on terminal validation/deadline failure | deadline required and unexpired for automatic progress |
| `draining_old` | exact pending upgrade/rollback target plus previous active identity; old owner is draining | current old supervisor from `preparing` | `migrating` only after old lease release/expiry and authorized pending supervisor acquisition; `blocked` on deadline/failure | deadline required |
| `migrating` | exact pending generation owns current supervisor authority; migration not yet accepted ready | current pending supervisor from `preparing`/`draining_old` | `preactivation_verifying` after migration ready and activation-only worker acquisition; `blocked` on failure/deadline | deadline required |
| `preactivation_verifying` | exact pending generation, activation-only worker/fence, current preactivation handshake | current pending supervisor from `migrating` | `production_activating` through the guarded pending-to-active identity CAS; `blocked` on failure/deadline | deadline required |
| `production_activating` | no pending generation; selected active identity; production handshake not yet authoritative; blocked boundary/from state `none` | identity-CAS supervisor from `preactivation_verifying`; explicit post-identity retry; pre-identity upgrade cancellation without a preserved production handshake; every pre-identity rollback cancellation | `active` after current production handshake; `blocked` on deadline/failure | deadline required |
| `active` | exact active generation; no pending transition; transition deadline null; blocked boundary/from state `none` | guarded production-handshake CAS from `production_activating`; explicit cancellation of a pre-identity blocked upgrade only when the preserved production handshake remains current | `preparing` for explicit upgrade/rollback; remains `active` across ordinary runtime stop/restart | no activation deadline |
| `blocked` | package identities preserved exactly at the failed boundary; one non-`none` blocked boundary and exact source state recorded; runtime activation false | current supervisor or bounded gateway timeout/recovery CAS from a transition state | only the boundary-specific idempotent operations defined below | prior deadline historical; every retry/rollback creates a new activation revision and deadline |

No other state transition is legal. Ordinary supervisor/worker downtime while package state is `active` does not change package activation state; it invalidates `learning_runtime_active` through lease/handshake predicates and uses the active-generation restart protocol. `blocked` is reserved for a failed package activation/rollback transition, not generic runtime health.

`rollback_preparing` and `stable` are not protocol states. Rollback preparation uses `preparing` plus `pending_transition_kind = rollback`; a normally selected package remains `active` even when its runtime is temporarily stopped.

#### Blocked package-transition exits

Blocked boundaries are derived and persisted when entering `blocked`:

| Boundary | Required package identity |
| --- | --- |
| `pre_identity_initial` | no active or previous generation; exact pending generation; transition kind `initial` |
| `pre_identity_upgrade` | exact prior active generation remains selected; exact pending generation; transition kind `upgrade`; pending-to-active identity CAS has not occurred |
| `pre_identity_rollback` | exact current active generation remains selected; exact pending rollback target; transition kind `rollback`; pending-to-active identity CAS has not occurred |
| `post_identity` | exact new active generation selected; no pending generation or transition kind; failed source state `production_activating` |

The mutation writer is deterministic. A fresh current supervisor is the only writer when one exists. When no fresh supervisor exists, the gateway service controller may write only after the exact prior supervisor lease/attempt authority is terminal and the gateway heartbeat is current. Every operation uses the crash-safe control-idempotency transaction, matches expected activation revision, blocked boundary/source state, package identities, current authorization id plus both authorization revisions, and increments `activation_revision` exactly once.

Before any blocked exit, the current authorization is closed mechanically. An unconsumed current `issued` authorization is changed to `cancelled` in the same transaction. A `consumed` authorization remains consumed and requires its exact attempt to be terminal before a gateway writer can proceed. Existing `expired` or `cancelled` rows remain unchanged. Historical authorization, attempt, and handshake rows are never deleted or rewritten.

Boundary-specific exits are:

| Operation and boundary | Atomic state/identity result | Authorization and handshake result | Lease/fence requirements |
| --- | --- | --- | --- |
| `retry_package_activation` from `pre_identity_initial` | preserve exact pending initial generation; active/previous remain null; set state `preparing`; clear blocked fields; create a new deadline and activation revision | with the same fresh transition supervisor, preserve its consumed launch evidence and issue no authorization; without a fresh supervisor, insert a new `initial_candidate` authorization with the next immutable authorization revision/state revision `1`; clear current handshake pointers in both paths | same-supervisor path releases/fences any activation-only worker and later obtains a new activation-only fence; replacement path requires prior lease/attempt terminal |
| `cancel_package_transition` from `pre_identity_initial` | clear pending generation and transition kind; set `uninitialized`; clear blocked fields/deadline; active/previous remain null | clear current authorization and handshake projections after terminalizing any unconsumed current authorization; retain all historical rows | a fresh initial supervisor first drains/releases its worker, then atomically terminalizes its own lease/attempt together with this package cancellation and exits; without a fresh supervisor, gateway writer requires prior lease/attempt terminal |
| `retry_package_activation` from `pre_identity_upgrade` | preserve active, pending, previous, and transition kind; set `preparing`; clear blocked fields; create a new deadline and activation revision | same fresh pending supervisor preserves its consumed launch evidence; replacement path inserts a new `pending` authorization; clear transition handshake pointers | same-supervisor path releases/fences activation-only worker before retry; replacement path requires prior lease/attempt terminal |
| `retry_package_activation` from `pre_identity_rollback` | preserve active, pending, previous, and rollback transition kind; set `preparing`; clear blocked fields; create a new deadline and activation revision | same fresh rollback supervisor preserves its consumed launch evidence; replacement path inserts a new `rollback_candidate` authorization; clear transition handshake pointers | same-supervisor path releases/fences activation-only worker before retry; replacement path requires prior lease/attempt terminal |
| `cancel_package_transition` from `pre_identity_upgrade` with preserved production handshake | require the still-selected active generation to remain schema/protocol compatible; preserve active and previous; clear pending/transition/deadline/blocked fields; set `active` | terminalize current unconsumed pending authorization if needed; preserve only the already-current production-handshake pointer; clear current transition authorization projection; retain history | a current supervisor may continue only when its package generation is the selected active generation; a pending-generation supervisor must release first; without a fresh supervisor, gateway writer requires prior lease/attempt terminal and ordinary active restart remains available |
| `cancel_package_transition` from `pre_identity_upgrade` without preserved production handshake, or from `pre_identity_rollback` | preserve the still-selected active generation and previous generation; clear pending/transition/blocked fields; set `production_activating`; create a new activation revision and deadline; never transition directly to `active` | terminalize current unconsumed pending/rollback authorization if needed; clear prior handshake pointers; when the current supervisor belongs to the selected active generation, preserve its immutable historical launch evidence and issue no new authorization; otherwise the gateway path requires prior supervisor/attempt terminal and inserts a new `active` authorization in the same idempotency transaction | a fresh supervisor for the pending/rollback target is not eligible to cancel; it must release first. A continuing selected-active supervisor obtains a new production worker fence and handshake. A gateway replacement launches the selected active generation from the fresh `active` authorization before the new production handshake |
| `retry_production_activation` from `post_identity` with a fresh supervisor | preserve active/previous and no pending; set `production_activating`; clear blocked fields; create new activation revision/deadline; clear only the current production-handshake pointer | preserve the current supervisor lease's immutable launch evidence; create a new activation id/nonce later; no new launch authorization is issued | release/fence any current worker lease and acquire a new `production` worker lease/fencing token before the new handshake |
| `retry_production_activation` from `post_identity` without a fresh supervisor | preserve active/previous and no pending; set `production_activating`; clear blocked fields; create new activation revision/deadline; clear production-handshake pointer | insert a new `active` authorization for the exact active generation; replacement supervisor and handshake must bind the new authorization/attempt | prior lease/attempt terminal; replacement supervisor lease then a new production worker lease/fence |
| `prepare_package_rollback` from `post_identity` | require an explicitly selected compatible rollback target; set that target pending with transition kind `rollback`; preserve current active as the pre-rollback active identity; set `preparing`; clear blocked fields; create new activation revision/deadline | clear transition handshake projections and insert a new `rollback_candidate` authorization | current active authority must be drained/fenced through the normal rollback protocol before rollback-target writes |

No other `blocked` exit is legal. In particular, `post_identity` cannot transition directly to `active`; pre-identity upgrade/rollback cancellation cannot change the selected active generation; and rollback cancellation cannot restore an old production handshake. Every retry or cancellation that enters `production_activating` uses a new activation deadline and fresh handshake identity; no prior complete or failed handshake becomes current again.

### 4.16 Gateway restart, crash, orphan, upgrade, and rollback

Normal gateway stop:

1. plugin requests supervisor `draining` with an idempotent shutdown id;
2. supervisor stops new claims;
3. worker renews only existing claims during the drain window;
4. provider work is cancelled or allowed to finish within the bounded drain timeout;
5. valid results commit only while fencing remains current;
6. unfinished claims return to `pending` as interruptions;
7. worker lease is released, then supervisor lease is released;
8. child processes exit.

Gateway or supervisor crash:

- worker monitors supervisor identity, epoch, and heartbeat;
- loss of supervisor authority stops new claims immediately;
- protected writes stop when either the worker fence is no longer current or the canonical production-activation predicate becomes false;
- the worker self-terminates within the orphan timeout;
- a new supervisor may take over only after lease expiry or verified fenced owner loss.

Orphan identity requires more than PID:

```text
owner_id
process_id
process_start_token
package_generation_id
supervisor_lease_epoch
worker_fencing_token
```

A process may be force-terminated only when all available identity evidence matches the stale lease. Otherwise the system fences writes and leaves process termination to the operator/OS.

Upgrade protocol:

1. install and independently verify the new package generation;
2. send an idempotent `prepare_package_generation` control request containing the expected activation revision, current active generation, proposed generation, and artifact integrity;
3. the current supervisor validates package/protocol/schema/profile-registry compatibility, CASes the proposed generation into `pending_package_generation_id`, sets `pending_transition_kind = upgrade`, establishes the activation deadline, increments `activation_revision`, and sets state `preparing`;
4. keep the old generation active until the pending generation passes compatibility checks;
5. the current supervisor issues the first single-use launch authorization for the exact pending generation with role `pending`, requests old supervisor drain, and CASes activation state to `draining_old`;
6. wait for old worker and supervisor lease release or expiry;
7. consume the pending authorization through exactly one launch attempt, then acquire a new supervisor epoch; a failed launch uses the bounded deterministic retry-authorization rules rather than reusing the consumed authorization;
8. CAS activation state to `migrating` and run migration if required;
9. acquire an `activation_only` worker fencing token, CAS state to `preactivation_verifying`, and complete a preactivation-verification handshake for the pending generation;
10. atomically move `active_package_generation_id` to the pending generation, move the old active generation to `previous_package_generation_id`, clear pending and transition kind, record the preactivation handshake, increment `activation_revision`, and set state `production_activating`;
11. release the activation-only worker lease and acquire a new production worker lease/fencing token for the new active generation;
12. complete a fresh production-activation handshake bound to the new activation revision, active generation, production mode, and production fence;
13. CAS activation state to `active`, record the production handshake, clear the transition deadline, and only then allow `learning_runtime_active`.

If `fresh_supervisor_authority = false`, a bounded gateway-service-controller recovery transaction may run only after any prior lease/attempt authority is atomically terminal or no lease was ever acquired. It must preserve the observed current activation revision and active/pending identities and deterministically select authorization as follows:

- pending `initial` -> exact pending generation, role `initial_candidate`, worker mode `activation_only`;
- pending `upgrade` -> exact pending generation, role `pending`, worker mode `activation_only`;
- pending `rollback` -> exact pending generation, role `rollback_candidate`, worker mode `activation_only`;
- no pending generation -> exact active generation, role `active`, worker mode `production`.

The recovery transaction allocates the next immutable authorization revision, inserts a new single-use authorization with row-state revision `1`, and advances the package current pointer only after the prior authorization/attempt is terminal. Recovery is an issuance path, not a package-generation role, and cannot change package identity merely because the old owner is absent.

Any failure before the pending-to-active identity CAS leaves the previous active generation authoritative when it is still compatible and healthy. If the previous generation has already drained and cannot safely resume, activation becomes `blocked`; the system must not guess which package is active. Any failure after the identity CAS leaves the new active package identity in `production_activating` or `blocked` with `learning_runtime_active = false`; the previous generation may return only through explicit rollback.

Rollback protocol:

- rollback is allowed only when the target package can read and write the current schema;
- no implicit down-migration is allowed;
- rollback uses an idempotent `prepare_package_rollback` request and the same pending-generation/activation-revision CAS protocol as upgrade;
- rollback records the target as pending with `pending_transition_kind = rollback`, establishes the activation deadline, and authorizes exactly that target with role `rollback_candidate` before launch;
- rollback acquires a new supervisor epoch and an activation-only worker fence for the selected previous generation;
- rollback completes preactivation verification, moves package identity to active with state `production_activating`, releases the activation-only lease, and acquires a new production lease/fence;
- rollback completes a fresh production-activation handshake before state becomes `active` or `learning_runtime_active` can be true; the final active CAS records that handshake and clears the transition deadline;
- the replaced generation remains fenced;
- if schema compatibility fails, rollback is blocked and the plugin remains status-only.

### 4.17 OpenClaw-native controls and status contract

Canonical controls operate against the package-local supervisor, not a PATH-visible global CLI.

Minimum operations:

```text
status
pause_learning
resume_learning
retry_blocked_system_work
initialize_package_activation
prepare_package_generation
prepare_package_rollback
retry_package_activation
cancel_package_transition
retry_production_activation
request_drain
repair_explanation
```

The three blocked-transition operations are not aliases:

- `initialize_package_activation` applies only to `uninitialized` at the exact expected revision, including nonzero revisions after explicit initial cancellation, and performs the whitelist transaction defined in Section 4.15;
- `retry_package_activation` applies only to `pre_identity_initial`, `pre_identity_upgrade`, or `pre_identity_rollback` and preserves the pre-identity package identities defined in Section 4.15;
- `cancel_package_transition` applies only before the pending-to-active identity CAS and returns either to `uninitialized` or the still-selected `active` generation;
- `retry_production_activation` applies only to `post_identity` and cannot change active/previous package identities or skip the fresh production worker fence and handshake.

Mutation requests require:

```text
control_request_id
request_digest
expected_projection_revision
expected_supervisor_lease_epoch: integer | none
expected_gateway_instance_id
requested_operation
requested_at
```

Supervisor-owned operations require the exact integer lease epoch and `fresh_supervisor_authority = true` for that owner. A bounded gateway-service-controller operation requires `expected_supervisor_lease_epoch = none`, the exact current gateway instance, and a CAS proof that `fresh_supervisor_authority = false`. The two writer modes are mutually exclusive for one request.

Minimum `control_request_idempotency` record:

```text
home_id
control_request_id
request_digest
requested_operation
expected_projection_revision
expected_supervisor_lease_epoch: integer | none
expected_gateway_instance_id
request_state: completed | rejected
result_projection_revision
result_code
result_digest
created_at
completed_at
expires_at
```

`(home_id, control_request_id)` is the unique key.

`request_digest` covers normalized operation name and all mutation parameters. Reusing one request id with a different digest is rejected with `EE_CONTROL_REQUEST_CONFLICT`; the prior result is never applied to a different request body.

Crash-safe mutation protocol:

1. begin `BEGIN IMMEDIATE`;
2. read the idempotency row by `(home_id, control_request_id)`;
3. when a matching completed/rejected row exists, return its stable result without mutating state;
4. when a row exists with a different request digest, reject the request;
5. verify expected projection revision, supervisor owner/epoch, package authority, and operation-specific preconditions;
6. insert an uncommitted transaction-local placeholder when absent;
7. apply the control mutation and advance the authoritative projection/state revision;
8. materialize the same idempotency row as `completed` or `rejected`, recording result revision/code/digest;
9. commit the mutation and completed idempotency result in the same transaction.

There is no committed state in which the control mutation succeeded but the idempotency result is absent. A process crash before commit exposes neither change; a crash after commit exposes both.

Long-running operations such as drain or package preparation commit only the bounded request-state transition in this transaction. Their idempotency row is `completed` with a stable result code such as `accepted_for_processing`; later lifecycle progress is represented by normal authoritative state. Replaying the same control request returns the original completed result and does not create another drain, retry, pause, resume, or package-preparation action.

Retention is bounded by policy version. Completed/rejected records must remain at least through the maximum caller retry window and while any referenced lifecycle operation remains nonterminal. Expiry cleanup itself uses a revision-checked transaction and never removes an active request.

A stale expected revision or supervisor epoch is rejected rather than applied to a newer owner.

Minimum deterministic status projection:

```text
projection_schema_version
projection_revision
home_id
package_generation_id
configuration_generation_id
effective_route_set_id
gateway_instance_id
plugin_activation_state
package_activation_state
package_activation_revision
blocked_boundary
production_activation_handshake_id
production_handshake_current_activation_revision
launch_authorization_id
launch_authorization_revision
launch_authorization_state_revision
current_launch_attempt_id
supervisor_launch_activation_revision_at_consumption
supervisor_state
supervisor_lease_epoch
supervisor_lease_state_revision
fresh_supervisor_authority
worker_state
worker_fencing_token
worker_heartbeat_fresh
production_activation_authorized
migration_status
schema_version
queue_state
blocked_counts_by_failure_code
capability_routes
last_updated_at
```

The model may explain this projection but must not invent health state from prose or process presence.

### 4.18 Published artifact closure contract

The package contains an embedded immutable closure manifest that does not self-reference the final archive digest:

```text
closure_manifest_version
package_name
package_version
package_build_id
required_entrypoints
required_runtime_files
required_schema_and_migrations
profile_registry_digest
dependency_requirements_digest
compatibility_metadata_digest
closure_manifest_digest
```

`closure_manifest_digest` is computed from normalized closure-manifest content excluding the digest field itself.

Each release channel then produces an external immutable distribution attestation after the artifact is sealed or downloaded:

```text
distribution_manifest_version
package_name
package_version
published_channel
artifact_integrity
artifact_size
closure_manifest_digest
profile_registry_digest
dependency_closure_digest
compatibility_metadata_digest
registry_record_identity
created_at
```

The external attestation may live in release metadata, registry evidence, or the validation report. It must not be embedded in a way that requires the archive to contain its own final digest.

For the selected OpenClaw architecture, required entrypoints include:

- OpenClaw plugin
- package-local supervisor
- package-local worker
- any package-local recovery command used by OpenClaw-native controls

Published validation must download the actual registry artifact and verify:

1. embedded closure-manifest integrity and external attestation integrity;
2. every declared entrypoint exists;
3. entrypoint imports resolve in a clean environment;
4. runtime dependencies and schema/migrations are present;
5. package-local supervisor and worker can be spawned without source-repo files;
6. profile registry and compatibility digests match;
7. the artifact digest matches the registry record;
8. a bounded live host smoke passes.

npm and ClawHub results remain independent. Success in one channel never closes the other.

### 4.19 Windows OpenClaw executable-resolution contract

Package-local activation must not invoke a global `openclaw` command.

Doctor/repair fallback may resolve an OpenClaw executable using:

1. an explicit operator-configured executable path;
2. a host-provided executable path or install record;
3. platform PATH lookup.

On Windows, PATH lookup must enumerate `PATHEXT` candidates and support `.exe`, `.cmd`, and `.bat`. Extensionless `execFileSync("openclaw", ...)` is not an accepted resolution protocol.

Resolution output records:

```text
resolution_source
resolved_executable_path_fingerprint
resolved_extension
version_probe_status
version_probe_output_digest
```

The resolved candidate must pass a bounded `--version` probe before mutation commands run.

`.cmd` or `.bat` execution must use the resolved absolute shim and a dedicated Windows argument-quoting routine through the system command interpreter. Broad `shell: true` execution with concatenated user text is forbidden.

Failure maps to `EE_OPENCLAW_EXECUTABLE_UNRESOLVED` with exact repair guidance.

### 4.20 Live activation predicate

Three activation levels are distinct:

```text
interaction_active
learning_runtime_active
production_learning_ready
```

Minimum activation handshake record:

```text
activation_record_schema_version
activation_id
state_revision
handshake_purpose: preactivation_verification | production_activation
nonce_digest
home_id
gateway_instance_id
plugin_package_generation_id
current_activation_revision
launch_activation_revision_at_consumption
active_package_generation_id
pending_package_generation_id
launch_authorization_id
launch_authorization_revision
launch_authorization_state_revision_at_consumption
launch_authorization_role: initial_candidate | active | pending | rollback_candidate
supervisor_launch_attempt_id
configuration_generation_id
effective_route_set_id
supervisor_owner_id
supervisor_lease_epoch
worker_owner_id
worker_fencing_token
worker_mode: production | activation_only
schema_version
requested_at
supervisor_acknowledged_at
worker_acknowledged_at
acknowledged_at
expires_at
status: requested | supervisor_acknowledged | worker_acknowledged | complete | expired | rejected
failure_code
last_writer_kind: plugin | supervisor
last_writer_owner_id
last_writer_supervisor_lease_epoch
```

The plugin creates a cryptographically random single-use nonce and inserts only the `requested` record with `state_revision = 1`. The request declares exactly one handshake purpose. After insertion, the supervisor is the only persistent writer of activation-handshake state. The worker never writes the handshake table directly; it returns an acknowledgment through authenticated package-local IPC containing the activation id, nonce proof, worker owner id, current worker fencing token, worker mode, schema version, configuration generation, effective route set, package generation, current package activation revision, and the current supervisor lease's immutable launch-authorization/attempt binding including its historical launch activation revision.

A nonce cannot be reused across gateway, package, configuration, route-set, supervisor-epoch, worker-fence, or schema changes.

Mechanical state transitions:

| Transition | Persistent writer | Required CAS predicate |
| --- | --- | --- |
| absent -> `requested` | current plugin gateway instance | activation id absent; gateway heartbeat current; purpose, `current_activation_revision` equals package authority; `launch_activation_revision_at_consumption` and authorization/attempt evidence equal current supervisor lease history; package identities, requested worker mode, and home match |
| `requested` -> `supervisor_acknowledged` | current supervisor owner | expected state revision/status; nonce not expired; current supervisor owner/epoch; current activation revision still equals package authority; historical launch activation revision and authorization/attempt evidence still equal the supervisor lease; gateway and home match |
| `supervisor_acknowledged` -> `worker_acknowledged` | current supervisor owner after IPC response | expected state revision/status; worker lease owner, fencing token, and worker mode current; nonce proof; current package activation revision; immutable launch evidence; schema, configuration generation, route set, and home all match |
| `worker_acknowledged` -> `complete` | current supervisor owner | expected state revision/status; expiry not reached; supervisor lease, worker mode, and worker fence revalidated in the same transaction; purpose-specific package activation predicates still match |
| any nonterminal state -> `expired` | current supervisor owner | expected state revision/status; `expires_at` elapsed; no later valid transition exists |
| any nonterminal state -> `rejected` | current supervisor owner | expected state revision/status; stable failure code records the first authority mismatch or replay reason |

Every transition increments `state_revision` and occurs in `BEGIN IMMEDIATE`. The transition update must affect exactly one row. Zero changed rows means a lost CAS or stale owner and cannot be retried as success.

Repeated identical acknowledgments return the already-recorded state without advancing it. Reused activation ids with different nonce proof or authority bindings are rejected. A stale worker cannot directly mutate the table, and an acknowledgment received after lease/fence loss cannot be persisted as `worker_acknowledged` or `complete`.

Purpose-specific completion predicates:

- `preactivation_verification` requires the exact pending generation, `worker_mode = activation_only`, matching initial/pending/rollback transition kind and launch-authorization role, `current_activation_revision` equal to the current pre-CAS package revision, historical launch revision equal to the supervisor lease evidence, and an unexpired activation deadline. Its completion may authorize the package identity CAS but never satisfies `learning_runtime_active`.
- `production_activation` requires no pending generation, the plugin/supervisor/worker package generation to equal `active_package_generation_id`, `worker_mode = production`, `current_activation_revision` equal to the current post-CAS package revision, historical launch revision equal to the supervisor lease evidence, the fresh production fencing token, and package activation state `production_activating` or `active`.
- a completed preactivation record is invalid for production activation even when every other field matches; the production handshake must use a new activation id and nonce after the active-generation CAS and production lease acquisition.

Production-handshake launch binding is frozen:

- when the same supervisor lease that completed preactivation remains current through the identity CAS, the production handshake binds the original consumed transition authorization and launch attempt (`initial_candidate`, `pending`, or `rollback_candidate`) as immutable historical launch authority;
- the identity CAS must not rewrite that consumed authorization's role to `active`, and it does not require a supervisor restart merely to change package identity;
- if that supervisor lease is lost after the identity CAS, the gateway service controller must issue and consume a new `active` authorization for the exact current active generation before a replacement supervisor can acquire authority;
- a replacement supervisor's production handshake binds that new `active` authorization and replacement launch attempt;
- in every case, `launch_authorization_id`, immutable authorization revision, consumed authorization-state revision, role, `supervisor_launch_attempt_id`, and `launch_activation_revision_at_consumption` in the handshake must equal the historical launch evidence attached to the current supervisor lease, not whichever authorization happens to be newest in package authority state;
- `current_activation_revision` in the same handshake must independently equal the current package activation authority. Continuing-supervisor paths explicitly permit this current revision to be greater than the historical launch revision.

Therefore both paths are deterministic: continuing transition supervisor means transition-role launch evidence; replacement post-CAS supervisor means new `active` launch evidence. Neither path may invent, rewrite, or omit the actual launch authority used to obtain the current supervisor lease.

When no supervisor exists at expiry time, status projection treats the nonterminal handshake as expired from `expires_at` without granting activation. The next current supervisor may persist the `expired` transition through the normal CAS. No additional handshake writer is introduced.

Only a `production_activation` record with `status = complete` before `expires_at` can satisfy the handshake portion of `learning_runtime_active`. Late, duplicate, mismatched, preactivation-only, or stale-fence acknowledgments are rejected and cannot refresh an old activation record.

`interaction_active` requires:

- the current gateway instance executed the current plugin generation's registration path;
- the plugin resolved the canonical `home_id`;
- the plugin can expose deterministic status for the current gateway instance.

`learning_runtime_active` requires all of:

- `interaction_active = true`;
- current package generation identity is verified;
- package activation state is `active`;
- the current plugin, supervisor, and worker package generation equals `active_package_generation_id`;
- `fresh_supervisor_authority = true` for the exact supervisor owner/epoch bound by the handshake;
- worker lease is active and fresh;
- worker lease has `worker_mode = production`;
- worker fencing token matches the current lease;
- schema/migration status is `ready`;
- plugin, supervisor, worker, and configuration generation agree on `home_id`;
- a post-CAS `production_activation` nonce issued by the plugin is acknowledged by the current supervisor and production worker through the package-local control channel;
- the acknowledgment binds gateway instance, active package generation, current package activation revision, historical launch activation revision, immutable launch-authorization revision, consumed authorization-state revision, authorization role, supervisor launch attempt, supervisor epoch, production worker mode/fence, schema version, configuration generation, and effective route set;
- acknowledgment occurs before the handshake `expires_at`; when package state is `production_activating`, it must also occur before `activation_deadline_at`.

`production_learning_ready` additionally requires every capability marked required for production to have:

```text
validation_status = valid
benchmark_assurance in {recommended, supported}
runtime_health in {healthy, degraded_fallback}
```

The following are insufficient evidence by themselves:

- install record exists
- package files exist
- CLI inspection says `loaded`
- database file exists
- plugin process is present
- worker process is present
- one heartbeat exists without a matching current lease

Activation status is invalidated immediately when the gateway instance, package generation, supervisor epoch, worker fence, home identity, schema version, configuration generation, or effective route set changes.

`production_activation_authorized` in Section 4.9 is the write-authority subset of this live activation predicate. `learning_runtime_active` may add interaction/status requirements, but it cannot be true when `production_activation_authorized` is false, and worker-originated learning writes never use a weaker predicate.

For an ordinary restart of the already-active generation, the prior production handshake remains historical evidence only. After the new production worker lease/fence completes a fresh `production_activation` handshake, the current supervisor CASes `production_activation_handshake_id` to that record while preserving activation revision and state `active`. Until that pointer and every bound authority field match, `learning_runtime_active` remains false.

## 5. Production Quality Contract

Quality must be represented as orthogonal dimensions, not a single status enum.

### 5.1 Quality profile

The initial product contract should support:

```text
quality_profile:
- evaluated_recommended
- custom
```

`maximum_quality` is deferred until a benchmark-backed profile registry exists.

#### `evaluated_recommended`

- resolves a specific `profile_id` and `profile_version` from the packaged profile registry
- uses capability routes evaluated by the current ExperienceEngine contracts and benchmark process
- has documented cost, latency, and quality expectations
- is the default production recommendation

#### `custom`

- uses a user-selected compatible route
- requires connection and capability-contract validation
- does not imply benchmark-backed ExperienceEngine quality

### 5.2 Minimum packaged profile registry

`evaluated_recommended` cannot exist as an unversioned label. Phase 0.5A.1 must freeze a minimum local registry shipped with the package.

The registry does not need a remote service.

Minimum registry shape:

```text
registry_schema_version
registry_version
package_name
package_version
package_build_id
registry_digest
entries:
  - profile_id
    profile_version
    entry_status: active | deprecated | revoked
    supersedes_profile_version
    minimum_ee_version
    maximum_ee_version
    compatibility:
      node_version_range
      os_families
      architectures
      host_api_range
      gateway_version_range
    capability_contracts:
      <capability_id>:
        required_for_production
        contract_version
        route_spec_id
        benchmark_assurance: recommended | supported
        benchmark_evidence_ref
    route_specs:
      <route_spec_id>:
        provider_family
        identity_match_kind: exact | provider_model_pair | deployment_fingerprint_set
        allowed_model_or_deployment_fingerprints
        endpoint_policy
        auth_modes
        provider_adapter_version
    embedding_profile
    benchmark_evidence:
      evidence_id
      evidence_version
      benchmark_protocol_version
      scenario_set_digest
      report_digest
      publication_status
    expected_cost_class
    expected_latency_class
    published_at
    entry_digest
```

The registry must answer:

- which provider/model identity pattern the recommendation covers
- which capability contracts were evaluated
- which embedding route/profile is required
- which benchmark evidence version supports the profile
- whether a capability is required for core production readiness or optional
- when a contract/profile change invalidates the recommendation

Registry rules:

- the registry is immutable inside one package generation;
- `registry_digest` is computed from normalized registry content excluding the `registry_digest` field itself;
- `registry_digest` must match the installed package-generation metadata and published distribution attestation;
- the embedded registry must not contain final artifact integrity or an installation-specific `package_generation_id`, because those identities exist only after the artifact is sealed or installed;
- every `entry_digest` covers the normalized complete entry;
- selection requires an exact compatible active entry; partial matching cannot inherit `recommended` assurance;
- `deprecated` may continue for an already-selected compatible generation but is not selected for new initialization;
- `revoked` is never production-ready and immediately invalidates the profile when the registry containing that revocation becomes the verified active package generation; merely downloading an unactivated package does not mutate current assurance;
- unknown host, provider, model/deployment, adapter, or contract compatibility resolves to no evaluated profile rather than optimistic matching;
- a failed evaluated-profile match may become `custom` only after explicit user acknowledgment, never silently;
- registry/profile/entry digest changes make prior validation records stale.

### 5.3 Capability-specific route state

ExperienceEngine has multiple independently routed capabilities. One global assurance field or one global active-route field cannot represent reality.

Minimum state shape:

```text
capability_routes:
  learning_gate:
    enabled
    primary_route_id
    active_route_id
    active_route_kind: primary | fallback | none
    validation_status
    benchmark_assurance
    validation_record_id
    contract_version
    runtime_health

  distillation:
    ...same fields...

  embedding:
    ...same fields...

  sync_second_opinion:
    ...same fields...

  hybrid_postmortem:
    ...same fields...
```

Future reranker/model-backed retrieval routes should adopt the same contract when they become product capabilities.

State ownership must remain explicit:

```text
configuration generation
  user-declared profile, primary routes, fallback routes, and contract selections

generation validation state
  immutable validation evidence produced before that generation was committed

runtime route state
  bounded mutable projection of active route, current health, and last stable failure code
```

Recommended bounded runtime projection:

```text
runtime/runtime-route-state.json:
  projection_schema_version
  projection_revision
  home_id
  configuration_generation_id
  package_generation_id
  effective_route_set_id
  supervisor_owner_id
  supervisor_lease_epoch
  worker_fencing_token
  writer_instance_id
  written_at
  capabilities:
    <capability_id>:
      capability_revision
      active_route_id
      active_route_kind
      runtime_health
      failure_code
      checked_at
```

This file is not an event ledger. It is overwritten as a current projection and ignored when its home, configuration generation, package generation, effective route set, supervisor epoch, or worker fence does not match current authority.

Runtime-route projection ownership is frozen:

- the package-local supervisor is the only writer;
- the plugin is read-only;
- the worker submits capability-health observations through the package-local control channel and cannot write the file directly;
- the supervisor accepts a worker observation only when its worker fencing token is current;
- every update supplies `expected_projection_revision`; a stale revision is rejected and recomputed from current state;
- persistence uses a complete temporary file, file flush, and atomic replacement;
- missing, malformed, partially written, or authority-mismatched state projects `runtime_health = blocked` or `unknown/warming`, never healthy;
- the projection is rebuildable from current generation, lease, validation, and route-health state and is not a source of provenance truth.

Environment/runtime overrides are normalized into `effective_route_set_id`. Any override change creates a new effective route set, invalidates non-matching validation, and prevents an old runtime projection from being reused.

The complete `capability_routes` view is derived from the current generation, its immutable validation records, the resolved effective route, and the matching runtime-route projection.

Effective-route resolution ownership is frozen:

- initialization resolves candidate effective routes from candidate settings/secrets plus one captured allowlisted environment/runtime override snapshot;
- the package-local supervisor is the runtime authority for resolving current learning capability routes from the committed generation plus its captured override snapshot;
- the supervisor emits one immutable normalized route envelope per `effective_route_set_id` and passes it to the worker;
- the worker must not independently reinterpret environment precedence, provider/model identity, endpoint identity, auth mode, fallback order, or contract selection;
- the plugin reads the current effective route set and capability projection for status; it does not author learning-route identity;
- an allowlisted override change requires a supervisor route reload or restart, creates a new `effective_route_set_id`, invalidates mismatched validation immediately, and invalidates the prior activation handshake;
- unknown or non-allowlisted process environment does not silently alter capability routing.

Minimum normalized route envelope:

```text
route_envelope_schema_version
home_id
configuration_generation_id
package_generation_id
effective_route_set_id
override_snapshot_fingerprint
capabilities:
  <capability_id>:
    primary_route_fingerprint
    ordered_fallback_route_fingerprints
    contract_version
    validation_record_ids
    auth_identity_fingerprint
created_at
```

The envelope contains no raw endpoint, deployment, or secret value.

Validation and assurance are orthogonal:

```text
validation_status:
- valid
- stale
- invalid
- missing

benchmark_assurance:
- recommended
- supported
- unbenchmarked

runtime_health:
- healthy
- degraded_fallback
- blocked
- disabled
```

Examples:

```text
learning_gate: valid + recommended + primary + healthy
distillation: valid + supported + fallback + degraded_fallback
embedding: valid + recommended + primary + healthy
hybrid_postmortem: valid + supported + none + blocked
```

`invalid` and `stale` are validation states, not benchmark assurance levels.

A custom route that passes contract validation is represented as:

```text
validation_status = valid
benchmark_assurance = unbenchmarked
```

Do not use `custom_unverified`, because it incorrectly suggests that runtime and contract validation did not occur.

### 5.4 Derived product conclusions

Plain-language product conclusions are projections over the selected profile and required capability states. They are not stored as one mutable global enum.

For an evaluated recommended profile:

```text
production_ready =
  current profile_id/profile_version exists in the packaged registry
  AND every capability marked required_for_production has validation_status = valid
  AND every required capability has benchmark_assurance in {recommended, supported}
  AND every required capability has runtime_health in {healthy, degraded_fallback}
```

Optional capabilities may be disabled or blocked without falsely claiming that they are active. Their state must be shown separately when it changes user-visible behavior.

For a custom profile, the default conclusion is:

```text
Contract valid; quality unbenchmarked
```

even when all required routes are currently healthy.

Suggested display:

```text
Host setup: Ready
Learning profile: Evaluated recommended
Core learning quality: Production
Distillation route: Validated fallback active
Hybrid postmortem: Paused
Value progress: Warming up
```

### 5.5 Custom-generated candidate and node boundary

A custom unbenchmarked route must require explicit acknowledgment:

```text
Connection and ExperienceEngine contract checks passed.
This route has not been benchmark-validated by ExperienceEngine.
```

It may:

- generate candidates
- generate formal nodes after structural and learning gates pass
- participate in shadow evaluation

Every node whose semantic-origin provenance includes an unbenchmarked custom generation must remain `shadow_only` for the full lifetime of `custom-shadow-only-v1`.

#### Future deterministic conservative canary protocol boundary

Custom route output must not grant itself live-delivery eligibility.

Initial protocol decision:

```text
custom_generation_live_delivery_policy_version: custom-shadow-only-v1
custom_generated_node_delivery_state: shadow_only
custom_conservative_canary: deferred
```

Under `custom-shadow-only-v1`, every node whose semantic-origin provenance contains an unbenchmarked custom generation remains `shadow_only` regardless of later model confidence, promotion fields, structural completeness, or same-scope retrieval score. No custom-generated node may enter conservative or normal live delivery in the initial implementation.

The deterministic canary conditions below define requirements for a later independently frozen policy. They are not an enabled transition, maturity path, or implementation slice in `custom-shadow-only-v1`.

The following model-produced fields cannot independently qualify a node for conservative canary delivery:

- `promotion_signal`
- `promotion_reason`
- model-declared risk level
- model-declared confidence
- structured-field completeness by itself

Conservative canary eligibility must be computed outside the generating model from deterministic evidence, including all required conditions:

- the source task has objective success evidence
- delivery remains same-scope
- task-family applicability is exact or otherwise deterministically bounded
- the node has no harm history
- guidance is classified as low-risk and non-destructive by deterministic policy
- the eligibility decision has a stable reason code
- delivery is bounded to one node
- retrieval/applicability evidence satisfies the conservative threshold
- no portability claim is used before independent evidence exists

The existing `priority_candidate -> conservative_only` path cannot be reused for custom output. Enabling any custom conservative canary requires a later protocol version with exact inputs, thresholds, reason codes, benchmark evidence, and rollout bounds.

#### Immutable generation provenance

Every candidate and generated node must preserve the route and contract facts used when its semantic content was created:

```text
generation_route_fingerprint
generation_validation_record_id
generation_benchmark_assurance
generation_contract_version
generation_profile_id
generation_profile_version
```

The field list above is one normalized semantic-origin reference, not a mutable set of “current source” columns.

Minimum semantic origin reference:

```text
provenance_schema_version
provenance_key
configuration_generation_id
package_generation_id
generation_profile_id
generation_profile_version
stage_routes:
  learning_gate:
    route_fingerprint
    validation_record_id
    benchmark_assurance
    contract_version
  distillation:
    route_fingerprint
    validation_record_id
    benchmark_assurance
    contract_version
  merge_decision:
    route_kind: deterministic | model
    route_fingerprint
    validation_record_id
    benchmark_assurance
    contract_version
assurance_floor
origin_record_count
first_origin_at
last_origin_at
```

`provenance_key` is the digest of the normalized generation/profile/stage-route/contract tuple. It does not include mutable current configuration.

For provenance-floor calculation, assurance ordering is:

```text
unbenchmarked < supported < recommended
```

`revoked` is profile status rather than benchmark assurance. Any revoked-profile origin sets `contains_revoked_profile_origin = true` and cannot be hidden by a higher assurance from another origin.

Candidates preserve the exact reference used to create their semantic content.

Nodes preserve provenance in a dedicated relation keyed by `(node_id, provenance_key)`. A merge transaction must update node content and provenance relations atomically.

Bounded aggregation protocol:

- deduplicate identical provenance keys and increment `origin_record_count`;
- retain up to 64 exact provenance keys per node;
- when the exact-key bound is exceeded, compact the least-recent low-frequency keys into aggregate buckets keyed by profile identity, assurance floor, and contract-version tuple;
- each aggregate bucket preserves origin count, first/last time, worst assurance, and a rolling digest of compacted provenance keys;
- compaction may reduce exact route detail but may never raise assurance, erase an `unbenchmarked` origin, or relabel custom content as evaluated;
- diagnostics disclose exact-key and compacted-origin counts.

Derived node provenance fields include:

```text
contains_unbenchmarked_origin
contains_revoked_profile_origin
semantic_origin_count
effective_generation_assurance_floor
```

Delivery assurance cannot exceed the worst relevant semantic-origin assurance. Under `custom-shadow-only-v1`, any `contains_unbenchmarked_origin = true` is an unconditional delivery-state cap: no deterministic governance rule, outcome evidence, repeated success, manual promotion, confidence score, or same-scope maturity may move the node out of `shadow_only`.

For nodes whose complete provenance contains only benchmark-backed supported/recommended origins, independent governance and outcome evidence may still affect delivery maturity under the existing evaluated policy. That evaluated-origin behavior does not apply to custom-origin nodes in v1.

If a node later absorbs content produced by another route, the implementation must append or aggregate origin provenance rather than overwriting the old source with the current configuration.

Changing the user's current provider must never relabel existing custom-generated content as recommended or supported.

Generation benchmark assurance and node governance maturity are separate:

- generation assurance may remain `unbenchmarked`
- custom-origin governance evidence may accumulate for diagnostics, evaluation, and future policy design only
- governance maturity and outcome evidence cannot change a custom-origin node's `shadow_only` delivery state in v1
- any future custom live-delivery transition requires a new independently frozen policy version and does not retroactively benchmark-validate the generating model

### 5.6 Global learning health projection

The product may derive a concise aggregate learning-health line, but it must not replace capability state.

```text
learning_health:
- healthy
- degraded
- paused
- explicitly_disabled
```

Suggested derivation:

- `healthy`
  - all required learning capabilities are healthy on their primary routes
- `degraded`
  - all required learning capabilities remain usable, but at least one uses a validated fallback
- `paused`
  - at least one required capability is blocked or has no active valid route
- `explicitly_disabled`
  - the operator intentionally disabled core learning

The summary must link to capability-specific detail in verbose status/doctor output.

## 6. Provider And Embedding Validation Contract

### 6.1 Validation objectives

Provider validation must distinguish:

- configuration is present
- endpoint and authentication resolve
- the route is reachable
- the route satisfies ExperienceEngine contracts
- the route belongs to a benchmark-backed assurance profile

### 6.2 Distillation and learning probes

Required probes:

1. resolve the candidate endpoint and authentication mode
2. perform a minimal request using the actual ExperienceEngine provider adapter
3. validate the learning-gate response contract
4. validate the distillation response contract
5. when hybrid LLM behavior is enabled, validate the relevant hybrid response contract
6. verify that known model metadata satisfies the minimum context and output budget required by the selected ExperienceEngine contract/profile
7. record latency and response size as diagnostics
8. reject responses that cannot satisfy required structured output

Unknown metadata does not automatically prove a route invalid, but it prevents the route from receiving benchmark-backed recommended assurance until runtime probes and evaluation evidence establish the required capability.

Tool-calling support is not a universal validation requirement because the current ExperienceEngine learning contracts do not require model tool calls.

### 6.3 Embedding validation

Embedding validation is independent from reasoning-model validation.

Required probes:

- resolve the configured embedding route
- create an embedding for a fixed non-sensitive validation string
- validate vector shape and finite numeric values
- perform a local write/read or nearest-neighbor smoke against an isolated temporary validation index where appropriate
- record the embedding profile and contract version

### 6.4 Validation record

Validation records should be bounded configuration state, not a new event ledger.

Storage decision for Phase 0.5A.1:

- use a dedicated machine-owned `validation-state.json`
- commit it inside the same immutable configuration generation as settings and secrets
- not task history tables
- do not mix machine-derived validation facts into the user-authored settings object

Minimum record:

```text
validation_record_id
configuration_generation_id
home_id
package_generation_id
capability: learning_gate | distillation | embedding | sync_second_opinion | hybrid_postmortem
route_id
route_fingerprint
effective_route_set_id
provider_family
model_or_deployment_fingerprint
auth_mode
secret_ref_set_fingerprint
resolved_secret_material_fingerprint
endpoint_identity_fingerprint
quality_profile
contract_version
profile_version
provider_adapter_version
request_schema_version
response_schema_version
profile_registry_digest
benchmark_evidence_ref
validation_status: valid | stale | invalid | missing
benchmark_assurance: recommended | supported | unbenchmarked
validated_at
latency_ms
failure_code
```

Identity fingerprints must be computed from the resolved normalized identity with a local secret salt:

```text
HMAC(machine_integrity_key, "validation-identity-v1\0" || normalized_identity)
```

`resolved_secret_material_fingerprint` is computed as:

```text
HMAC(machine_integrity_key, "resolved-secret-material-v1\0" || normalized_capability_auth_binding || "\0" || resolved_secret_material)
```

It is not a reusable credential hash and is never shown in ordinary diagnostics.

Changing an environment variable, file-backed secret, stored secret, or runtime secret provider result while retaining the same reference name changes this fingerprint and makes the validation record stale.

Do not rely on an unsalted hash for low-entropy endpoint or deployment names.

The record must not persist:

- API keys
- bearer tokens
- raw provider responses
- raw endpoint URLs by default
- arbitrary deployment names in public diagnostics

### 6.5 Validation invalidation

A validation record becomes stale when any relevant field changes:

- provider family
- model/deployment identity
- endpoint identity
- auth mode
- ExperienceEngine request/response contract version
- evaluated profile version
- embedding model/profile
- secret reference set or resolved secret material

Validation binds to the final resolved effective route, not only to stored settings.

The current configuration precedence includes environment and runtime overrides before settings. Therefore any effective override to provider, model, endpoint, auth mode, embedding route, or capability route must make a non-matching validation record stale immediately.

A time-based revalidation interval may be added later, but configuration and contract changes must invalidate immediately.

### 6.6 Atomic initialization

Initialization must change from incremental mutation to candidate-configuration commit.

Required flow:

```text
collect candidate settings and secrets in memory
-> resolve all required routes
-> run distillation/learning validation
-> run embedding validation
-> show final summary
-> write one complete immutable configuration generation
-> atomically compare-and-swap one authoritative configuration pointer row
```

Required storage shape:

```text
config-generations/
  <generation-id>/
    settings.json
    secrets.json
    validation-state.json
    manifest.json

shared SQLite control plane:
  configuration_pointer

current-generation.json  # optional diagnostic projection, not authority
```

Minimum immutable generation manifest:

```text
manifest_schema_version
generation_id
parent_generation_id
home_id
integrity_key_id
settings_schema_version
secrets_schema_version
validation_schema_version
required_files
non_secret_file_digests
secrets_file_hmac
secret_ref_set_fingerprint
profile_registry_digest
created_at
created_by_instance_id
generation_state: complete
```

`secrets_file_hmac` is computed over the exact secrets file bytes with the adopted machine integrity key under the `manifest-secret-file-v1` domain. No second manifest-integrity key or salt lifecycle exists. A raw unsalted digest of secrets is not stored.

Machine integrity key contract:

```text
machine-secrets/integrity-key.json:
  key_schema_version
  integrity_key_id
  key_material
  created_at
```

- the key file lives inside the canonical home but outside every configuration generation;
- creation occurs after canonical home resolution but before control-plane SQLite bootstrap;
- the gateway service controller, package-local initializer, and supervisor use the same atomic create-if-absent/adopt routine with user-only permissions;
- concurrent creators converge on the first committed key and discard uncommitted candidates;
- the winning key id is bound into `runtime_control_meta` in the first bootstrap transaction;
- the key file is never included in diagnostics, exports, distribution manifests, or configuration-generation manifests;
- manifests store only `integrity_key_id` and HMAC outputs;
- missing or unreadable key material makes the selected generation unverifiable and therefore not initialized;
- any observed key id different from `runtime_control_meta.integrity_key_id` produces `EE_INTEGRITY_KEY_MISMATCH` and blocks startup;
- machine-integrity-key rotation, replacement, deletion, or re-signing is not supported in the initial protocol and requires a later independently frozen migration protocol.

The same machine integrity key may support bounded local fingerprints only through explicit domain separation:

```text
manifest-secret-file-v1
validation-identity-v1
resolved-secret-material-v1
diagnostic-identity-v1
home-path-v1
```

Each HMAC input begins with its exact domain label and a zero-byte separator. Outputs from one domain are never reused as inputs or identifiers in another domain.

Minimum pointer shape:

```text
pointer_schema_version
pointer_revision
generation_id
previous_generation_id
manifest_digest
commit_id
committed_at
```

Minimum configuration-generation authority record:

```text
generation_id
home_id
parent_generation_id
manifest_digest
integrity_key_id
profile_registry_digest
created_by_instance_id
created_at
committed_at
generation_state: committed | abandoned
```

Only `committed` generations may be referenced by current/previous pointer fields. Current versus previous/superseded role is derived from `configuration_pointer`, not stored by mutating the immutable generation authority record. `abandoned` is diagnostic cleanup state and can never become current without a new full verification and commit transaction.

Commit protocol:

1. read and retain the base pointer revision/generation
2. collect candidate settings and secrets in memory
3. resolve the final effective routes that will be validated
4. create a new immutable generation directory
5. write settings, secrets, validation state, and the final complete manifest
6. fsync files and generation directory where supported
7. verify manifest completeness, digests/HMACs, schema versions, home identity, profile registry digest, validation references, and secret references
8. begin `BEGIN IMMEDIATE` against the shared control-plane database
9. reread `configuration_pointer`
10. require the current pointer revision/generation to equal the retained base values
11. verify the target generation manifest, home identity, and absence of a conflicting generation authority record inside the commit operation
12. insert the target `configuration_generations` record as `committed`
13. compare-and-swap `configuration_pointer` to `pointer_revision + 1`, moving the prior current id into `previous_generation_id` and requiring exactly one changed row
14. commit the generation registration and pointer CAS in the same SQLite transaction
15. optionally atomically replace `current-generation.json` as a diagnostic projection of the committed authority row
16. retain at least the previous complete generation for recovery

If the pointer changed after validation, the initializer loses the CAS, leaves the new generation uncommitted, and must not silently rebase it. A new validation run is required because effective routes or secrets may have changed.

The SQLite pointer row is the sole configuration authority. A file projection may lag or be absent after a crash and is ignored when its revision/digest does not match the authority row.

Crash outcomes are bounded:

- crash before pointer transaction commit leaves the prior generation current;
- crash after the authority transaction commit exposes the complete preverified and registered new generation;
- crash while writing the optional file projection does not change authority;
- concurrent initializers cannot both commit from the same base pointer revision.

Runtime readers must only load the complete generation referenced by the authoritative `configuration_pointer` row.

Per-file rename plus process-local rollback is not crash-atomic and is not an accepted final protocol. This design selects immutable generation files plus one transactional authority-pointer CAS.

Environment-variable and runtime overrides are not written into the generation. They must be incorporated into `effective_route_set_id` at load time; when they change the validated route, capability validation becomes stale until revalidated. The runtime projection for the old effective route set is ignored.

Generation retention must be bounded. By default retain the current and immediately previous complete generation only, apply user-only filesystem permissions to every secrets file, exclude secret values from manifests and diagnostics, and garbage-collect older generations after a successful pointer commit. Garbage collection must not delete a generation referenced by the current pointer, previous pointer field, active supervisor/worker lease, or in-flight claimed job. Rollback to a generation containing older credentials must be an explicit operator action.

Startup behavior:

- runtime readers load only the control-plane-pointer-selected generation whose manifest digest and all internal references verify;
- an unregistered or uncommitted complete generation is never auto-selected by modification time;
- a missing control-plane pointer yields `current_configuration_state = incomplete` and requires explicit initialization or recovery;
- a pointer-selected generation with manifest/secrets/validation mismatch is invalid and cannot become `Initialized`;
- recovery to `previous_generation_id` is an explicit pointer CAS after verifying that generation; it is not modification-time guessing;
- secret values are never copied into validation state, manifests, runtime-route projection, or diagnostics.

### 6.7 Relationship to `Initialized`

The existing setup state remains:

```text
Installed -> Initialized -> Ready
```

Revised meaning:

- `Installed`
  - host integration/package state exists
- `Initialized`
  - the authoritative `configuration_pointer` row references a complete readable configuration generation whose manifest and internal references verify
- `Ready`
  - the current host/runtime session is actively wired to that complete generation

Current validation and runtime health remain separate projections. A complete generation may remain initialized while a capability becomes stale, invalid, or blocked.

Persist and project these facts separately:

```text
initialized_once_at
current_configuration_state: missing | incomplete | complete
current_validation_state: valid | stale | invalid | missing
host_runtime_readiness: not_wired | restart_required | ready | unavailable
```

`initialized_once_at` is historical evidence only. It must never prove that the current effective configuration is still valid.

`Ready` means host wiring is active against a complete generation. It does not imply that every learning capability is currently healthy.

## 7. Capability-Specific Routing And Stage Fallback Matrix

The production contract must prohibit rule-generated semantic substitution while preserving deterministic control and safety behavior.

### 7.1 Capability routing contract

There is no single global runtime fallback chain that can safely represent every current learning capability.

Each capability must define independently:

```text
capability_id
primary_route_id
validated_fallback_route_ids
fallback_trigger_codes
contract_version
validation_record_ids
active_route_id
active_route_kind: primary | fallback | none
runtime_health
```

The same provider/model may be reused by several capabilities, but validation and active-route state remain capability-specific because:

- the learning gate has its own request, retry, and response contract
- distillation uses the shared request dispatcher and a different output contract
- embedding uses independent provider and local fallback behavior
- sync second opinion has an independent production decision boundary
- hybrid postmortem uses a separate worker/client path

A route validated for one capability must not automatically be considered valid for another capability.

Fallback activation must persist or expose the actual capability route used. A global `fallback_active` flag is insufficient.

### 7.2 Stage behavior matrix

| Stage | Provider unavailable or invalid | Deterministic behavior allowed | New semantic learning content allowed | Queue behavior |
| --- | --- | --- | --- | --- |
| Learning eligibility | Continue deterministic admission/rejection checks | Yes | No | Eligible work may become blocked pending a valid route |
| Candidate generation | Do not call rule analysis as a production semantic substitute | Only skip/defer metadata | No | Block without consuming content retry budget |
| Distillation | Do not create passthrough/rule production nodes | Validation and structural rejection only | No | Block or route to validated fallback |
| Merge decision | Deterministic safety/conservative merge control may continue | Yes | No new semantic text | Existing validated draft may be conservatively merged or deferred |
| Embedding generation | Use a validated embedding fallback if configured | Validation and route selection | No semantic content | Block indexing work if no validated route exists |
| Retrieval | Existing lexical/deterministic retrieval may continue only under its existing evaluated policy | Yes | Not applicable | Skip delivery if required evidence is unavailable |
| Applicability and scope | Continue deterministic gates | Yes | Not applicable | Not applicable |
| Sync second opinion | Use validated fallback if configured; otherwise follow deterministic production gate | Yes, including skip | No | No learning job mutation |
| Hybrid postmortem | Defer review when no validated route exists | Deterministic metadata only | No LLM review substitute | Block postmortem work without content-failure consumption |
| Attribution | Continue deterministic trajectory/outcome attribution | Yes | No generated experience content | Use `uncertain` when evidence is insufficient |
| Delivery governance | Continue lifecycle, delivery-state, harm, and repo-policy gates | Yes | Not applicable | Not applicable |

### 7.3 Existing specification supersession

The older explicit-provider alignment design currently defines `auto -> rule` as a formal behavior.

This revision does not delete backward-compatible rule mode, but it changes the production-profile contract:

- explicit `rule` remains available for compatibility and experiments
- legacy `auto -> rule` behavior must not be used as silent production fallback after a configured provider failure
- after Phase 0.5A.1 protocol freeze, production profile behavior must be implemented through explicit OpenSpec requirements before code changes

The implementation phase must explicitly mark which requirements in the older design are superseded.

## 8. Failure Taxonomy And Queue Lifecycle

### 8.1 Failure categories

Minimum stable failure codes:

```text
EE_PROVIDER_TRANSIENT
EE_PROVIDER_RATE_LIMITED
EE_PROVIDER_AUTH_INVALID
EE_PROVIDER_MODEL_INVALID
EE_PROVIDER_CONFIGURATION_INVALID
EE_PROVIDER_CONTRACT_INVALID
EE_ROUTE_OUTPUT_SCHEMA_INVALID
EE_CANDIDATE_OUTPUT_SCHEMA_INVALID
EE_CANDIDATE_CONTENT_INVALID
EE_EMBEDDING_TRANSIENT
EE_EMBEDDING_CONFIGURATION_INVALID
EE_SQLITE_BUSY
EE_SQLITE_COMMIT_INTERRUPTED
EE_SUPERVISOR_UNAVAILABLE
EE_SUPERVISOR_RESTART_EXHAUSTED
EE_WORKER_INTERRUPTED
EE_CLAIM_EXPIRED
EE_FENCING_REJECTED
EE_HOME_IDENTITY_MISMATCH
EE_INTEGRITY_KEY_MISMATCH
EE_SCHEMA_MIGRATION_REQUIRED
EE_SCHEMA_MIGRATION_FAILED
EE_SCHEMA_INCOMPATIBLE
EE_PACKAGE_INCOMPATIBLE
EE_CONFIGURATION_POINTER_CONFLICT
EE_ACTIVATION_HANDSHAKE_FAILED
EE_ACTIVATION_HANDSHAKE_EXPIRED
EE_ACTIVATION_HANDSHAKE_REPLAY
EE_ACTIVATION_HANDSHAKE_AUTHORITY_MISMATCH
EE_CONTROL_REQUEST_CONFLICT
EE_CONTROL_REQUEST_STALE
EE_OPENCLAW_EXECUTABLE_UNRESOLVED
EE_CANDIDATE_MISSING
EE_OPERATOR_CANCELLED
```

Each code maps to exactly one failure class and one default failure scope. Context-sensitive failures use distinct codes rather than changing class based on prose.

```text
failure_class:
- system_route
- candidate_content
- interruption
- terminal

failure_scope:
- provider_route
- candidate
- embedding_route
- sqlite
- supervisor
- worker_claim
- home
- schema
- package
- configuration
- activation
- control
- host_tooling
```

Stable mapping:

| Failure code(s) | Failure class | Default scope |
| --- | --- | --- |
| `EE_PROVIDER_TRANSIENT`, `EE_PROVIDER_RATE_LIMITED`, `EE_PROVIDER_AUTH_INVALID`, `EE_PROVIDER_MODEL_INVALID`, `EE_PROVIDER_CONFIGURATION_INVALID`, `EE_PROVIDER_CONTRACT_INVALID`, `EE_ROUTE_OUTPUT_SCHEMA_INVALID` | system_route | provider_route |
| `EE_CANDIDATE_OUTPUT_SCHEMA_INVALID`, `EE_CANDIDATE_CONTENT_INVALID` | candidate_content | candidate |
| `EE_EMBEDDING_TRANSIENT`, `EE_EMBEDDING_CONFIGURATION_INVALID` | system_route | embedding_route |
| `EE_SQLITE_BUSY` | system_route | sqlite |
| `EE_SQLITE_COMMIT_INTERRUPTED` | interruption | sqlite |
| `EE_SUPERVISOR_UNAVAILABLE` | interruption | supervisor |
| `EE_SUPERVISOR_RESTART_EXHAUSTED` | system_route | supervisor |
| `EE_WORKER_INTERRUPTED`, `EE_CLAIM_EXPIRED`, `EE_FENCING_REJECTED` | interruption | worker_claim |
| `EE_HOME_IDENTITY_MISMATCH`, `EE_INTEGRITY_KEY_MISMATCH` | system_route | home |
| `EE_SCHEMA_MIGRATION_REQUIRED`, `EE_SCHEMA_MIGRATION_FAILED`, `EE_SCHEMA_INCOMPATIBLE` | system_route | schema |
| `EE_PACKAGE_INCOMPATIBLE` | system_route | package |
| `EE_CONFIGURATION_POINTER_CONFLICT` | system_route | configuration |
| `EE_ACTIVATION_HANDSHAKE_FAILED`, `EE_ACTIVATION_HANDSHAKE_EXPIRED`, `EE_ACTIVATION_HANDSHAKE_REPLAY`, `EE_ACTIVATION_HANDSHAKE_AUTHORITY_MISMATCH` | system_route | activation |
| `EE_CONTROL_REQUEST_CONFLICT`, `EE_CONTROL_REQUEST_STALE` | system_route | control |
| `EE_OPENCLAW_EXECUTABLE_UNRESOLVED` | system_route | host_tooling |
| `EE_CANDIDATE_MISSING`, `EE_OPERATOR_CANCELLED` | terminal | candidate |

### 8.2 System-route failures versus content failures

#### System-route failures

Examples:

- provider transient outage
- rate limit
- invalid auth
- invalid endpoint configuration
- embedding route unavailable
- SQLite ownership/contention failure
- schema or package incompatibility
- missing supervisor/worker authority
- activation handshake failure

These failures must not consume a candidate's content retry budget.

They should:

- activate a validated fallback route when available
- otherwise block affected work
- update learning health
- preserve the job for recovery
- provide an exact operator action when configuration repair is required

#### Candidate/content failures

Examples:

- repeated schema-invalid output for one candidate after the route itself passed validation
- candidate data cannot satisfy required structure
- candidate disappeared
- confirmed irrecoverable content corruption

These may consume bounded content retry budgets.

### 8.3 Minimal entity-specific states

The implementation should prefer a small extension rather than a large workflow engine.

Job and candidate state names must preserve entity meaning.

```text
job:
- pending
- processing
- blocked
- failed
- succeeded
- discarded

candidate:
- pending
- blocked
- failed
- distilled
- discarded
```

Definitions:

- `pending`
  - runnable work
- `processing`
  - active atomic job claim owned by the current worker fence
- `blocked`
  - valid work waiting for system/provider recovery; no content retry consumption
- `failed`
  - candidate-specific retryable failure; content retry budget applies
- `succeeded`
  - job execution completed successfully
- `distilled`
  - candidate produced or merged into a formal node successfully
- `discarded`
  - confirmed irrecoverable, operator-cancelled, or candidate no longer exists

### 8.4 Required queue metadata

```text
state_revision
claim_id
claim_owner_id
claim_fencing_token
claimed_package_generation_id
claimed_configuration_generation_id
claimed_route_fingerprint
claimed_activation_revision
claimed_production_activation_handshake_id
claimed_supervisor_lease_epoch
claimed_at
claim_heartbeat_at
claim_expires_at
failure_code
failure_class: system_route | candidate_content | interruption | terminal
failure_scope
system_attempt_count
interruption_count
content_retry_count
next_attempt_at
blocked_at
route_fingerprint
```

Candidate metadata must preserve its independent `content_retry_count`, lifecycle state, semantic-origin provenance, and terminal reason. It must not copy worker lease or transient claim ownership as candidate truth.

Claim fields are non-null only while `status = processing`. Every transition out of `processing` clears claim identity in the same transaction.

`retry_budget_kind` is derived from `failure_class` and should not be stored separately.

`last_error_code` duplicates `failure_code` and should not be added.

Free-text provider errors should not become the product contract.

### 8.5 Mechanical transition table

| Failure code | Failure class | Job next state | Candidate next state | Consume content retry | Automatic retry | Resume trigger |
| --- | --- | --- | --- | --- | --- | --- |
| `EE_PROVIDER_TRANSIENT` | system_route | blocked | blocked | No | Yes, bounded backoff probe | primary or validated fallback health probe succeeds |
| `EE_PROVIDER_RATE_LIMITED` | system_route | blocked | blocked | No | Yes, provider-aware backoff | rate-limit backoff expires and route probe succeeds |
| `EE_PROVIDER_AUTH_INVALID` | system_route | blocked | blocked | No | No | operator repairs credentials and validation succeeds |
| `EE_PROVIDER_MODEL_INVALID` | system_route | blocked | blocked | No | No | operator changes route and validation succeeds |
| `EE_PROVIDER_CONFIGURATION_INVALID` | system_route | blocked | blocked | No | No | configuration generation is replaced and validation succeeds |
| `EE_PROVIDER_CONTRACT_INVALID` | system_route | blocked | blocked | No | No | route or contract changes and validation succeeds |
| `EE_CANDIDATE_OUTPUT_SCHEMA_INVALID` for one candidate after a valid route | candidate_content | failed | failed | Yes | Yes, bounded | candidate succeeds, retry budget exhausts, or operator acts |
| `EE_ROUTE_OUTPUT_SCHEMA_INVALID` during explicit initialization validation or an explicit route health probe | system_route | blocked | blocked | No | No | route validation succeeds under the required contract |
| `EE_CANDIDATE_CONTENT_INVALID` | candidate_content | failed | failed | Yes | Yes, bounded | candidate succeeds or content retry budget exhausts |
| `EE_EMBEDDING_TRANSIENT` | system_route | blocked | blocked | No | Yes, bounded backoff probe | embedding route probe succeeds |
| `EE_EMBEDDING_CONFIGURATION_INVALID` | system_route | blocked | blocked | No | No | embedding configuration and validation succeed |
| `EE_SQLITE_BUSY` before a claim is committed | system_route | pending | pending | No | Yes, bounded contention backoff | a later atomic claim succeeds |
| `EE_SQLITE_COMMIT_INTERRUPTED` during a fenced result commit | interruption | processing until claim deadline, then pending | pending | No | Yes, only while the claim/fence remains current | commit succeeds before deadline or stale-claim recovery runs |
| `EE_SUPERVISOR_UNAVAILABLE` | interruption | pending | pending | No | Yes, after current supervisor ownership is restored | supervisor lease becomes active and worker reacquires ownership |
| `EE_SUPERVISOR_RESTART_EXHAUSTED` | system_route | blocked | blocked | No | No | operator repair or a new package generation restores supervisor health |
| `EE_WORKER_INTERRUPTED` | interruption | pending | pending | No | Yes, through stale-lease recovery | worker ownership is recovered safely |
| `EE_CLAIM_EXPIRED` | interruption | pending | pending | No | Yes, through fenced reclaim | a current worker claims the job with a new claim id |
| `EE_FENCING_REJECTED` | interruption | pending | pending | No | Yes, after current ownership is observed | stale output is discarded and a current worker reclaims the job |
| `EE_HOME_IDENTITY_MISMATCH` | system_route | blocked | blocked | No | No | plugin, supervisor, worker, and configuration generation resolve the same home identity |
| `EE_SCHEMA_MIGRATION_REQUIRED` | system_route | blocked | blocked | No | No | the current migration owner completes and verifies migration |
| `EE_SCHEMA_MIGRATION_FAILED` | system_route | blocked | blocked | No | No | operator repair or compatible package migration succeeds |
| `EE_SCHEMA_INCOMPATIBLE` | system_route | blocked | blocked | No | No | a schema-compatible package generation becomes active |
| `EE_PACKAGE_INCOMPATIBLE` | system_route | blocked | blocked | No | No | a compatible package generation becomes active |
| `EE_ACTIVATION_HANDSHAKE_FAILED` | system_route | blocked | blocked | No | Yes, bounded during startup; then operator action | a current end-to-end activation handshake succeeds |
| `EE_CANDIDATE_MISSING` | terminal | discarded | discarded | No | No | none |
| `EE_OPERATOR_CANCELLED` | terminal | discarded | discarded | No | No | none |

Initial retry-policy decision:

```text
route_failure_escalation_policy_version: route-escalation-disabled-v1
automatic_candidate_to_route_escalation: disabled
```

Under `route-escalation-disabled-v1`, repeated candidate-specific schema/content failures never automatically convert into `EE_ROUTE_OUTPUT_SCHEMA_INVALID`, regardless of count or time window. They remain candidate-content failures and consume only the affected candidate's bounded content retry budget.

Route-level schema invalidity may be established only by an explicit initialization validation or explicit route health probe executed under the route contract. Adding cross-candidate automatic escalation requires a later independently frozen policy defining exact distinct-candidate counting, observation window, minimum sample size, reset conditions, exclusions, and retry consequences.

Content retry exhaustion transitions both failed job and failed candidate to `discarded` with a terminal reason code. System-route failure must never consume this budget.

Transition mechanics:

- all worker-originated transitions from `processing` require the current `claim_id`, claim owner, claim fencing token, expected `state_revision`, and `production_write_authorized(existing_claim)` in the same transaction;
- that guard requires `claimed_activation_revision`, `claimed_production_activation_handshake_id`, and `claimed_supervisor_lease_epoch` to equal the current package activation revision, current authoritative production handshake, and current supervisor epoch, in addition to the current worker owner/fence, configuration generation, route fingerprint, schema, package, and home bindings;
- successful completion updates node/provenance, candidate, and job in one transaction only while that full production authority remains current;
- worker-originated blocked/failed/discarded transitions update job and candidate in one transaction only while that same full production authority remains current;
- when activation, handshake, supervisor, worker, configuration, route, schema, package, or home authority no longer matches, the stale worker cannot choose success, blocked, failed, or discarded and cannot create or update candidate, node, embedding, provenance, attribution, or governance semantic content;
- authority loss permits only fenced interruption recovery by the current supervisor/gateway recovery authority or claim-expiry recovery: clear the stale claim, return recoverable work to `pending`, increment `interruption_count`, preserve `content_retry_count`, and discard stale computed output;
- stale-lease recovery may transition only claims whose expiry and prior owner/fence still match;
- an update affecting zero rows is a lost CAS and must not be retried as candidate-content failure;
- free-text error detail may be retained in bounded local diagnostics but cannot drive state transitions.

Setup, distribution, and host-tooling failures such as `EE_CONFIGURATION_POINTER_CONFLICT` and `EE_OPENCLAW_EXECUTABLE_UNRESOLVED` do not mutate existing job/candidate state by themselves. They affect setup/repair projections. Queue work changes only when a current runtime capability is actually unavailable, using the corresponding route, schema, package, or activation failure code.

### 8.6 Resume semantics

Blocked work becomes pending when:

- a route validation succeeds for the required route
- a validated fallback becomes active
- an operator explicitly retries after repair
- a time-based transient backoff expires and health probing succeeds

Resume must be idempotent and bounded.

The transition from blocked to pending must retain the original candidate, content retry count, and generation provenance. It may update only route-health and attempt metadata.

## 9. Setup, Quality, Health, And Value Projection

The product should show separate dimensions.

### 9.1 Projection dimensions

```text
Setup state:
- Installed
- Initialized
- Ready

Quality profile:
- Evaluated recommended
- Custom

Core learning quality:
- Production
- Contract valid; quality unbenchmarked
- Validation stale
- Validation invalid
- Missing configuration

Learning health:
- Healthy
- Degraded
- Paused
- Explicitly disabled

Capability details:
- Learning gate
- Distillation
- Embedding
- Sync second opinion
- Hybrid postmortem

Each capability projects:
- enabled/disabled
- active primary/fallback/none
- valid/stale/invalid/missing
- recommended/supported/unbenchmarked
- healthy/degraded fallback/blocked/disabled

Value state:
- Warming up
- First value reached

Outcome-confirmed value:
- Not reached
- Reached
```

### 9.2 Projection examples

Healthy production:

```text
Setup: Ready
Learning profile: Evaluated recommended
Core learning quality: Production
Learning health: Healthy
Value: Warming up
Next: complete a real debugging or implementation task
```

Validated fallback:

```text
Setup: Ready
Learning profile: Evaluated recommended
Core learning quality: Production
Learning health: Degraded
Distillation: Validated fallback active
Value: First value reached
Next: inspect the primary provider warning when convenient
```

Custom model:

```text
Setup: Ready
Learning profile: Custom
Core learning quality: Contract valid; quality unbenchmarked
Learning health: Healthy
Value: First value reached
Custom-generated guidance: Shadow evaluation only
Next: review shadow evidence; live delivery remains disabled until a later independently frozen custom-delivery policy exists
```

Paused learning:

```text
Setup: Ready
Learning profile: Evaluated recommended
Core learning quality: Temporarily unavailable
Learning health: Paused
Blocked capability: Distillation
Existing governed guidance: still available under normal gates
Next: repair provider authentication and revalidate
```

### 9.3 `status` and `doctor` responsibilities

`ee status` should show:

- current setup, quality, health, and value summary
- the most important next action
- one capability-specific warning when it changes user action
- no low-level route details by default

`ee doctor <host>` should show:

- distribution/install channel
- host wiring and restart/session requirements
- per-capability validation and benchmark assurance
- per-capability active primary/fallback/none route
- per-capability contract/profile versions
- blocked queue counts by stable failure code and capability
- exact repair action
- verbose evidence and fingerprints only when requested

## 10. Minimal Activation And Value Observability

### 10.1 Derive before persisting

The following should normally be derived from existing records:

| Milestone | Preferred source |
| --- | --- |
| First real task captured | earliest qualifying `task_runs` or input record |
| First node created | earliest `experience_nodes.created_at` |
| First intervention | earliest delivered injection event |
| First attribution | earliest attribution record |
| First helpful intervention | earliest helped attribution tied to delivery |
| First harmful intervention | earliest harmed attribution tied to delivery |

### 10.2 Minimal new persistence candidates

Potential new fields must be justified individually.

#### Initialization time

`initialized_once_at` may be stored in the first complete configuration-generation manifest because current settings do not provide a reliable initialization timestamp.

It is a historical milestone only. Current configuration completeness and validation are live projections.

#### Learning decision time

If current task records cannot distinguish learning decision completion from generic update time, add a bounded field such as:

```text
learning_decided_at
```

to the existing task-run/read model rather than creating a new activation event table.

#### Host readiness

Current readiness should be derived live per host/session.

Do not add one global `host_ready_at`.

If funnel analysis later requires a first-ready timestamp, use a bounded structure:

```text
first_ready_by_host:
  <host_id>:
    first_ready_at
    readiness_contract_version
```

Only add it after Phase 0.5A.0 proves the exact host readiness semantics.

### 10.3 First value and outcome-confirmed value

Preserve existing first-value semantics.

Add a separate metric:

```text
First outcome-confirmed value
```

This is reached when a delivered intervention receives a sufficiently confident helpful outcome under the existing attribution/governance contract.

Freeze the threshold as:

```text
delivered = true
AND (
  source = manual_override AND user_override = helped
  OR attribution_verdict = strong_helped AND confidence in {medium, high}
)
```

`weak_helped`, low-confidence automatic attribution, suppressed delivery, neutral/unknown outcomes, and non-delivered decisions do not reach this milestone.

The milestone is derived from the earliest attribution record satisfying this predicate. Manual helped feedback is accepted because manual feedback is an explicit override path in the current product contract.

### 10.4 No remote telemetry in this phase

This design does not add remote activation telemetry.

Initial product learning should come from:

- local derived status
- user-shared diagnostic manifests
- published-package validation
- benchmark runs
- public issues and external case studies

## 11. Safe Diagnostics And Feedback

### 11.1 Commands

Planned surfaces:

```text
ee diagnose
ee diagnose --prepare-bundle
ee diagnose --archive <review-directory>
```

The two-step bundle flow is preferred:

1. create a review directory and exact `manifest.json`
2. let the user inspect or edit inclusion choices
3. explicitly create a shareable archive

### 11.2 Allowlisted default contents

Default manifest may include:

- ExperienceEngine version
- OS family and architecture
- Node major version
- host family and version when safely available
- installation/distribution channel when known
- setup state
- quality profile
- per-capability validation and benchmark-assurance classification
- learning health
- provider family
- exact model ID only when the user opts in
- endpoint/deployment identity only as a truncated HMAC fingerprint
- current contract/profile versions
- schema version and migration health
- SQLite integrity result
- counts by task, candidate, node, delivery, queue, and attribution state
- time ranges without content
- stable error records
- host wiring checks
- sanitized package-content checks

### 11.3 Default exclusions

The default bundle must not include:

- SQLite database files
- raw task records
- prompts or prompt excerpts
- source code
- repository names
- absolute paths
- tool arguments
- raw tool output
- raw provider responses
- API keys or tokens
- endpoint URLs
- arbitrary free-text error messages
- exact custom deployment names without opt-in

### 11.4 Stable error record

Default error data should use:

```text
error_code
failure_class
failure_scope
component
timestamp
retryable
occurrence_count
capability
route_classification
home_id_prefix
package_generation_id_prefix
configuration_generation_id_prefix
supervisor_lease_epoch
worker_fencing_token
claim_id_prefix
```

Authority and identity fields are included only when relevant to the error and are exposed as bounded identifiers or prefixes. They help distinguish stale-owner, package-generation, configuration, and claim failures without revealing raw paths, process command lines, or secrets.

Raw `error.message` should be excluded unless the user explicitly adds a reviewed sanitized excerpt.

### 11.5 Database diagnostics

Database diagnostics should derive only:

- schema version
- integrity-check result
- migration state
- table/state counts
- oldest/newest timestamps
- blocked/failed/discarded counts by stable category

The database file itself must not be included by default.

### 11.6 Fingerprint privacy

Endpoint, deployment, and model identities may have low entropy. A plain SHA-256 digest is not sufficient as a privacy claim.

Diagnostic fingerprints must use:

```text
HMAC(machine_integrity_key, "diagnostic-identity-v1\0" || normalized_identity)
```

The default manifest should expose only a bounded prefix of that HMAC. The local salt and full identity remain excluded.

### 11.7 Exact manifest review

The generated manifest must show actual values that will be archived.

Example:

```json
{
  "provider_family": "openrouter",
  "capability_assurance": {
    "learning_gate": "recommended",
    "distillation": "supported",
    "embedding": "recommended"
  },
  "model_id": "<excluded by default>",
  "os": "win32-x64",
  "errors": [
    {
      "error_code": "EE_PROVIDER_AUTH_INVALID",
      "failure_class": "system_route",
      "failure_scope": "provider_route",
      "component": "distillation",
      "retryable": false,
      "occurrence_count": 3
    }
  ]
}
```

### 11.8 Public feedback infrastructure

Planned repository additions:

- installation problem issue template
- runtime bug issue template
- harmful intervention issue template
- feature request issue template
- `CONTRIBUTING.md`
- `SECURITY.md`

Issue templates should request the reviewed diagnostic manifest, not raw databases or logs.

## 12. Evidence And Benchmark Protocol

### 12.1 Primary scorecard, not one isolated north-star number

Freeze the statistical units before reusing existing report names.

```text
decision opportunity
  one benchmark task/turn with a fixed scenario label and fixed candidate corpus

intervention event
  one injection event with delivered = true

node delivery
  one node contained inside an intervention event; not the primary intervention denominator

task trial
  one completed execution of one arm in one matched block
```

An intervention event containing multiple nodes counts once in the intervention-rate denominator.

Event outcome aggregation:

- `harmed`
  - a manual harmed override exists, or any delivered node has `weak_harmed`/`strong_harmed` with medium or high confidence
- `helped`
  - no harmed condition exists, and a manual helped override or `strong_helped` with medium or high confidence exists
- `uncertain`
  - every other delivered event, including unresolved, neutral, unknown, low-confidence, and weak-helped-only outcomes

An event must never count as both helped and harmed. Harm takes precedence for safety reporting.

Net Helpful Intervention Rate remains important:

```text
(helped interventions - harmed interventions) / delivered interventions
```

It must always be reported with coverage.

The denominator is delivered intervention events, including those later classified uncertain.

The current `benchmark-summary` implementation uses all decisions as the helpful/harmful/net denominator. That historical behavior must remain explicitly versioned until the benchmark report migrates; it must not be silently presented as the new metric.

Coverage definitions:

```text
delivery_rate = delivered intervention events / all decision opportunities
expected_inject_coverage = delivered events on inject-or-conservative-labeled opportunities / those labeled opportunities
correct_skip_rate = correct skips / skip-labeled opportunities
false_positive_injection_rate = delivered events on skip-labeled opportunities / skip-labeled opportunities
```

Task-success, old-mistake avoidance, latency, cost, and tool-call metrics use the task trial as their unit.

The minimum public scorecard is:

- delivery/coverage rate
- net helpful intervention rate
- helpful rate
- harmful rate
- uncertain rate
- task success delta
- repeated-old-mistake avoidance delta
- correct-skip rate
- false-positive injection rate
- provider cost
- ExperienceEngine token overhead
- wall-clock latency delta
- tool-call delta
- infrastructure failure rate

### 12.2 Ground-truth scenario labels

Each benchmark scenario must be labeled before execution:

```text
expected_action:
- inject
- inject_conservative
- skip
```

Ground truth must include:

- applicable nodes/candidates
- intentionally tempting but non-applicable nodes
- scope validity
- safety constraints
- deterministic task-success checks
- known old-mistake path when relevant

### 12.3 Correct skip definition

A correct skip requires:

1. at least one plausible candidate or distractor exists
2. the scenario is pre-labeled as requiring skip
3. ExperienceEngine rejects delivery for a valid scope, applicability, safety, or evidence reason
4. the final task outcome does not reveal that the skipped experience was required to avoid the known failure

`No candidate retrieved` is not automatically a correct skip; it may be a retrieval miss.

### 12.4 Confusion matrix

Benchmark output should include an intervention confusion matrix:

| Ground truth / Decision | Inject | Conservative | Skip |
| --- | ---: | ---: | ---: |
| Inject expected |  |  |  |
| Conservative expected |  |  |  |
| Skip expected |  |  |  |

This separates:

- retrieval misses
- over-injection
- correct conservative routing
- correct skips

### 12.5 Matched three-arm block design

Each repetition is one matched block/triplet containing three arms.

Every arm in the block must use:

- the same repository snapshot
- an isolated working-directory copy
- the same task input
- the same host model/provider
- the same model parameters where controllable
- the same ExperienceEngine candidate/node corpus
- isolated ExperienceEngine homes
- isolated runtime artifacts
- isolated host sessions/conversations
- controlled or cleared model context/cache where the host permits it
- the same environment-variable contract except arm-specific EE controls
- isolated generated/temp files
- the same network/provider retry policy

Required arms:

#### Treatment

Normal ExperienceEngine delivery.

#### Holdout control

ExperienceEngine retrieval and decision run, but delivery is suppressed.

Benchmark holdout must force:

```text
decision pipeline runs
would-have-delivered result is recorded
delivered = false unconditionally
```

The current probabilistic runtime holdout behavior must not be used as the benchmark arm because it may still deliver depending on the hash bucket and holdout rate.

#### No-EE control

No ExperienceEngine runtime participation.

The benchmark must randomize the three-arm execution order within each block and prevent prior-run state from contaminating later runs.

### 12.6 Immutable matched-block manifest

Every matched block is planned and sealed before the first arm starts.

Minimum immutable block manifest:

```text
benchmark_manifest_schema_version
benchmark_protocol_version
benchmark_campaign_id
benchmark_profile_registry_digest
benchmark_evidence_target_id
scenario_id
scenario_version
scenario_digest
scenario_set_digest
block_id
replacement_for_block_id
replacement_generation
repetition_index
randomization_seed
planned_arm_order
repository_snapshot_digest
task_input_digest
candidate_corpus_digest
host_identity
host_model_provider
host_model_identity_fingerprint
host_model_parameters_digest
environment_contract_digest
network_retry_policy_version
harness_version
transcript_adapter_version
scorer_version
analysis_plan_digest
exclusion_policy_version
replacement_policy_version
created_at
sealed_at
manifest_digest
```

The manifest also declares one arm plan for each required arm:

```text
arm: treatment | forced_holdout | no_ee
planned_ordinal
workspace_isolation_id
ee_home_isolation_id
host_session_isolation_id
arm_control_digest
```

Plan fields are immutable after `sealed_at`.

Execution results are not written back into the sealed plan. Each `(block_id, arm)` has one formal attempt authority row with monotonic CAS state. Transcripts, metrics, checks, and scoring evidence are immutable append-only artifacts referenced by digest.

Setup activity before a formal arm starts is recorded separately as block/arm preflight evidence:

```text
preflight_record_schema_version
benchmark_campaign_id
block_id
arm
preflight_attempt_id
preflight_attempt_number
preflight_stage
status: passed | failed | retried | cancelled
failure_code
started_at
finished_at
evidence_digest
```

Preflight retries may occur only before the formal arm start boundary. They do not execute the benchmark task, do not receive an efficacy outcome, and cannot become a second formal arm attempt.

The formal arm start boundary is the atomic insertion of the unique `(block_id, arm)` arm-attempt record with `attempt_number = 1`, `attempt_state_revision = 1`, `execution_status = running`, and `started_at`, immediately before the harness releases the benchmark task input to the host session. After this row exists, setup retries are no longer preflight and no second formal attempt may be created in that block.

Minimum arm-attempt record:

```text
attempt_record_schema_version
benchmark_campaign_id
block_id
arm
attempt_id
attempt_number
attempt_state_revision
planned_ordinal
execution_status: running | completed | infrastructure_failed | harness_timed_out | cancelled | invalid
task_outcome: success | failure | partial | unavailable
task_timeout
infrastructure_failure_code
product_runtime_failure_codes
started_at
finished_at
workspace_artifact_digest
host_transcript_digest
arm_neutral_metrics_digest
deterministic_check_digest
scoring_record_digest
```

Uniqueness rules:

- one sealed plan exists per `block_id`;
- `(block_id, arm)` is unique for formal arm-attempt records;
- `attempt_number` is fixed to `1` in the initial benchmark protocol;
- exactly zero or one formal attempt may exist per arm in one block;
- a formal attempt may transition exactly once from `running` to one terminal execution status using expected `attempt_state_revision` and expected prior status CAS;
- terminal attempt authority rows are immutable; terminal evidence is attached only through immutable digest references written in the terminal transition;
- a zero-row terminal update is a lost CAS and cannot create or select another attempt;
- replacement blocks receive a new `block_id` and link to the invalid/aborted block through `replacement_for_block_id`;
- a replacement never overwrites the original plan or attempts.

The manifest digest must be included in every arm attempt and scoring record so a result cannot be attached to a different plan.

### 12.7 Failure, exclusion, abort, and rerun protocol

Task failure is normally a benchmark outcome, not infrastructure failure.

An arm with a completed harness run and valid task checks remains efficacy-eligible even when the task fails, reaches the predeclared task timeout, repeats the old mistake, or receives harmful guidance. A task timeout is represented as `execution_status = completed`, `task_timeout = true`, and the appropriate task outcome.

An ExperienceEngine provider, route, queue, activation, retrieval, or delivery failure that occurs after a valid arm start is normally a product-runtime outcome, not benchmark infrastructure failure. It remains in the matched efficacy block and is reported through `product_runtime_failure_codes`, task outcome, latency, coverage, and product-runtime reliability metrics.

`BENCH_PROVIDER_UNAVAILABLE` is reserved for a host/common provider dependency required to execute or measure the benchmark arm itself, not for an EE capability route whose availability is part of the product under test.

Stable infrastructure failure codes must distinguish at least:

```text
BENCH_HOST_START_FAILED
BENCH_PROVIDER_UNAVAILABLE
BENCH_HARNESS_TIMEOUT
BENCH_WORKSPACE_SETUP_FAILED
BENCH_TRANSCRIPT_MISSING
BENCH_SCORER_FAILED
BENCH_INSTRUMENTATION_INCOMPARABLE
BENCH_ARM_CONTAMINATION_DETECTED
BENCH_OPERATOR_CANCELLED
BENCH_HARNESS_DEFECT
```

Block eligibility rules:

- efficacy deltas require all three arms in the same block to have one valid `completed` attempt;
- if any arm is infrastructure-failed, harness-timed-out, cancelled, invalid, contaminated, or lacks comparable required instrumentation, the entire block is excluded from efficacy deltas;
- an arm with product-runtime failures remains `completed` when the harness, host task, transcript, and scorer completed validly;
- the failed or partial block remains included in infrastructure-failure reporting;
- completed arms from an invalid block are not paired with arms from another block;
- no individual arm may be selectively rerun inside the same block for any reason;
- once a formal arm-attempt record is inserted or the arm start boundary is crossed, any retry requires closing the entire block and creating a replacement block;
- workspace creation, host startup, provider availability, and instrumentation retries that occur before formal arm start remain preflight records and cannot be promoted to formal attempts.

Rerun protocol:

1. close the original block with a stable block disposition;
2. preserve all original arm attempts;
3. create a new sealed replacement block with a new `block_id`;
4. keep the same scenario version, repository snapshot, task input, candidate corpus, host/model contract, and benchmark protocol unless the stated failure requires a version change;
5. use a new randomization seed and rerun all three arms;
6. link the new block to the old block through `replacement_for_block_id` and increment `replacement_generation`;
7. never rerun solely because the outcome is unfavorable or noisy.

If a harness, scenario, scorer, or instrumentation defect requires a version change, the replacement is part of a new protocol stratum. It must not be pooled silently with the old version.

Stable block dispositions:

```text
complete
incomplete_infrastructure
invalid_contamination
invalid_protocol_defect
aborted_operator
superseded_by_replacement
```

Exclusion records require:

```text
block_id
disposition
reason_code
affected_arms
detected_at
detected_by
evidence_digest
replacement_block_id
```

Publication must report:

- planned blocks;
- completed efficacy-eligible blocks;
- invalid/incomplete/aborted blocks by reason;
- attempted arms and infrastructure-failure rate;
- replacement chains and maximum replacement generation;
- results with and without any predeclared sensitivity exclusions;
- every protocol/harness/scorer version represented in the report.

Outliers, long runtimes, high costs, task failures, harmful interventions, and repeated-old-mistake outcomes are not exclusion reasons unless a predeclared deterministic infrastructure rule applies.

### 12.8 Arm-neutral instrumentation

The no-EE arm has no EE database or attribution runtime. Therefore cross-arm metrics must be collected by an external arm-neutral harness.

The harness must collect consistently for all arms:

- task outcome and deterministic checks
- command/process duration
- infrastructure failure
- tool-call count from a common transcript/event adapter
- token usage and provider cost when the host/provider exposes comparable metadata
- retry counts and timeout classification
- execution order and block identity

When a host does not expose comparable token/cost data, the report must mark the field unavailable rather than estimating one arm differently.

### 12.9 Scoring

Prefer:

- deterministic tests/build/typecheck checks
- task-specific assertions
- blinded outcome scoring when deterministic checks are insufficient
- within-block arm deltas rather than unrelated aggregate averages
- confidence intervals that account for repeated blocks within the same scenario
- scenario-level or block-level clustering rather than treating every repeated run as fully independent
- efficacy analysis over complete matched blocks only
- infrastructure reliability analysis over every attempted arm, including attempts in invalid or replacement blocks
- replacement blocks treated as new blocks with replacement-chain sensitivity reporting

### 12.10 Repetition and publication thresholds

Do not encode one universal sample size into the product contract.

Recommended levels:

- infrastructure pilot
  - approximately 5 matched three-arm blocks per scenario
  - used only to detect harness failures and directional signals
- publishable benchmark baseline
  - begin around 20 matched blocks for materially stochastic scenarios
  - report confidence intervals
- stronger claims
  - use pilot variance and power analysis to choose sample size

Publication thresholds count efficacy-eligible complete blocks, not merely planned blocks or arm attempts.

Replacement blocks do not erase infrastructure failures from the pilot or publication report.

### 12.11 Existing evaluation reuse

Extend the current evaluation architecture to support:

- matched-block manifests
- immutable sealed plan manifests, separate append-only preflight evidence, one CAS-governed formal attempt authority row per block/arm, and immutable terminal evidence digests
- arm isolation
- forced holdout suppression
- would-have-delivered capture
- arm-neutral instrumentation
- ground-truth labels
- confusion matrices
- cost/latency/tool-call accounting
- within-block deltas and publishable confidence reporting
- block dispositions, exclusion records, replacement chains, and protocol-version strata

Historical evaluation documents must be audited before being cited as current supported CLI behavior.

## 13. ClawHub Product Presentation

### 13.1 Positioning

Lead with the user problem:

```text
Stop your coding agent from repeating debugging paths that already failed.
```

Then explain the governed loop:

```text
ExperienceEngine learns from real task outcomes, injects compact guidance when prior execution experience is relevant, and removes guidance that becomes harmful.
```

### 13.2 Current-capability honesty

Until the selected OpenClaw architecture is implemented and published:

- do not claim ClawHub-only installation provides full background learning
- state any separate runtime/CLI requirement explicitly
- distinguish plugin interaction capability from full learning capability
- distinguish source validation from published ClawHub validation

### 13.3 Configuration surface

Default user-visible configuration should focus on:

- quality profile
- provider family and model route
- embedding route
- intervention level
- maximum hints
- privacy/diagnostic behavior
- data location
- log level

Internal profile-version and hybrid implementation fields should remain advanced unless they change an ordinary user's action.

## 14. Distribution And Release Reliability

### 14.1 Independent channels

Validate separately:

- source repository
- packed npm artifact
- published npm package
- ClawHub/OpenClaw package
- Claude marketplace/plugin bundle
- Codex managed wiring
- Antigravity managed wiring

### 14.2 Source validation is not published validation

Every claim must identify its tier:

```text
source validated
packed artifact validated
published npm validated
published ClawHub validated
host-native runtime validated
```

### 14.3 Required package checks

- package version consistency
- entrypoint presence
- SQLite schema presence
- OpenClaw plugin entrypoint
- companion worker entrypoint if selected
- Claude plugin assets
- MCP entrypoints
- CLI binary
- package-local path resolution
- no source-repo-only assumptions

### 14.4 Required release-candidate checks

- clean-home initialization
- candidate provider validation
- failed validation rollback
- previous-version upgrade
- shared-home preservation
- gateway restart/session pickup
- worker restart/recovery if selected
- blocked queue recovery
- package repair and doctor behavior

### 14.5 Published artifact checks

- install actual published version
- verify actual executable/host entrypoints
- verify exact packaged runtime closure
- verify current compatibility metadata
- run a bounded host smoke
- document anything not verified

## 15. Revised Delivery Plan

### Phase 0.5A.0 — Distribution And Runtime Reality Baseline

#### Goal

Freeze current facts before changing product semantics.

#### Deliverables

- source, packed npm, published npm, and published ClawHub package-content report
- fresh OpenClaw install report
- actual `ee` PATH availability result
- gateway plugin loading result
- current packaged learning capability matrix
- current shared-home behavior report
- current upgrade/repair result
- OpenClaw execution-placement decision record
- OpenClaw lifecycle-ownership decision record
- OpenClaw control-surface decision record
- single-worker ownership and stale-lease validation report
- shared SQLite concurrency and writer-contention report
- schema bootstrap and migration-ownership report
- gateway/worker crash and restart recovery report
- package-upgrade old/new worker compatibility report

#### Required questions

- Does ClawHub install the full npm package or a reduced runtime closure?
- Is `ee` executable without a separate global install?
- Can a package-local worker be launched safely?
- Do plugin and CLI/worker use the same home?
- What survives gateway restart?
- What is currently interaction-only?
- Who prevents duplicate workers?
- Who owns schema bootstrap and migrations?
- Does the selected process model require WAL or another SQLite concurrency change?
- Can an old worker remain alive after package upgrade?
- Can gateway and worker startup race against the same database?
- How are orphan workers detected and terminated?

#### Exit criteria

- all claims are based on actual artifacts, not source assumptions
- one explicit combination of execution placement, lifecycle ownership, and control surface is selected
- shared-database concurrency and migration ownership are proven feasible or the architecture is rejected
- canonical activation is still not published until later implementation succeeds

### Phase 0.5A.1 — Production Quality Contract And Schema

#### Goal

Freeze product semantics before runtime work.

#### Deliverables

- accepted A0 topology reference and component write-ownership matrix
- package activation and supervisor launch-authorization state machine for initial, active, pending, rollback, and stale-owner recovery paths, including authorization issuance, atomic consumption, one-attempt binding, explicit attempt terminal states, expiry, cancellation, and retry issuance when a lease was never acquired
- separate immutable authorization issuance revision and mutable authorization-row state revision, projected and bound explicitly by attempts, supervisor leases, and activation handshakes
- revisioned child-process binding CAS before supervisor lease acquisition
- package-local supervisor lease, heartbeat, restart-budget, drain, and blocked-state schema
- one canonical `fresh_supervisor_authority` predicate used by every supervisor/gateway writer branch
- atomic supervisor lease renewal/release/revocation/expiry and matching launch-attempt terminalization protocol
- singleton worker lease, stale-takeover, and monotonic fencing protocol
- one canonical production-activation/write-authority predicate binding package state, current complete production handshake, supervisor epoch, worker fence, configuration generation, effective route set, and schema
- atomic queue claim, renewal, completion, and interruption-recovery CAS protocol
- independent system-attempt, interruption, and candidate-content retry counters
- WAL, synchronous mode, transaction-boundary, busy handling, and lock-failure contract
- schema-version, migration-lease, package compatibility, and plugin warming/read-only contract
- canonical shared-home resolution, stable home identity, and mismatch failure contract
- package generation, artifact integrity, protocol compatibility, schema range, upgrade, and rollback schema
- gateway stop, parent-death, worker crash, orphan self-termination, and safe process-termination contract
- OpenClaw-native control request and deterministic status projection schema
- crash-safe control-request idempotency record and same-transaction mutation/result protocol
- published npm/ClawHub distribution-manifest and runtime-closure validation contract
- Windows OpenClaw executable resolution and bounded version-probe contract
- interaction-active, learning-runtime-active, and production-learning-ready predicates
- distinct preactivation-verification and post-CAS production-activation handshakes with revisioned writer/CAS state, stale-fence rejection, and replay rejection
- production-handshake binding to the immutable authorization/attempt that actually granted the current supervisor lease, with transition-role carry-forward for a continuing supervisor and `active` authorization only for a replacement supervisor
- exhaustive package-activation transition table with no undefined `stable` or `rollback_preparing` states
- revision-checked `initialize_package_activation` from any valid `uninitialized` revision, with new deadline, authorization, and launch-budget window while retaining history
- one exhaustive gateway package-authority mutation whitelist referenced by all package lifecycle and control sections
- boundary-specific blocked retry, cancellation, and rollback controls with package identity, authorization, deadline, handshake, and lease/fence outcomes
- explicit separation of current package activation revision from immutable launch activation revision across authorization, attempt, supervisor lease, and handshake evidence
- quality profile schema
- complete packaged profile-registry entry, compatibility, integrity, supersession, deprecation, and revocation schema
- per-capability validation, benchmark-assurance, runtime-health, active-route, effective-route-set, and projection-revision schema
- global learning-health projection rules
- custom-generated candidate/node semantic-origin provenance and bounded aggregation schema
- initial `custom-shadow-only-v1` hard delivery cap and explicit deferral of every custom conservative/live-delivery transition
- provider validation record schema bound to home, package, configuration generation, route set, adapter, schemas, secret refs, and registry evidence
- immutable configuration-generation manifest and secrets-integrity schema
- create-once machine-integrity-key bootstrap order, key-id binding, path-normalization version, and no-rotation v1 rule
- crash-atomic current-generation authority-row and pointer-CAS protocol
- effective-route fingerprint and environment-override invalidation rules
- validation invalidation rules
- capability-specific route and fallback matrix
- failure taxonomy
- entity-specific job/candidate states
- mechanical queue transition table, protected-write transaction set, and complete execution metadata
- `route-escalation-disabled-v1` retry policy preventing automatic candidate-to-route failure escalation
- setup/quality/value projection table
- outcome-confirmed value predicate
- benchmark statistical units, sealed block manifest, preflight evidence, exactly one formal arm attempt per block/arm, forced holdout, arm-neutral instrumentation, block disposition, exclusion, replacement, rerun, and publication contract
- old-spec supersession map
- post-freeze implementation dependency order without creating OpenSpec artifacts

#### Exit criteria

- no unresolved conflict between custom use and production labeling
- custom model self-claims cannot obtain canary delivery eligibility
- custom-origin semantic content remains shadow-only for the full lifetime of v1; outcome evidence, governance maturity, manual promotion, and deterministic routing cannot override the cap
- changing current provider configuration cannot relabel, collapse, or raise existing node provenance
- mixed-origin nodes preserve exact or conservatively compacted origin assurance and contract facts
- recommended profile identity is versioned, package-bound, integrity-checked, compatibility-filtered, and evidence-backed
- rule-generated semantic fallback is separated from deterministic safety rules
- queue provider/system blocking and worker interruption are separated from candidate content failure in fields, counters, transitions, and discard rules
- only one current supervisor and worker authority can exist per home under atomic lease/CAS predicates
- every supervisor/gateway writer decision uses the same `fresh_supervisor_authority` predicate; gateway heartbeat cannot create concurrent package authority while a fresh supervisor lease remains
- initial, active, pending, and rollback launch paths cannot spawn without a matching authorization atomically consumed by exactly one launch attempt; every attempt has revisioned terminal mechanics, any retry requires a new authorization id/revision, no-lease initial failure has an explicit gateway writer, and stale-owner recovery can only reissue the deterministic role implied by unchanged activation state
- immutable authorization issuance revision and mutable authorization-state revision cannot be conflated; every attempt, supervisor lease, and handshake binds the exact values produced by the consumed authority row
- a spawned child cannot acquire a supervisor lease until exact PID/start identity is committed by the revisioned child-binding CAS; replay or conflicting identity writes are rejected
- lease renewal, graceful release, verified process-exit revocation, and natural expiry compete on one lease-state revision; lease terminal state and launch-attempt terminal state commit atomically
- stale supervisors and workers cannot commit protected writes after epoch/fencing loss
- a production worker lease acquired for handshake cannot claim, renew, or semantically complete learning work until the current production handshake is authoritative; every worker-originated protected write revalidates the same activation/handshake/configuration/route/schema predicate
- leaving package state `active`, entering `blocked`/`production_activating`, or invalidating the current handshake binding stops new protected writes and converts unfinished old claims to interruption recovery rather than content failure
- queue claims and result commits cannot duplicate work or partially update job/candidate/node state
- WAL and bounded busy handling are specified without treating them as ownership safety
- one migration owner is defined; plugin opportunistic migration is prohibited
- plugin behavior is mechanically defined for ready, read-only, warming, and incompatible schema states
- shared-home resolution cannot diverge between plugin, supervisor, worker, configuration generation, and activation handshake
- package upgrade and rollback cannot allow old generations or schema-incompatible generations to write
- OpenClaw-native controls use idempotency and expected revision/epoch checks
- control mutation and its completed/rejected idempotency result commit in one transaction; request-id digest conflicts are stable failures
- published ClawHub closure requires actual downloaded-artifact entrypoint, dependency, supervisor, worker, and live-host verification
- Windows repair/doctor execution does not depend on extensionless `openclaw` resolution
- CLI `loaded`, file existence, PID presence, or database creation cannot independently satisfy live activation
- activation handshake transitions have one persistent writer, expected prior state/revision, current supervisor epoch, current worker mode/fence, activation revision, launch-authorization binding, expiry, and replay rejection
- preactivation completion cannot satisfy live activation; package identity CAS must be followed by a fresh production lease/fence and production handshake before `learning_runtime_active`
- `learning_runtime_active` requires package activation state `active`, the current active generation, `worker_mode = production`, and a completed post-CAS production handshake bound to the current activation revision and production fence
- production activation binds the actual launch authorization/attempt of the current supervisor lease; a continuing transition supervisor retains transition-role history, while a replacement post-CAS supervisor requires a new `active` authorization
- every package activation state has one defined identity shape, writer, entry edge, exit edge, and deadline rule; ordinary runtime downtime leaves package state `active`
- `uninitialized` may re-enter `preparing` from any expected nonnegative activation revision through the single gateway initialization operation; revision zero is reserved only for empty-home authority bootstrap
- gateway package-authority changes are legal only when listed in the exhaustive whitelist; no other section may create implicit gateway writer authority
- every `blocked` boundary has one legal set of idempotent retry/cancel/rollback operations; post-identity retry cannot change package identity or reuse a worker fence/handshake
- current package activation revision is compared only with current package authority, while historical launch activation revision is compared only with immutable authorization/attempt/lease evidence; continuing-supervisor transitions may validly carry different values
- initialization commit is crash-atomic through one SQLite authority-pointer CAS against the retained base revision/generation
- manifests verify settings/validation/internal references and HMAC-bind secrets without exposing secret values
- machine integrity key creation precedes control-plane bootstrap, binds home identity, and cannot rotate in the initial protocol
- runtime-route state has one writer, monotonic revision, authority binding, atomic replacement, and fail-closed recovery
- candidate-specific failures cannot automatically become route failures in v1, so retry consumption cannot change through an unspecified threshold
- benchmark efficacy uses complete matched blocks only; infrastructure failures remain reported; reruns replace entire blocks without erasing original attempts
- `(block_id, arm)` permits at most one formal attempt; preflight retries cannot become efficacy attempts
- OpenSpec implementation slices can be created independently

#### Required post-freeze implementation dependency order

This is a dependency map, not an OpenSpec:

```text
1. package closure + package identity + shared-home identity
2. SQLite WAL + schema metadata + migration ownership
3. supervisor lease + worker lease + fencing + lifecycle controls
4. immutable configuration generation + validation + runtime-route projection
5. atomic queue claim + retry/failure semantics + provenance
6. OpenClaw-native status/control + preactivation verification + post-CAS production activation handshake
7. published artifact activation + docs correction
8. benchmark harness manifest/failure/rerun implementation
```

Later implementation slices must preserve this dependency order or prove an equivalent safe ordering.

### Phase 0.5A.2 — Atomic Provider And Embedding Validation

#### Goal

Make initialization prove a real usable contract before committing configuration.

#### Scope

- candidate settings/secrets in memory
- provider adapter smoke
- learning-gate contract smoke
- distillation contract smoke
- optional hybrid contract smoke
- embedding smoke
- HMAC validation fingerprints
- immutable configuration generation
- generation manifest and secret-reference integrity
- control-plane authority row and base-pointer CAS
- atomic authoritative configuration-pointer commit
- previous-generation recovery
- effective environment/runtime override validation
- stale-record invalidation

#### Exit criteria

- failed validation leaves prior valid configuration intact
- a process crash during commit cannot expose a partial generation
- `Initialized` resolves from one complete generation rather than unrelated files
- doctor can explain exact validation failure without leaking secrets

### Phase 0.5A.3 — Production Learning Failure Semantics

#### Goal

Prevent low-quality semantic fallback while preserving safe deterministic behavior and blocked work.

#### Scope

- remove production rule-generated candidate fallback after provider failure
- remove production passthrough semantic distillation after provider failure
- preserve explicit legacy rule mode
- preserve deterministic eligibility, merge safety, skip, attribution, and governance for evaluated-origin content
- implement validated fallback routing per capability
- add blocked queue semantics
- add atomic queue claim, renewal, completion, and interruption recovery
- add worker-lease/fencing guards to every protected queue/node write
- add failure taxonomy and stable error codes
- add separate system-attempt, interruption, and content-retry counters
- add pause/resume behavior
- persist actual active capability route metadata
- persist candidate/node generation provenance
- enforce `custom-shadow-only-v1` as a hard delivery-state cap while collecting custom-origin outcome/governance evidence for future policy design only

#### Exit criteria

- provider outages do not discard valid candidates through content retry exhaustion
- existing governed guidance can continue under normal gates
- no production semantic node is created from an unapproved rule fallback
- custom-origin nodes cannot leave `shadow_only` for any reason in v1, including model fields, outcome evidence, governance maturity, manual promotion, or deterministic conservative routing

### Phase 0.5A.4 — Status And Doctor Projection

#### Goal

Expose product state without conflating setup, assurance, runtime health, and value.

#### Scope

- setup state
- quality profile
- core quality projection
- learning health
- per-capability validation and benchmark assurance
- per-capability active route and runtime health
- value state
- outcome-confirmed value
- blocked queue summary
- exact next action

#### Exit criteria

- ordinary output remains concise
- verbose output provides fingerprints and route details
- `Ready` does not imply learning health is currently healthy

### Phase 0.5A.5 — Minimal Activation Observability And Final Fresh Install

#### Goal

Measure activation with existing state and prove the final published path.

#### Scope

- derive milestones from existing tables
- add only approved non-derivable fields
- validate selected OpenClaw architecture
- test actual published artifact
- verify provider validation, worker lifecycle, gateway pickup, and shared home
- update README and user guide to match reality

#### Exit criteria

- no second activation ledger
- no global `host_ready_at`
- first value retains existing semantics
- canonical path is backed by published-artifact evidence

### Phase 0.5B — Diagnostics And Public Feedback

#### Goal

Make failed activation and harmful behavior safely reportable.

#### Scope

- review-directory diagnostic generation
- exact manifest
- explicit archive step
- stable error codes
- database-derived counts only
- issue templates
- `CONTRIBUTING.md`
- `SECURITY.md`

### Phase 0.5C — Evidence Harness And Product Presentation

#### Goal

Turn current evaluation assets into credible matched multi-arm product evidence.

#### Sequence

1. extend the current harness with matched three-arm block isolation
2. add forced holdout suppression and would-have-delivered capture
3. add arm-neutral outcome, latency, tool-call, token/cost, and infrastructure instrumentation
4. add ground-truth inject/conservative/skip labels
5. add correct-skip and harm-recovery scenarios
6. run infrastructure pilots
7. publish limitations and directional results
8. expand to multi-repository evaluation only after harness stability

### Phase 0.5D — Distribution Release Gates

#### Goal

Make every supported distribution statement independently reproducible.

#### Scope

- package-content validation
- clean-home install
- upgrade and repair
- published npm smoke
- published ClawHub smoke
- host compatibility matrix
- release checklist and evidence tier labels

### Phase 0.6 — Evidence-Driven Core Quality Optimization

Core optimization may begin only when evidence identifies a reproducible bottleneck.

Candidate areas:

- learning eligibility precision
- distillation quality
- retrieval ranking
- applicability detection
- automatic attribution coverage
- provider fallback reliability
- cold-start learning throughput
- cross-repo portability
- quarantine and retirement thresholds

Entry evidence should include at least one of:

- reproducible activation failure cluster
- reproducible provider/queue failure cluster
- matched-block benchmark quality gap
- repeated external user evidence

## 16. Implementation Gate

Phase 0.5A.0 investigation and architecture selection are complete.

The ninth closed-scope protocol review rejected Phase 0.5A.1 freeze and identified three final blockers. The revised protocol closed those blockers, and the final three-blocker closure confirmation passed on `2026-07-11`.

The passing confirmation checked only the three corrected contradictions and regression of the already accepted invariants:

| Final confirmation area | Required frozen invariant | Canonical sections |
| --- | --- | --- |
| Queue cross-contract closure | Section 8 metadata and every worker-originated `processing` transition require the same activation revision, production handshake, supervisor epoch, and canonical production-write predicate as Sections 4.9–4.10; lost authority permits only interruption recovery without semantic writes or content-retry consumption | 4.9–4.10, 8.4–8.5 |
| Re-initialization contradiction closure | Initial authorization is created through `initialize_package_activation` at exact `uninitialized` revision `N >= 0`; revision zero applies only to absent-row empty-home bootstrap | 4.8, 4.15, 4.17 |
| Objective supervisor freshness | `fresh_supervisor_authority` is derived only from authoritative lease/attempt/process/evidence rows; caller expected owner/epoch/revision values are outer CAS inputs and cannot make an objectively fresh supervisor appear absent | 4.8, 4.15, 4.17 |
| Regression confirmation | The already accepted gateway whitelist, current/historical activation-revision separation, custom-shadow-only, retry separation, benchmark single-formal-attempt, migration ownership, home identity, and lease/fencing invariants remain unchanged | 4–12, 15 / Phase 0.5A.1 |

The confirmation found no remaining contradiction or accepted-invariant regression affecting:

```text
writer ownership
split-brain or fencing safety
retry-counter consumption
activation truth
production protected-write eligibility
benchmark statistical eligibility
```

Field naming preferences, SQL index selection, module boundaries, helper APIs, query shape, logging layout, and other implementation choices do not reopen the frozen protocol unless implementation review proves they violate one of those six invariants. Those details belong in OpenSpec and implementation review.

The implementation delta is now divided into eight independently reviewable OpenSpec changes in the frozen dependency order:

```text
establish-runtime-package-home-identity
-> add-runtime-schema-migration-authority
-> add-runtime-process-authority
-> add-runtime-configuration-route-authority
-> add-fenced-learning-queue-semantics
-> add-openclaw-production-activation
-> validate-published-runtime-closure
-> add-matched-block-benchmark-evidence
```

The coordination plan is recorded in `docs/phase-0.5a.1-openspec-slicing-plan-2026-07-11.md`, and the independent review is recorded in `docs/phase-0.5a.1-openspec-slicing-review-2026-07-11.md`. Review approval permits S1 implementation to begin, but it does not make any runtime capability implemented, validated, available, or supported.

## 17. Required Documentation Reconciliation

The following documentation conflicts are known and must be reconciled only after contract freeze and corresponding runtime/published-artifact validation:

- user guide claims that OpenClaw uses the shared background learning loop by default
- README ordering and whether global npm CLI installation is required for the OpenClaw path
- explicit-provider design that defines `auto -> rule`
- historical Claude A/B evaluation commands that may not exist in the current CLI
- any public support matrix that implies unpublished or source-only capability

The reconciliation rule is:

```text
current code and actual published artifact define reality
the revised product contract defines the intended next behavior
OpenSpec defines the implementation delta
public docs change only after validation proves the new behavior
```

Current documentation must not be edited to describe the target architecture as active merely because this protocol is frozen.

## 18. Risks And Mitigations

### Risk: OpenClaw target architecture becomes a large new subsystem

Mitigation:

- retain the A0-selected component boundaries
- prefer existing runtime services and repositories
- implement only the versioned service-controller/supervisor/worker contracts defined here rather than a generic daemon framework
- keep a separately installed runtime as a non-canonical recovery/development fallback, not an undocumented product dependency

### Risk: stronger provider validation creates more visible setup failures

Mitigation:

- detect existing credentials
- validate before commit
- keep previous valid configuration
- provide stable error codes and exact repair guidance
- support validated fallback routes

### Risk: quality dimensions increase terminology density

Mitigation:

- persist orthogonal facts
- derive one plain-language summary
- keep route fingerprints and raw states verbose-only

### Risk: blocked queue work accumulates indefinitely

Mitigation:

- expose blocked counts and age
- provide operator cancel/discard controls
- add bounded retention policy only after product semantics are clear
- never convert system outage into silent content discard

### Risk: diagnostic bundles leak private data

Mitigation:

- allowlist only
- no SQLite files
- no arbitrary errors
- review directory before archive
- opt-in exact identifiers
- dedicated privacy fixtures and tests

### Risk: benchmark results reward silence

Mitigation:

- always report coverage with net helpful rate
- include inject/skip ground truth and confusion matrix
- report task success and old-mistake avoidance deltas

### Risk: activation metrics pressure the product to create weak nodes

Mitigation:

- preserve first-value semantics
- separate outcome-confirmed value
- do not optimize node count directly
- keep learning and delivery gates authoritative

## 19. Final Decision

The product direction is approved.

The target OpenClaw architecture is approved as a design decision but remains unimplemented and unsupported.

The ninth-review protocol shape was not approved. The final revised protocol closed its three remaining queue cross-contract, revision-zero re-initialization, and caller-dependent supervisor-freshness contradictions without changing the A0 architecture, and Phase 0.5A.1 protocol freeze was subsequently approved.

ExperienceEngine should pursue:

```text
provider-backed production learning
validated configuration
explicit learning health
blocked-work recovery
honest OpenClaw distribution boundaries
minimal derived activation observability
allowlisted diagnostics
matched multi-arm product evidence
independent release validation
```

The immediate next task is:

```text
S1 — establish-runtime-package-home-identity implementation
```

S1 implementation is limited to package closure, canonical home resolution, create-once integrity key, physically complete fixed empty-home control-plane bootstrap schema, stable home identity, and their inspection/validation foundations.

Until S1 passes its implementation gate:

- do not begin S2 migration authority, S3 process authority, S4 configuration/route authority, S5 queue semantics, S6 activation controls, S7 published closure, or S8 benchmark implementation;
- do not claim ClawHub or OpenClaw full background learning support;
- do not publish the canonical activation path.

Runtime support is declared only after the complete dependency chain, clean-home validation, actual published npm and ClawHub artifact validation, and live host activation all pass.
