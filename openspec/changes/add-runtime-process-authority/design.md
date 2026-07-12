## Context

The frozen protocol distinguishes package launch authority from process execution and separates immutable authorization issuance revision from mutable authorization-row state revision. It also requires a spawned child to bind exact process identity before lease acquisition, and requires lease terminalization to atomically terminalize the matching launch attempt.

The gateway may request lifecycle actions, but the package-local supervisor and database authority rows decide ownership. Caller-supplied expected values can reject stale callers but cannot redefine objective freshness.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 4.8–4.9 and 4.16.

The implementation SHALL mechanically encode and test:

- gateway heartbeat and supervisor launch-state schemas;
- authorization roles `initial_candidate | active | pending | rollback_candidate` and states `issued | consumed | expired | cancelled`;
- immutable authorization issuance revision versus mutable authorization-state revision;
- launch attempt states `reserved_unbound | reserved_bound | lease_acquired | spawn_failed | timed_out | cancelled | lease_expired | terminated` and their complete writer/CAS table;
- the exact objective `fresh_supervisor_authority` row predicate, including the rule that gateway heartbeat and caller expectations are not predicate inputs;
- supervisor lease states, terminal reasons, renewal/release/revocation/expiry race table, and atomic matching-attempt terminalization;
- worker modes `production | activation_only`, worker lease states, acquisition predicates, monotonic fencing, and activation-only write prohibitions;
- `package-activation-v1` and `supervisor-runtime-v1` timing/restart policy constants;
- gateway stop, parent loss, worker crash, orphan identity, drain, self-termination, and safe force-termination rules.

S3 owns generic authorization consumption, attempt, lease, lifecycle, and fencing primitives. It SHALL NOT expose an unrestricted runtime authorization-insertion path. An authorization may become runtime-current only through an S6 package-authority mutation decision: either a named gateway-whitelist operation or an exact supervisor-owned activation/control transition with its package-state predicates. Before S6 exists, S3 tests may construct repository fixtures directly, but no production runtime path may issue package launch authority.

Worker lease mode and generation eligibility are also S6 decisions. S3 validates and persists an S6 worker-acquisition authority envelope; it does not infer `production` or `activation_only` eligibility from package files, process state, or a locally reconstructed activation predicate. Before S6 is connected, runtime worker-lease acquisition remains unavailable.

## Goals / Non-Goals

**Goals:**

- Ensure one current supervisor authority and one current worker authority per canonical home.
- Bind each supervisor to one consumed launch authorization and one exact launch attempt.
- Reject replayed or conflicting child identity.
- Fence stale supervisors and workers from every later protected write.
- Define deterministic lifecycle terminal states and bounded restart behavior.

**Non-Goals:**

- Defining package activation state transitions or production handshakes.
- Validating provider routes or immutable configuration generations.
- Claiming queue work.
- Treating gateway heartbeat as package authority.
- Publishing a supported OpenClaw full-learning path.

## Decisions

### 1. Keep authorization issuance identity immutable

Each authorization has an immutable id and issuance revision. Consumption, expiry, cancellation, or other row-state transitions advance a separate mutable authorization-state revision. Attempts and leases bind both exact values produced by consumption.

Authorization insertion is not a generic S3 lifecycle action. S3 persists and consumes an authorization only after the caller presents an exact S6 package-authority mutation decision, writer provenance, and package-state CAS evidence.

### 2. Reserve then bind one launch attempt

Authorization consumption and attempt reservation occur atomically. The child starts from `reserved_unbound`; an exact PID/start-identity CAS changes it to `reserved_bound`. A supervisor lease cannot be acquired before that binding.

### 3. Define objective supervisor freshness

`fresh_supervisor_authority` uses only authoritative current lease, attempt, process identity, terminal evidence, expiry, and package/home bindings. Caller expectations are checked separately by the outer mutation CAS.

Gateway heartbeat is deliberately excluded. A fresh supervisor remains package-authority owner until graceful release, exact verified process-exit revocation, or natural expiry wins the lease-state revision CAS.

### 4. Couple lease and attempt terminalization

Renewal, graceful release, verified process-exit revocation, and natural expiry compete on one lease-state revision. Every terminal lease transition atomically gives the matching launch attempt its corresponding terminal state.

### 5. Use monotonic worker fencing

Worker acquisition or stale takeover advances a home-local fencing token. Every later worker-originated protected write must present the exact current owner and fence.

An `activation_only` worker is limited to migration-adjacent validation, health probes, and activation-handshake participation. A `production` lease acquired during `production_activating` remains unable to claim or semantically write until S6 production authority becomes current.

The exact worker mode, generation, transition role, current activation revision, and deadline arrive in an S6 authority envelope. S3 verifies the envelope and CAS conditions but does not choose the mode.

### 6. Keep semantic authority separate

A fresh supervisor, production-mode worker, or current worker lease is necessary but insufficient for semantic learning writes. The canonical production activation and write predicate arrives in S6.

## Risks / Trade-offs

- [Risk] Platform process identity can be weak. → Mitigation: bind PID plus process start identity or the strongest supported equivalent and fail closed when identity cannot be proven.
- [Risk] Natural expiry can race a late heartbeat. → Mitigation: use one lease-state revision and transaction-time comparison.
- [Risk] Gateway retries can create duplicate children. → Mitigation: authorization single-use, one attempt per authorization, exact child binding, and current-attempt projections.
- [Risk] A stale child may continue running. → Mitigation: fencing rejects protected writes and orphan/parent-death rules require self-termination.

## Acceptance Gate

- Tests cover authorization single-use, revision separation, attempt reservation/binding, replay rejection, objective freshness, stale caller mismatch, lease lifecycle races, worker takeover, and stale-fence rejection.
- No lease or process state independently enables production semantic writes.
- `pnpm exec openspec validate add-runtime-process-authority --strict` passes.
