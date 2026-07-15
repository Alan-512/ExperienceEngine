# Phase 0.5A.0 OpenClaw Learning Architecture Decision

Date: 2026-07-10  
Status: Accepted target architecture; implemented in the current `v0.5.0` prepublication working tree, with final candidate rebuild and exact published-channel acceptance still pending
Scope: OpenClaw full-learning runtime placement, lifecycle ownership, control surface, and shared-state invariants

> Implementation update, `2026-07-15`: the package-local companion, supervisor/worker lifecycle, authority model, OpenClaw-native controls, and shared-home invariants selected here are now implemented and have passed local-pack real-host validation. The original v0.4.8 reality statements below remain the historical basis for the decision. Exact npm and ClawHub `v0.5.0` validation and the separate quality gate remain incomplete.

## 1. Decision

ExperienceEngine selects the following target combination:

```text
execution placement: package_local_companion
lifecycle ownership: package_local_supervisor
control surface: openclaw_native
shared state: one explicit ExperienceEngine home
```

This was a target architecture decision when written. The implementation update above records later progress without converting local-pack evidence into a full public support claim.

ExperienceEngine v0.4.8 does not implement the companion, supervisor, ownership lease, migration protocol, or OpenClaw-native controls described here.

## 2. Context

The current OpenClaw integration has four separate realities:

1. the published npm package contains the broad ExperienceEngine runtime;
2. the OpenClaw entrypoint disables background learning and hybrid posttask work;
3. the published ClawHub artifact omits the declared executable entrypoints;
4. an OpenClaw-managed npm install does not expose the `ee` CLI on the normal user PATH.

The product must preserve learning quality without requiring users to assemble an undocumented second installation path.

The gateway hot path should not own provider latency, queue retries, long-running distillation, or posttask model work.

The selected architecture keeps prompt-time interaction in the gateway plugin while moving the full learning loop into a worker shipped in the same package.

## 3. Decision By Axis

### 3.1 Execution placement: `package_local_companion`

The gateway plugin owns:

- host lifecycle capture;
- prompt-time retrieval and bounded delivery;
- routine in-session status and feedback interaction;
- short append-only producer writes;
- read-only retrieval from the shared store.

The package-local companion owns:

- provider validation execution;
- candidate generation;
- distillation queue consumption;
- semantic merge decisions;
- embedding production and migration work;
- optional hybrid posttask review;
- queue pause/resume state;
- learning-worker health projection;
- schema bootstrap and migration.

The companion is shipped in the same ExperienceEngine package as the plugin.

It does not depend on a globally installed `ee` binary.

### 3.2 Lifecycle ownership: `package_local_supervisor`

OpenClaw provides the host trigger through its plugin service lifecycle:

```text
service start -> invoke EE package-local supervisor
service stop  -> request supervisor drain and shutdown
```

OpenClaw does not own runtime correctness after service startup returns.

The ExperienceEngine package-local supervisor owns:

- child process creation;
- one-worker lease acquisition;
- duplicate-start convergence;
- child process monitoring;
- bounded restart policy;
- heartbeat publication;
- stale lease recovery;
- orphan detection;
- graceful drain and shutdown;
- package generation fencing;
- compatibility checks before worker activation.

The gateway is a lifecycle caller, not the single-worker authority.

### 3.3 Control surface: `openclaw_native`

Canonical day-to-day controls should be exposed through OpenClaw-native interaction.

The future surface may include:

- learning status;
- worker health;
- queue paused/running/blocked state;
- active provider route;
- last validated generation;
- pause/resume;
- retry blocked system work;
- explain why learning is unavailable;
- repair guidance.

These controls must operate through the package-local supervisor contract.

A package-local command may exist for recovery.

A global `ee` CLI remains an optional operator fallback, not a prerequisite for OpenClaw activation.

## 4. Why `gateway_process` Was Not Selected

Placing the complete learning runtime inside the gateway process would:

- couple provider failures to the gateway;
- couple queue recovery to gateway restart;
- increase hot-path memory and startup cost;
- make long-running model calls part of the host process;
- make package upgrade and migration faults harder to isolate;
- preserve the current temptation to treat interaction activation as full-learning activation.

The gateway should remain responsible for bounded synchronous work.

The complete learning loop is not selected for in-process execution.

## 5. Why `separately_installed_runtime` Was Not Selected

A separate global runtime is technically possible, but it would require:

- a second installation channel;
- PATH management;
- explicit home reconciliation;
- additional onboarding and repair steps;
- separate package version compatibility management.

The published npm package already proves that the complete runtime can be shipped in one package, and OpenClaw exposes a plugin service lifecycle seam.

The package-local companion therefore preserves the intended one-package product shape without lowering learning quality.

