## 1. Activation Authority Schema

- [ ] 1.1 Materialize the imported activation fields, exact state table, gateway whitelist, blocked-boundary exits, writer-mode matrix, control/idempotency schema, handshake transitions, timing policy, status projection, and readiness predicates as typed exhaustive fixtures/constants.
- [ ] 1.2 Add package activation, transition, blocked boundary, handshake, current pointer, and control-idempotency schema/repositories.
- [ ] 1.3 Represent current activation revision separately from immutable historical launch activation revision.
- [ ] 1.4 Add exhaustive identity-shape, writer, state, boundary, deadline, and transition tests with no default branch.

## 2. Bootstrap And Initialization

- [ ] 2.1 Implement absent-row empty-home bootstrap at revision zero only.
- [ ] 2.2 Implement `initialize_package_activation` for any exact valid `uninitialized` revision `N >= 0`.
- [ ] 2.3 Atomically create pending initial generation, deadline, launch budget, authorization, and current pointers.

## 3. Gateway And Supervisor Writers

- [ ] 3.1 Implement the exhaustive gateway package-authority mutation whitelist.
- [ ] 3.2 Require objective `fresh_supervisor_authority = false` for gateway-owned no-supervisor branches.
- [ ] 3.3 Implement supervisor-owned transitions with exact owner/epoch/revision authority.
- [ ] 3.4 Add active restart and deterministic replacement authorization issuance without role ambiguity.
- [ ] 3.5 Implement mutually exclusive gateway/supervisor writer modes and reject mixed or missing writer provenance.
- [ ] 3.6 Prove stale-owner recovery uses only deterministic replacement issuance or a named blocked operation.

## 4. Verification And Production Handshake

- [ ] 4.1 Implement revisioned preactivation verification with one persistent writer and replay/expiry rejection.
- [ ] 4.2 Implement package identity CAS and post-CAS production worker lease/fence acquisition.
- [ ] 4.3 Implement revisioned production activation handshake bound to exact launch, process, worker, config, route, and schema evidence.
- [ ] 4.4 Implement `production_activation_authorized` and operation-specific `production_write_authorized`.
- [ ] 4.5 Wire S5 queue operations only through the canonical predicate.
- [ ] 4.6 Enforce plugin-request-only handshake insertion, supervisor-only persistent transitions, and worker IPC-only acknowledgment.
- [ ] 4.7 Add continuing-supervisor and replacement-supervisor fixtures proving current and historical activation revisions are compared in separate namespaces.
- [ ] 4.8 Add operation-specific worker lease-state tests for new claims/standalone writes, deliberate-drain existing claims, and package-transition or authority-loss drains.

## 5. Blocked Controls And Idempotency

- [ ] 5.1 Implement each boundary-specific retry, cancel, production-retry, and rollback operation.
- [ ] 5.2 Commit control mutation and completed/rejected idempotency result in one transaction.
- [ ] 5.3 Reject request-id digest conflicts and stale expected revisions deterministically.
- [ ] 5.4 Add exhaustive tests for all four blocked boundaries and every legal/illegal exit, including no direct post-identity transition to active.
- [ ] 5.5 Implement the exact minimum OpenClaw-native operation set and prove read-only operations do not mutate while every mutation uses idempotency and the correct S5/S6 authority boundary.

## 6. OpenClaw-Native Projection

- [ ] 6.1 Add concise native status/control results for interaction, package activation, worker health, queue state, route, and exact next action.
- [ ] 6.2 Derive `interaction_active`, `learning_runtime_active`, and `production_learning_ready` without using loaded/file/PID/database shortcuts.
- [ ] 6.3 Keep global CLI optional and preserve existing fallback paths.
- [ ] 6.4 Add exact deterministic status projection fields and tests for custom valid-but-unbenchmarked readiness remaining false.
- [ ] 6.5 Add ordinary active-runtime restart tests proving fresh active authorization when needed, fresh worker fence/handshake, handshake-pointer replacement, and preserved activation revision/state.
- [ ] 6.6 Add same-transaction invalidation tests for package/handshake/configuration/route/schema changes and matching worker drain/block fields.
- [ ] 6.7 Implement orthogonal setup/profile/core-quality/learning-health/capability/value projections with concise default and verbose evidence views.
- [ ] 6.8 Derive milestones from existing records, prohibit a second activation ledger and global `host_ready_at`, and add exact manual/strong-helped outcome-confirmed value tests.
- [ ] 6.9 Wire the OpenClaw plugin service lifecycle to package-local supervisor start/drain without moving provider, migration, queue, or semantic worker execution into the gateway process.
- [ ] 6.10 Add OpenClaw plugin regressions for interaction-only, schema-mode producer writes, warming/blocked status, and no false full-learning activation.
- [ ] 6.11 Add CLI status/doctor regressions for orthogonal projections, concise next action, verbose authority evidence, secret exclusion, and source-versus-published evidence separation.

## 7. Validation

- [ ] 7.1 Run exhaustive state-machine, writer, revision, handshake, blocked-control, and idempotency tests.
- [ ] 7.2 Run deterministic clean-home local activation and authority-loss queue tests.
- [ ] 7.3 Run TypeScript typecheck, full tests, and build.
- [ ] 7.4 Run `pnpm exec openspec validate add-openclaw-production-activation --strict`.
