## Why

The previous slices can establish package, schema, process, configuration, route, and queue foundations, but none may decide that production learning is active. Phase 0.5A.1 freezes one exhaustive package-activation state machine, one gateway package-authority mutation whitelist, distinct preactivation and post-CAS production handshakes, exact launch evidence, blocked-boundary controls, crash-safe idempotency, and one canonical production activation/write predicate.

This sixth slice is the earliest slice that may make production activation logically possible. It depends on S1-S5 and still does not prove the published npm or ClawHub path; that proof belongs to S7.

## What Changes

- Add exhaustive package activation states and identity shapes for uninitialized, preparing, draining, migrating, preactivation verifying, production activating, active, and blocked behavior.
- Add revision-checked `initialize_package_activation` from any exact valid `uninitialized` revision `N >= 0`; reserve revision zero for absent-row empty-home bootstrap only.
- Add the exhaustive gateway package-authority mutation whitelist and objective fresh/no-fresh supervisor guards.
- Add separate preactivation verification and post-identity-CAS production activation handshakes with one persistent writer, revisioned CAS, expiry, and replay rejection.
- Bind production activation to the exact current package generation, activation revision, supervisor lease epoch, launch authorization/attempt evidence, worker production mode/fence, configuration generation, effective route set, and schemas.
- Add boundary-specific retry/cancel/rollback controls and crash-safe request idempotency.
- Add OpenClaw-native status/control projections and truthful `interaction_active`, `learning_runtime_active`, and `production_learning_ready` predicates.
- Enable S5 production queue operations only when the canonical predicate is true.

## Capabilities

### New Capabilities

- `openclaw-production-activation`: Exhaustive OpenClaw package activation, gateway control authority, preactivation/production handshakes, blocked recovery, and canonical production learning authority.

### Modified Capabilities

- `openclaw-experience-plugin`: The plugin service lifecycle becomes the canonical caller for the package-local supervisor while plugin interaction, producer writes, and full learning activation remain separately gated.
- `cli-user-experience-surface`: Status and doctor surfaces expose orthogonal setup, quality, learning health, capability, activation, blocked queue, and value projections without implying published support.

## Impact

- Expected code areas: OpenClaw plugin service lifecycle, package-local supervisor control loop, activation/control repositories, process authority, worker startup mode, queue authority interface, status/doctor/native controls, install/upgrade/rollback flows, and tests.
- Expected persisted concepts: package activation authority row, current/previous/pending generation ids, activation revision, transition/boundary/deadline, handshake rows/revisions, current pointers, control request idempotency, and status projections.
- Dependencies: S1-S5.
- Held closed until: its full activation gate passes; canonical published support remains blocked until S7.
- This slice must not update public docs to claim the published path works.
