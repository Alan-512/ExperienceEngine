## ADDED Requirements

### Requirement: Governance schedule is persisted per scope
ExperienceEngine SHALL persist autonomous hygiene governance schedule state per scope so host lifecycle events cannot directly determine governance frequency.

#### Scenario: Frequent host restarts do not multiply governance runs
- **WHEN** multiple host startup, prompt, posttask, or stop events occur before a scope's persisted `next_due_at`
- **THEN** ExperienceEngine performs only cheap due checks
- **AND** it does not create additional governance runs for those events

#### Scenario: Governance catches up after host inactivity
- **WHEN** a supported host event occurs after a scope's persisted `next_due_at`
- **THEN** ExperienceEngine enqueues or drains one due governance run for that scope
- **AND** it updates schedule state based on the run result

### Requirement: Governance uses canonical scope identity
ExperienceEngine SHALL use canonical scope identity for autonomous governance schedules, leases, plans, and actions.

#### Scenario: Multiple path aliases refer to one repo
- **WHEN** Windows, WSL, OpenClaw, Codex, or Claude host payloads refer to the same repository through different path aliases
- **THEN** ExperienceEngine resolves the same canonical scope id before reading or writing governance schedule and lease state
- **AND** it does not create independent autonomous governance schedules for the aliases

#### Scenario: Host instance owns a lease without changing scope identity
- **WHEN** a host acquires a governance lease
- **THEN** ExperienceEngine records the host instance as the lease owner for diagnostics
- **AND** it keeps the canonical scope id as the schedule and lease authority

### Requirement: Governance runs are lease protected
ExperienceEngine SHALL require a per-scope lease before planning or applying autonomous hygiene governance work.

#### Scenario: Multiple hosts share one ExperienceEngine home
- **WHEN** two or more hosts attempt to drain governance for the same scope at the same time
- **THEN** only the host that acquires the active lease performs governance work
- **AND** the other hosts record a skipped or deferred reason without mutating governance state

#### Scenario: A host exits during governance
- **WHEN** a host exits or crashes while holding a governance lease
- **THEN** the lease expires after its stored expiration time
- **AND** a later host event can resume or retry the governance run

### Requirement: Governance work is bounded and checkpointed
ExperienceEngine SHALL run autonomous governance within configured time and action budgets and checkpoint unfinished work.

#### Scenario: Governance exceeds the current host budget
- **WHEN** a governance run cannot finish within its current budget
- **THEN** ExperienceEngine persists checkpoint state for the pending plan or action cursor
- **AND** the host lifecycle path returns without waiting for a full sweep

#### Scenario: A later event resumes pending governance
- **WHEN** a later host or keeper event observes pending governance checkpoint state
- **THEN** ExperienceEngine resumes from the checkpoint instead of starting an unrelated full run

### Requirement: Governance failures set backoff
ExperienceEngine SHALL set bounded backoff after governance failures so frequent host events cannot repeatedly trigger failing planning or application work.

#### Scenario: Planning or apply fails
- **WHEN** LLM planning, deterministic validation, SQLite lease/application, or action execution fails for a governance run
- **THEN** ExperienceEngine records the failure class and sets `backoff_until` for the affected scope
- **AND** it records a bounded failed-run audit entry

#### Scenario: Host event occurs during backoff
- **WHEN** a host or keeper event occurs before `backoff_until`
- **THEN** ExperienceEngine performs only a cheap schedule check for the affected scope
- **AND** it does not bypass backoff to start a new planner or apply pass

### Requirement: LLM planner does not mutate state directly
ExperienceEngine SHALL use LLM output only as a governance plan proposal that must pass deterministic validation before any mutation.

#### Scenario: LLM proposes a hygiene governance plan
- **WHEN** the LLM planner returns a plan for hygiene findings
- **THEN** ExperienceEngine stores the plan as proposed data
- **AND** it does not mutate nodes, candidates, attribution records, injection records, review events, repo policy, delivery state, or external instruction files from the LLM output alone

### Requirement: Governance validator enforces safety invariants
ExperienceEngine SHALL validate every proposed governance action before applying it.

#### Scenario: Plan loses evidence provenance
- **WHEN** a proposed action would remove origin, helped, harmed, attribution, or review evidence references from the affected guidance
- **THEN** ExperienceEngine rejects the action

#### Scenario: Plan crosses scope boundaries
- **WHEN** a proposed action would merge or rewrite guidance across scopes without an explicit prior scope merge
- **THEN** ExperienceEngine rejects the action

#### Scenario: Plan broadens guidance
- **WHEN** a proposed rewrite expands applicability, removes a narrow trigger, or generalizes a compact hint beyond the evidence
- **THEN** ExperienceEngine rejects the action