A separately installed runtime remains a development or emergency fallback, not the canonical product architecture.

## 6. Distribution Contract

The canonical published artifact must contain:

```text
OpenClaw plugin entrypoint
package-local supervisor entrypoint
package-local worker entrypoint
runtime dependencies
SQLite schema and migrations
packaged quality/profile registry
version and compatibility metadata
```

The published ClawHub artifact must be validated independently from npm.

It may contain the full npm package or a deliberately reduced closure, but any reduced closure must still contain every declared runtime entrypoint and dependency.

Package metadata must not declare files that the published artifact omits.

The activation flow must not assume that OpenClaw installation adds `ee` to PATH.

## 7. Shared Home Contract

Plugin, supervisor, and worker must resolve one canonical home before opening the database.

Resolution order must be frozen in the product contract. The selected runtime result must be recorded in runtime state, including:

- resolution mode;
- resolved home;
- database path;
- package generation;
- schema compatibility;
- validation generation.

An explicit configured or environment-resolved home must override compatibility fallback.

Compatibility fallback may be used only when all participants resolve the same canonical path.

The supervisor must refuse startup when plugin and worker path fingerprints disagree.

## 8. Process Topology

```text
OpenClaw gateway
  └─ ExperienceEngine plugin
       ├─ prompt-time retrieval and interaction hooks
       ├─ short producer writes
       ├─ OpenClaw-native controls
       └─ registerService(start, stop)
            └─ package-local supervisor
                 ├─ ownership lease and heartbeat
                 ├─ version/generation compatibility
                 ├─ child monitoring and restart budget
                 └─ package-local learning worker
                      ├─ candidate generation
                      ├─ queue claim and processing
                      ├─ distillation and embedding
                      └─ posttask review
```

## 9. Worker Ownership Protocol

The shared database must contain a singleton learning-worker lease per ExperienceEngine home.

Minimum lease fields:

```text
lease_key
owner_id
process_id
supervisor_id
package_version
package_generation
artifact_integrity
schema_version
fencing_token
started_at
heartbeat_at
expires_at
shutdown_requested_at
```

Startup protocol:

1. resolve and fingerprint the canonical home;
2. validate package and schema compatibility;
3. open SQLite with the frozen concurrency settings;
4. acquire the worker lease atomically in `BEGIN IMMEDIATE`;
5. reject or converge when another healthy owner exists;
6. start queue consumption only after lease and migration checks succeed;
7. heartbeat the lease at a bounded interval;
8. attach the fencing token to every queue claim and protected write.

Stale takeover protocol:

1. observe lease expiry;
2. verify expiry in an atomic write transaction;
3. replace the owner and increment the fencing token;
4. mark prior in-flight work as system-interrupted rather than content-failed;
5. recover work according to job retry semantics;
6. prevent the old owner from committing with its stale fencing token.

The worker lease is not candidate retry state.

## 10. Queue Claim Protocol

Runnable work must be claimed atomically.

The current list-then-upsert behavior is rejected for the target architecture.

A claim must conditionally transition one job from a runnable state to a leased state using:

- expected prior state;
- current worker owner;
- fencing token;
- claim timestamp;
- claim expiry;
- system-attempt counter.

Provider failure, host shutdown, worker crash, and lease loss must not consume candidate-content retry.

Candidate lifecycle and job lifecycle remain separate.

## 11. SQLite Concurrency Contract

The selected process model requires WAL.

Required invariants:

- one schema/migration owner;
- one learning queue owner;
- plugin producer writes remain short and idempotent;
- worker provider calls occur outside transactions;
- worker result commits are short and fenced;
- busy handling is bounded and observable;
- lock failure maps to a system/runtime state, not candidate-content failure;
- database connection startup validates journal mode and schema compatibility.

WAL improves reader/writer coexistence but does not create multiple-writer ownership safety.

## 12. Migration Ownership Protocol

Only the package-local supervisor/worker generation may perform schema bootstrap or migration.

The plugin must not run opportunistic `ALTER TABLE` operations.

Minimum migration state:

```text
current_schema_version
target_schema_version
migration_owner
migration_fencing_token
migration_started_at
migration_heartbeat_at
migration_expires_at
migration_status
last_error
```

Migration startup:

1. acquire the migration lease;
2. validate the package generation and supported source schema range;
3. migrate transactionally where SQLite permits;
4. persist the new schema version;
5. release migration ownership;
6. only then acquire or activate the learning-worker lease.

If migration cannot complete, the plugin may expose interaction/status capability but must not claim the learning loop is active.

## 13. Gateway Restart Contract

On normal gateway shutdown or restart:

