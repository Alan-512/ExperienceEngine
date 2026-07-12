## ADDED Requirements

### Requirement: Imported queue, failure, retry, and provenance tables are exhaustive

ExperienceEngine SHALL implement the complete protected-write matrix, queue metadata, entity-state definitions, failure code/class/scope mapping, mechanical transition table, resume rules, and provenance aggregation contract imported from Sections 4.9–4.11, 5.5, and 8.1–8.6.

#### Scenario: Imported code, state, transition, counter effect, resume trigger, field, or provenance rule is omitted

- **WHEN** a repository, worker, recovery service, schema, or contract fixture omits an imported member
- **THEN** exhaustive contract tests SHALL fail
- **AND** the implementation SHALL NOT route the omitted case through a generic fallback or free-text error path

### Requirement: Job and candidate states retain entity-specific meanings

ExperienceEngine SHALL use the frozen job states `pending`, `processing`, `blocked`, `failed`, `succeeded`, and `discarded`, and candidate states `pending`, `blocked`, `failed`, `distilled`, and `discarded`, or an exact lossless persisted mapping.

#### Scenario: Job leaves processing

- **WHEN** a processing job becomes pending, blocked, failed, succeeded, or discarded
- **THEN** all claim identity fields SHALL be cleared in the same transaction

#### Scenario: Candidate state is persisted

- **WHEN** candidate lifecycle changes
- **THEN** candidate content retry, provenance, and terminal reason SHALL remain candidate truth
- **AND** transient worker owner/fence SHALL NOT be copied as candidate truth

### Requirement: Failure code mapping is one-to-one and stable

ExperienceEngine SHALL map every frozen `EE_*` queue/runtime failure code to exactly one failure class and one default failure scope.

#### Scenario: Context would change failure meaning

- **WHEN** two contexts require different class or retry effects
- **THEN** they SHALL use distinct stable codes from the frozen mapping
- **AND** free-text provider or model errors SHALL NOT drive queue transitions

### Requirement: Runnable work is claimed atomically

ExperienceEngine SHALL claim one runnable learning job by conditionally changing its state and creating its claim in one transaction.

#### Scenario: Two workers compete for one job

- **WHEN** two current-looking workers attempt to claim the same runnable job
- **THEN** at most one transaction SHALL match the expected state revision and current authority predicates
- **AND** the other transaction SHALL make no claim or semantic mutation

#### Scenario: List result becomes stale

- **WHEN** a job was observed as runnable but its state revision or authority changed before claim
- **THEN** the claim SHALL be rejected rather than upserted over the new state

### Requirement: Claim metadata binds complete production authority

ExperienceEngine SHALL bind each production claim to the exact claim id, job state revision, worker owner/fence, supervisor epoch, package generation, current package activation revision, current production activation handshake id, configuration generation, effective route set/revision, capability route, and schema versions.

#### Scenario: Claim binding is incomplete

- **WHEN** any required authority binding is absent, stale, or contradictory
- **THEN** production claim SHALL fail closed
- **AND** a lease, heartbeat, process id, or schema-ready state SHALL NOT fill the missing binding

### Requirement: Worker-originated processing transitions revalidate one authority predicate

ExperienceEngine SHALL require the current claim id, claim owner, claim fencing token, expected job state revision, and `production_write_authorized(existing_claim)` for every worker-originated transition from `processing`.

#### Scenario: Claim is renewed

- **WHEN** all exact claim and current production authority bindings still match
- **THEN** renewal MAY advance the claim/job revision and expiry without changing semantic state

#### Scenario: Authority binding changes

- **WHEN** package activation, production handshake, supervisor epoch, worker owner/fence, configuration generation, route set, schema, or claim revision no longer matches
- **THEN** renewal and semantic completion SHALL be rejected

#### Scenario: Worker attempts blocked, failed, or discarded transition

- **WHEN** the current worker proposes any transition from `processing` to blocked, failed, or discarded
- **THEN** the same claim id, owner, fence, state revision, claim-time authority bindings, and `production_write_authorized(existing_claim)` SHALL be revalidated in the transaction
- **AND** job and candidate state SHALL update atomically

### Requirement: Semantic completion is atomic

ExperienceEngine SHALL commit successful semantic completion in one transaction that revalidates current authority and writes the complete applicable job, candidate, node, provenance, merge, and projection result.

#### Scenario: Completion succeeds

- **WHEN** the exact processing claim and all current bindings match and semantic output satisfies policy
- **THEN** one transaction SHALL record the final job/candidate state and every applicable node/provenance write
- **AND** the claim SHALL become terminal in that transaction

#### Scenario: Any completion write fails

- **WHEN** an applicable write, invariant, or authority check fails
- **THEN** no partial semantic completion SHALL commit

### Requirement: Authority loss permits interruption recovery only

ExperienceEngine SHALL provide one bounded recovery path for unfinished claims whose prior production authority is no longer current.

#### Scenario: Old claim loses authority

- **WHEN** a claim's worker fence, supervisor epoch, activation handshake, activation revision, configuration, route, schema, or package authority is no longer current
- **THEN** no semantic content MAY be written from that claim
- **AND** candidate content retry SHALL NOT be consumed

