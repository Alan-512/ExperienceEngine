## ADDED Requirements

### Requirement: Imported process-authority tables are exhaustive

ExperienceEngine SHALL implement the complete gateway heartbeat, launch-state, authorization, attempt, supervisor lease, worker lease, lifecycle, timing-policy, and writer/CAS contracts imported from Sections 4.8–4.9 and 4.16.

#### Scenario: Imported state, role, transition, writer, field, or policy value is omitted

- **WHEN** a runtime schema, repository, lifecycle service, or contract fixture omits an imported process-authority member
- **THEN** the slice SHALL fail exhaustive schema/transition tests
- **AND** the missing member SHALL NOT be treated as an implementation preference

### Requirement: S3 cannot issue package authority independently

ExperienceEngine SHALL keep launch-authorization insertion behind an S6 package-authority mutation decision and its exact activation-state CAS.

#### Scenario: S3 is implemented before S6

- **WHEN** process repositories and lifecycle primitives exist but the S6 package-authority operation is unavailable
- **THEN** runtime authorization issuance SHALL remain unavailable
- **AND** tests MAY use direct isolated fixtures only without exposing a production issuer

#### Scenario: Caller requests arbitrary generation or role

- **WHEN** a caller cannot present either a named S6 gateway-whitelist operation or an exact S6 supervisor-owned activation/control transition, plus package identities, role, activation revision, current authorization revisions, deadline, and writer authority
- **THEN** authorization insertion SHALL be rejected

### Requirement: Launch authorization is explicit and single-use

ExperienceEngine SHALL require one current launch authorization before a package-local supervisor process can reserve a launch attempt.

#### Scenario: Authorization is consumed

- **WHEN** the exact current issued authorization, package/home bindings, role, generation, immutable issuance revision, and mutable authorization-state revision match
- **THEN** one transaction SHALL mark the authorization consumed and create exactly one current launch attempt
- **AND** no later attempt SHALL consume the same authorization

#### Scenario: Authorization row changes after issuance

- **WHEN** an authorization is consumed, expired, or cancelled
- **THEN** its mutable authorization-state revision SHALL advance
- **AND** its immutable authorization issuance revision SHALL remain unchanged

### Requirement: Launch attempt binds exact child identity before lease acquisition

ExperienceEngine SHALL keep a newly reserved launch attempt unbound until the spawned child commits exact process identity through a revisioned CAS.

#### Scenario: Child identity is bound

- **WHEN** the attempt is the exact current `reserved_unbound` attempt and its expected revision and package/home bindings match
- **THEN** one CAS MAY bind the supported PID/start identity and advance the attempt to `reserved_bound`

#### Scenario: Conflicting or replayed binding occurs

- **WHEN** another process identity, stale attempt revision, stale authorization binding, or replayed child tries to bind
- **THEN** the binding SHALL be rejected
- **AND** the child SHALL NOT acquire supervisor authority

### Requirement: Supervisor freshness is objective database authority

ExperienceEngine SHALL compute `fresh_supervisor_authority` only from authoritative current lease, launch attempt, process identity, package/home binding, terminal evidence, lease state, and transaction-time expiry evidence.

#### Scenario: Caller expectations match

- **WHEN** objective freshness is true and the caller's expected owner, epoch, and lease-state revision match the current row
- **THEN** a supervisor-owned mutation MAY continue to its operation-specific predicates

#### Scenario: Caller expectations are stale

- **WHEN** objective freshness is true but caller expected values differ
- **THEN** the caller SHALL be rejected as stale
- **AND** objective freshness SHALL remain true

#### Scenario: Gateway requires no fresh supervisor

- **WHEN** a gateway-owned recovery requires `fresh_supervisor_authority = false`
- **THEN** the transaction SHALL prove no authoritative current lease satisfies the objective predicate
- **AND** caller-supplied expected values SHALL NOT make a fresh supervisor appear absent

#### Scenario: Gateway heartbeat expires while supervisor lease remains fresh