#### Scenario: Plan promotes delivery state
- **WHEN** a proposed action would change delivery state to a less restrictive state
- **THEN** ExperienceEngine applies it only through guarded execution when the action is otherwise current and valid
- **AND** the resulting delivery state is no less restrictive than `conservative_only`
- **AND** it never makes the guidance directly eligible for live injection from the autonomous governance action

### Requirement: Safe actions are automatically applied
ExperienceEngine SHALL automatically apply validated low-risk and safety-improving governance actions.

#### Scenario: Exact duplicate guidance is found
- **WHEN** validation proves two same-scope, same-task-family, same-node-type guidance nodes are exact duplicates with compatible lifecycle and delivery states
- **THEN** ExperienceEngine applies a merge into a canonical node when the automatic action budget allows execution
- **AND** it preserves all evidence references and support counts

#### Scenario: Near duplicate guidance is found
- **WHEN** validation proves same-scope, same-task-family, same-node-type guidance nodes are near duplicates
- **AND** at least one affected node is shadow-only or has no helped/harmed history
- **AND** the proposed canonical guidance preserves the narrower trigger, subconditions, and avoid constraints
- **THEN** ExperienceEngine applies a merge into a canonical node when the automatic action budget allows execution
- **AND** it preserves all evidence references and support counts

#### Scenario: Stale shadow-only guidance has no positive evidence
- **WHEN** a shadow-only candidate or node is stale, unused, has no helped evidence, has no recent origin evidence, and is not referenced by a legacy pending approval
- **THEN** ExperienceEngine retires it when the automatic action budget allows execution
- **AND** it records the retirement as an autonomous governance action

#### Scenario: Risky live guidance has invalidating evidence
- **WHEN** an eligible or conservative-only node has invalidating or harmful evidence that satisfies deterministic governance rules
- **THEN** ExperienceEngine downgrades delivery state or quarantines the node when the automatic action budget allows execution
- **AND** it records the rule and evidence that allowed the safety-improving mutation

### Requirement: High-impact experience-store actions are guarded and automatic
ExperienceEngine SHALL apply valid high-impact experience-store governance actions automatically through guarded execution rather than requiring routine human approval.

#### Scenario: Plan proposes delivery promotion
- **WHEN** a governance plan proposes promoting an experience node
- **THEN** ExperienceEngine applies the promotion only if deterministic validation passes
- **AND** it sets the node to active conservative delivery rather than live-eligible delivery
- **AND** it records affected row hashes, validator notes, and a rollback snapshot

#### Scenario: Plan proposes delete-like cleanup
- **WHEN** a governance plan proposes removing an experience record from delivery
- **THEN** ExperienceEngine applies only a soft-retire or quarantine mutation
- **AND** it does not physically delete the row
- **AND** it records affected row hashes, validator notes, and a rollback snapshot

#### Scenario: Plan proposes conflicted evidence merge
- **WHEN** a governance plan proposes merging nodes where both sides have meaningful helped or harmed histories
- **THEN** ExperienceEngine applies the merge only if deterministic validation proves evidence preservation and scope compatibility
- **AND** the canonical node cannot remain directly eligible for live injection after the guarded merge
- **AND** retired or conflicting source nodes are kept as auditable rows outside delivery

#### Scenario: Plan proposes non-store or broad mutation
- **WHEN** a governance plan proposes exporting guidance, changing repo policy, restoring retired guidance to live eligibility, physically deleting records, or broad rewrites without an explicit replacement contract
- **THEN** ExperienceEngine rejects the action from autonomous hygiene governance
- **AND** it records the rejection reason for inspection

### Requirement: Governance mutations are auditable and rollbackable
ExperienceEngine SHALL create audit records and rollback snapshots for every applied autonomous governance mutation.

#### Scenario: Governance action is applied
- **WHEN** ExperienceEngine applies a governance action
- **THEN** it records the run id, plan id, action type, affected ids, affected row versions or hashes, validator decision, before snapshot reference, after state reference, and timestamp

#### Scenario: Applied action is rolled back
- **WHEN** an operator or host-approved workflow rolls back an applied governance action and affected row versions still match the recorded dependency chain
- **THEN** ExperienceEngine restores affected rows from the recorded snapshot
- **AND** it records a rollback action linked to the original action

#### Scenario: Rollback target changed after the original action
- **WHEN** rollback is requested but later governance actions changed the same affected rows
- **THEN** ExperienceEngine refuses blind restore
- **AND** it queues or reports a rollback review item with the conflicting action ids

### Requirement: Optional keeper uses the same governance path
ExperienceEngine SHALL support an optional scheduled keeper for strict wall-clock governance without bypassing the normal schedule, lease, validation, and audit rules.

#### Scenario: Keeper wakes a due scope
- **WHEN** an installed keeper wakes ExperienceEngine for a due scope
- **THEN** ExperienceEngine uses the same governance enqueue and drain path as host-attached events
- **AND** it still honors persisted schedules, leases, budgets, validators, and backoff