1. OpenClaw calls the plugin service `stop` handler;
2. the supervisor stops accepting new work;
3. in-flight provider work is cancelled or bounded;
4. the worker commits only already-valid fenced results;
5. the supervisor releases the worker lease;
6. the child process exits;
7. the new gateway generation starts the supervisor again;
8. the new worker reacquires ownership and resumes system-retryable jobs.

If the gateway dies without running `stop`, the worker must detect supervisor heartbeat loss and self-terminate or lose its lease within a bounded interval.

## 14. Crash And Restart Contract

The package-local supervisor must monitor the child process.

Allowed restart behavior:

- bounded restart attempts;
- exponential or capped backoff;
- runtime-health state updates;
- no candidate-content retry consumption;
- no restart when package/schema compatibility is invalid;
- no duplicate worker when another healthy owner holds the lease.

After the restart budget is exhausted, the learning capability becomes blocked or degraded with an explicit runtime reason.

Prompt-time interaction must remain bounded and must not silently report learning as healthy.

## 15. Orphan Worker Contract

An orphan is any worker whose:

- supervisor heartbeat is absent;
- package generation is no longer current;
- fencing token is stale;
- lease has expired;
- process identity no longer matches the lease;
- schema compatibility is no longer valid.

An orphan must:

1. stop claiming work;
2. stop protected writes;
3. cancel or abandon in-flight system work;
4. exit within a bounded interval.

The supervisor may terminate a process only when ownership identity and generation evidence match. It must not kill an unrelated reused process id.

## 16. Package Upgrade Contract

OpenClaw may retain old and new package generations simultaneously on disk.

Upgrade therefore requires explicit generation fencing.

Before a new worker becomes active:

1. the new package generation is installed and validated;
2. the old supervisor receives shutdown through gateway lifecycle where possible;
3. the old worker releases ownership or its lease expires;
4. the new generation validates schema compatibility;
5. migrations run under the new migration lease if required;
6. the new worker acquires a fresh fencing token;
7. the old generation is unable to commit further protected writes.

An old worker must never continue against a schema outside its supported compatibility range.

## 17. OpenClaw-Native Control Contract

The canonical user surface should report capability-specific truth:

```text
interaction capability
learning gate capability
distillation capability
embedding capability
sync second-opinion capability
hybrid postmortem capability
```

For the package-local companion, the control surface must expose at least:

- package generation;
- supervisor state;
- worker lease owner and freshness;
- queue state;
- migration state;
- resolved home fingerprint;
- effective route validation state;
- exact blocked/degraded reason;
- safe pause/resume and repair operations.

The model must not infer health from prose. These values come from deterministic runtime state.

## 18. Current Support Statement

Until implementation and published-artifact validation complete, the only safe statements are:

- the npm package contains the broader runtime;
- the OpenClaw entrypoint is configured as interaction-only for background learning;
- the current ClawHub v0.4.8 artifact is incomplete;
- the package-local companion architecture is selected but not implemented;
- OpenClaw full background learning is unsupported;
- the global CLI is not provided by OpenClaw managed installation on the normal PATH.

Do not describe the target architecture as shipped, enabled, available, validated, or supported.

## 19. Preconditions Before Runtime Implementation

Runtime implementation may begin only after Phase 0.5A.1 freezes the relevant protocol and schema.

The freeze must cover:

1. worker lease schema;
2. fencing rules;
3. atomic queue claim transition;
4. system retry versus candidate-content retry;
5. WAL and busy handling;
6. schema version and migration lease;
7. shared-home route fingerprint;
8. package generation identity;
9. gateway stop and parent-death behavior;
10. orphan detection;
11. package upgrade compatibility;
12. OpenClaw-native control/status projection;
13. ClawHub package closure requirements;
14. Windows OpenClaw executable resolution;
15. live gateway activation contract.

No OpenSpec implementation slice should be created before those contracts are frozen.

## 20. Consequences

### Positive

- preserves one-package installation as the product target;
- keeps provider and queue work out of the gateway hot path;
- does not require global CLI availability;
- allows high-quality provider-backed learning rather than weaker fallback;
- provides explicit ownership and upgrade boundaries;
- preserves one shared governance and evidence store.

### Cost

- introduces a supervisor and child-process lifecycle;
- requires worker lease and fencing infrastructure;
- requires WAL and migration ownership changes;
- requires package-generation compatibility handling;
- requires a repaired ClawHub artifact pipeline;
- requires current OpenClaw activation and Windows repair defects to be resolved.

### Rejected shortcut

The product must not enable the current queue in multiple OpenClaw/gateway processes and rely on `busy_timeout` as the safety mechanism.

That shortcut does not satisfy worker ownership, migration serialization, retry semantics, orphan cleanup, or package upgrade compatibility.

