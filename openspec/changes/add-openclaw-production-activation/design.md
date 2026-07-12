## Context

Phase 0.5A.1 distinguishes historical launch evidence from current package activation truth. A transition supervisor may continue across identity CAS with historical launch activation revision that differs from the new current package activation revision. Production learning becomes active only after a fresh production worker fence and a completed post-CAS production handshake bind the new current authority.

Gateway service controllers may perform only the mutations in one exhaustive whitelist and only when objective `fresh_supervisor_authority = false` for gateway-owned branches. Caller expected values remain outer CAS checks.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 4.8, 4.15–4.17, 4.20, and 9.1–10.3.

The implementation SHALL mechanically encode and test:

- the complete package-generation and package-activation authority fields;
- activation states `uninitialized | preparing | draining_old | migrating | preactivation_verifying | production_activating | active | blocked` and the exact state/identity/writer/edge/deadline table;
- blocked boundaries `pre_identity_initial | pre_identity_upgrade | pre_identity_rollback | post_identity` and every legal boundary-specific exit/effect;
- the exhaustive gateway operation whitelist with these exact names: `bootstrap_package_activation_authority`, `initialize_package_activation`, `consume_launch_authorization_and_reserve_attempt`, `expire_or_cancel_unconsumed_authorization`, `issue_active_restart_authorization`, `issue_deterministic_replacement_authorization`, `enter_blocked_transition`, `retry_package_activation`, `cancel_package_transition`, `retry_production_activation`, and `prepare_package_rollback`;
- mutually exclusive supervisor and gateway writer modes, including `expected_supervisor_lease_epoch: integer | none`;
- the complete control request/idempotency and deterministic status projection schemas;
- the minimum OpenClaw-native operation set: `status`, `pause_learning`, `resume_learning`, `retry_blocked_system_work`, `initialize_package_activation`, `prepare_package_generation`, `prepare_package_rollback`, `retry_package_activation`, `cancel_package_transition`, `retry_production_activation`, `request_drain`, and `repair_explanation`;
- activation handshake fields, states, one-writer transitions, purpose-specific predicates, expiry/replay rules, and continuing-versus-replacement supervisor launch binding;
- `package-activation-v1` handshake/deadline constants;
- exact `interaction_active`, `learning_runtime_active`, `production_learning_ready`, `production_activation_authorized`, and operation-specific `production_write_authorized` predicates.
- the separate setup, quality profile, core learning quality, learning health, per-capability, value, and outcome-confirmed value projections;
- derive-before-persist milestone rules, no global `host_ready_at`, no second activation ledger, and the exact outcome-confirmed value predicate.

The imported tables are executable protocol, not examples. Any implementation enum, writer switch, transition function, or test matrix that omits a listed member is non-conforming.

## Goals / Non-Goals

**Goals:**

- Give every activation state one identity shape, writer, entry edge, exit edge, and deadline rule.
- Prevent revision-zero and re-initialization dead states.
- Separate preactivation verification from production activation.
- Define one canonical production activation and protected-write predicate.
- Make controls idempotent and boundary-specific.
- Expose truthful OpenClaw-native state without conflating interaction with learning readiness.

**Non-Goals:**

- Proving actual published npm/ClawHub artifact closure.
- Changing benchmark statistical eligibility.
- Allowing custom-origin live delivery.
- Treating ordinary active-runtime downtime as a package identity transition.
- Making global `ee` CLI installation a prerequisite.

## Decisions

### 1. Use an exhaustive activation authority row

One current row stores state, current activation revision, active/pending/previous generation identities, transition kind, blocked boundary/from-state, deadline, current authorization/attempt/handshake pointers, and current control revisions.

### 2. Bootstrap revision zero once, initialize at any exact uninitialized revision

Absent-row empty-home bootstrap creates the authority row at revision zero only. `initialize_package_activation` may run against any exact valid `uninitialized` revision `N >= 0` with no generation or pointer residue and advances to `N + 1` while issuing the initial authorization and deadline.

### 3. Centralize gateway writer authority

Every gateway-owned package-authority mutation must be named in the frozen exhaustive whitelist. Each branch requires current gateway identity/heartbeat, exact expected revisions, and objective absence of a fresh supervisor where required.

The whitelist operation names and field effects are fixed by the imported table. A helper method, control alias, or recovery branch cannot create another gateway mutation class.

### 4. Separate preactivation and production handshakes

Preactivation verifies the pending package before identity publication. It cannot satisfy live activation. After the package identity CAS, a fresh production worker lease/fence and post-CAS production handshake are required.

The plugin writes only the initial `requested` handshake row. After insertion, the current supervisor is the sole persistent handshake writer. The worker returns a fenced nonce proof through authenticated package-local IPC and never writes the handshake table directly.

### 5. Preserve historical launch revisions

Authorization, attempt, and supervisor lease keep immutable historical launch activation revision. Current package mutations compare only the current activation revision. Handshakes record both namespaces when they differ.

### 6. Define one production authority predicate

`production_activation_authorized` requires active package identity and one complete, unexpired, current production handshake. `production_write_authorized(operation)` additionally requires exact worker owner/fence and operation-specific claim/lease state. S5 consumes this predicate without local weaker alternatives.

### 7. Make blocked controls boundary-specific

Each blocked boundary defines exactly which retry, cancel, production retry, or rollback operation is legal and its effects on identities, deadlines, authorization, handshakes, leases, and fences.

### 8. Commit control result with mutation

Request id, digest, expected revisions, mutation, and completed/rejected idempotency result commit atomically. Reusing a request id with another digest is a stable rejection.

Read-only `status` and `repair_explanation` return deterministic projections without creating mutation authority. Every mutating control uses the same idempotency and mutually exclusive writer-mode contract, including queue pause/resume/retry and lifecycle drain requests.

### 9. Derive orthogonal product state and value

Status derives setup, profile, core quality, learning health, capability details, first-value state, and outcome-confirmed value separately. It must not collapse them into one ready/healthy enum.

Existing task, node, injection, and attribution records are the preferred milestone sources. The slice does not create a second activation/value event ledger or one global `host_ready_at`. Outcome-confirmed value is reached only by a delivered intervention with manual helped override or medium/high-confidence `strong_helped` attribution.

## Risks / Trade-offs

- [Risk] State machine complexity can create implicit transitions. → Mitigation: exhaustive tables/tests and reject any unlisted writer or edge.
- [Risk] Continuing supervisor history differs from current revision. → Mitigation: explicit current/historical namespaces and field-specific comparisons.
- [Risk] Preactivation success may be mistaken for readiness. → Mitigation: separate handshake kinds and predicates; only post-CAS production handshake can satisfy runtime-active.
- [Risk] Gateway and supervisor can race. → Mitigation: objective freshness plus mutually exclusive writer modes and exact revision CAS.

## Acceptance Gate

- Tests cover every state/edge/deadline, initialization at revision zero and nonzero, gateway whitelist, objective freshness, launch binding, preactivation/production separation, stale/replay rejection, blocked controls, continuing/replacement supervisor paths, idempotency, and canonical queue write authority.
- Deterministic local clean-home activation proves S5 claims cannot start before production handshake and stop immediately after authority invalidation.
- Public support remains unclaimed until S7.
- `pnpm exec openspec validate add-openclaw-production-activation --strict` passes.