- **WHEN** the gateway heartbeat is missing or expired but the authoritative supervisor lease/attempt/process predicate remains fresh
- **THEN** `fresh_supervisor_authority` SHALL remain true
- **AND** no gateway writer SHALL gain concurrent package authority

### Requirement: Supervisor lease lifecycle is revisioned and atomic

ExperienceEngine SHALL make lease renewal, graceful release, verified process-exit revocation, and natural expiry compete on one supervisor lease-state revision.

#### Scenario: Supervisor renews

- **WHEN** the exact fresh owner, epoch, lease-state revision, attempt binding, package generation, and home identity match before expiry
- **THEN** renewal MAY advance the lease-state revision and expiry

#### Scenario: Lease becomes terminal

- **WHEN** graceful release, verified process-exit revocation, or natural expiry wins the revision CAS
- **THEN** the lease SHALL become terminal
- **AND** the matching launch attempt SHALL become terminal in the same transaction

#### Scenario: Late heartbeat loses the race

- **WHEN** another terminal transition has already advanced the lease-state revision
- **THEN** the late heartbeat or renewal SHALL be rejected

### Requirement: Worker authority is singleton and fenced

ExperienceEngine SHALL maintain at most one current worker authority per canonical home and SHALL use a monotonic fencing token for worker-originated protected writes.

#### Scenario: Worker authority is acquired

- **WHEN** no current fresh worker owner exists, all package/home/schema/process bindings match, and an exact current S6 worker-acquisition authority envelope authorizes the generation and mode
- **THEN** one worker MAY acquire the next monotonic fencing token

#### Scenario: Stale worker attempts a protected write

- **WHEN** a prior worker loses ownership or its fencing token is no longer current
- **THEN** every later protected write from that worker SHALL be rejected

#### Scenario: Activation-only worker is current

- **WHEN** the current worker lease has `worker_mode = activation_only`
- **THEN** it MAY perform only the imported migration-adjacent validation, health-probe, and activation-handshake operations
- **AND** it SHALL NOT claim jobs or write candidates, nodes, embeddings, attribution, governance, or other production semantic state

#### Scenario: Production worker is acquired during production activating

- **WHEN** a current worker lease has `worker_mode = production` but S6 production activation is not yet authoritative
- **THEN** it SHALL remain activation-only in effect for queue and semantic writes

#### Scenario: S6 worker-mode authority is unavailable

- **WHEN** S3 worker lease primitives exist but no current S6 authority envelope authorizes the exact generation, mode, transition role, activation revision, and deadline
- **THEN** runtime worker-lease acquisition SHALL fail closed
- **AND** S3 SHALL NOT infer mode eligibility from package files, process state, worker arguments, or locally read activation fields

### Requirement: Lifecycle controls are bounded and authority-preserving

ExperienceEngine SHALL define bounded restart, drain, shutdown, parent-death, worker-crash, gateway-stop, and orphan behavior without creating implicit package authority.

#### Scenario: Gateway heartbeat is lost

- **WHEN** the current supervisor observes loss of its gateway service relationship
- **THEN** it SHALL enter the defined drain/orphan policy
- **AND** gateway heartbeat loss SHALL NOT transfer supervisor authority to another writer while the supervisor lease remains objectively fresh

#### Scenario: Restart budget is exhausted

- **WHEN** the bounded launch or restart budget is exhausted
- **THEN** no implicit retry authorization SHALL be created
- **AND** later activation/control logic SHALL receive an exact blocked or terminal reason

#### Scenario: Force termination identity is incomplete

- **WHEN** owner id, PID, process-start token, package generation, supervisor epoch, or worker fence cannot all be matched to stale authority evidence
- **THEN** ExperienceEngine SHALL fence writes
- **AND** it SHALL leave process termination to the operator or operating system

### Requirement: Process authority is not semantic write authority

ExperienceEngine SHALL require later production activation authority in addition to current supervisor and worker authority.

#### Scenario: Current worker lease exists before production activation

- **WHEN** a worker owns the current fence but no authoritative current production activation handshake exists
- **THEN** it SHALL NOT claim, renew, or semantically complete production learning work
