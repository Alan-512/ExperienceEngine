## 1. Authority Schema And Repositories

- [x] 1.1 Materialize the imported authorization roles/states, attempt transitions, lease states/reasons, worker modes, timing policies, restart policies, and writer/CAS matrices as typed exhaustive fixtures/constants.
- [x] 1.2 Add launch-authorization, launch-attempt, supervisor-lease, worker-lease, restart-budget, and lifecycle-control schema/repositories.
- [x] 1.3 Preserve immutable authorization issuance revision separately from mutable authorization-row state revision.
- [x] 1.4 Bind all rows to stable home id, package generation, artifact integrity, and schema compatibility.
- [x] 1.5 Keep authorization insertion unavailable except through an S6 package-authority mutation adapter covering named gateway operations and exact supervisor-owned activation/control transitions; use repository-only fixtures before S6.

## 2. Launch Authorization And Attempt Binding

- [x] 2.1 Implement atomic authorization consumption and unique launch-attempt reservation.
- [x] 2.2 Implement revisioned `reserved_unbound` to `reserved_bound` child identity CAS.
- [x] 2.3 Reject replay, conflicting PID/start identity, late children, and authorization reuse.

## 3. Supervisor Authority

- [x] 3.1 Implement the canonical objective `fresh_supervisor_authority` predicate from authoritative rows only.
- [x] 3.2 Implement supervisor lease acquisition, renewal, graceful release, verified-exit revocation, and natural expiry.
- [x] 3.3 Atomically terminalize the matching launch attempt with every terminal lease transition.
- [x] 3.4 Keep caller expected epoch/owner/revision checks in the outer mutation CAS.
- [x] 3.5 Add exhaustive predicate fixtures proving gateway heartbeat and caller expectations cannot change objective freshness.

## 4. Worker Authority And Lifecycle

- [x] 4.1 Implement singleton worker lease acquisition and stale takeover with monotonic fencing.
- [x] 4.2 Add bounded restart, drain, shutdown, parent-death, worker-crash, orphan, and self-termination behavior.
- [x] 4.3 Reject every stale-owner or stale-fence protected-write attempt in focused repository tests.
- [x] 4.4 Keep queue claiming and semantic completion disabled pending S6 authority.
- [x] 4.5 Implement and test the exact `activation_only` operation allowlist and production-mode pre-handshake semantic prohibition.
- [x] 4.6 Add exact safe force-termination identity tests and orphan self-termination deadlines.
- [x] 4.7 Add an S6 worker-acquisition authority envelope interface and prove runtime worker leases cannot be acquired before S6 authorizes exact generation/mode/role/revision/deadline; use isolated repository fixtures only before S6.

## 5. Validation

- [x] 5.1 Run focused process-authority and lifecycle race tests.
- [x] 5.2 Run TypeScript typecheck and relevant runtime/repository tests.
- [x] 5.3 Run the full test suite and build after shared lifecycle changes.
- [x] 5.4 Run `pnpm exec openspec validate add-runtime-process-authority --strict`.