#### Scenario: Interruption recovery commits

- **WHEN** the current supervisor/gateway recovery authority or exact claim-expiry recovery matches the stale claim, prior owner/fence, claim expiry, and expected job revision
- **THEN** one transaction MAY clear or terminalize the old claim, move the work to the frozen interrupted/runnable/blocked state, and increment only interruption metadata

#### Scenario: Stale worker selects an outcome after authority loss

- **WHEN** a stale worker attempts success, blocked, failed, discarded, candidate, node, embedding, provenance, attribution, or governance writes
- **THEN** the transaction SHALL affect zero rows or fail with the stable fencing rejection
- **AND** the rejection SHALL remain interruption evidence rather than content failure

### Requirement: Retry budgets are independent

ExperienceEngine SHALL maintain separate counters and limits for system attempts, worker interruptions, and candidate content retries.

#### Scenario: Provider route is unavailable

- **WHEN** a valid candidate cannot run because of provider, route, credential, compatibility, or system availability
- **THEN** the system-attempt or blocked metadata MAY change according to policy
- **AND** content retry SHALL remain unchanged

#### Scenario: Candidate content is semantically invalid

- **WHEN** current production authority exists and the candidate output fails a candidate-specific semantic contract
- **THEN** content retry MAY advance
- **AND** the failure SHALL NOT automatically count as a worker interruption or route failure

#### Scenario: Worker crashes mid-claim

- **WHEN** a worker loses authority before semantic completion
- **THEN** interruption count MAY advance through the recovery protocol
- **AND** content retry SHALL remain unchanged

#### Scenario: Content retry is exhausted

- **WHEN** a candidate-specific failed job reaches its frozen content retry limit under current production authority
- **THEN** the job and candidate SHALL transition to `discarded` with a terminal reason in one transaction
- **AND** system-attempt or interruption counts SHALL NOT cause that discard

### Requirement: Failure taxonomy is stable and entity-specific

ExperienceEngine SHALL classify queue failures with stable categories and codes that distinguish provider/system blocking, compatibility/policy blocking, worker interruption, and candidate content failure.

#### Scenario: Work becomes blocked

- **WHEN** a current route or dependency cannot execute valid work but the candidate is not proven semantically invalid
- **THEN** the job SHALL retain recoverable blocked metadata
- **AND** it SHALL NOT be silently discarded through content retry exhaustion

### Requirement: Candidate failures cannot escalate routes automatically in v1

ExperienceEngine SHALL enforce `route-escalation-disabled-v1` for candidate-specific failures.

#### Scenario: Repeated candidate content failures occur

- **WHEN** one or more candidates fail semantic validation on a current route
- **THEN** the queue MAY consume candidate content retries according to policy
- **AND** it SHALL NOT automatically mark the route failed, select a fallback route, or change configuration authority

#### Scenario: Route-level schema invalidity is asserted

- **WHEN** `EE_ROUTE_OUTPUT_SCHEMA_INVALID` would be recorded
- **THEN** it SHALL originate only from an explicit initialization validation or explicit route health probe under the route contract
- **AND** cross-candidate counting SHALL NOT establish it in v1

### Requirement: Semantic-origin provenance is preserved conservatively

ExperienceEngine SHALL persist the semantic-origin generation and assurance facts required to determine candidate and node delivery caps.

#### Scenario: Node merges multiple origins

- **WHEN** candidate content is merged with an existing node
- **THEN** the node SHALL retain exact origins or a conservative compaction that cannot raise assurance

#### Scenario: Exact provenance bound is exceeded

- **WHEN** a node would exceed 64 exact provenance keys
- **THEN** the least-recent low-frequency keys MAY be compacted only into buckets preserving profile identity, assurance floor, contract-version tuple, count, first/last time, worst assurance, and rolling digest
- **AND** compaction SHALL NOT erase unbenchmarked or revoked origin evidence

#### Scenario: Any origin is unbenchmarked custom generation

- **WHEN** a candidate or node contains unbenchmarked custom semantic origin
- **THEN** `contains_unbenchmarked_origin` SHALL be true
- **AND** `custom-shadow-only-v1` SHALL keep the node `shadow_only` regardless of outcomes, confidence, governance maturity, manual promotion, or route state

### Requirement: Queue capability remains closed before production activation

ExperienceEngine SHALL keep production queue claim, renewal, and semantic completion unavailable until S6 supplies authoritative current production activation.

#### Scenario: S1-S5 are valid without S6 handshake

- **WHEN** package, schema, process, configuration, and queue foundations are valid but no current complete production handshake exists
- **THEN** production queue operations SHALL fail closed

### Requirement: S5 cannot define a local production authority

ExperienceEngine SHALL consume the S6 canonical `production_write_authorized(operation)` result without substituting local lease, heartbeat, activation, configuration, route, or schema checks.

#### Scenario: S6 is absent or unavailable

- **WHEN** S5 is implemented before the S6 authority provider exists
- **THEN** the production-authority interface SHALL return false for runtime operations
- **AND** no queue path SHALL reconstruct a weaker predicate from local rows
