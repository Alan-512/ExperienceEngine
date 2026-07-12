## Why

The current queue cannot safely support a package-local production worker because list-then-write behavior, generic retries, and provider/content failure conflation can duplicate work or discard valid candidates. Phase 0.5A.1 freezes atomic claim/renew/commit semantics, authority-bound metadata, interruption-only recovery after authority loss, separate retry counters, deterministic failure taxonomy, and semantic-origin provenance.

This fifth slice depends on package/home, schema/migration, process, and configuration/route authority. It deliberately keeps production claiming disabled until `add-openclaw-production-activation` supplies an authoritative current handshake and the canonical production-write predicate.

## What Changes

- Add mechanical job and candidate states with atomic runnable-to-processing claim.
- Bind every claim to current job revision, worker owner/fence, supervisor epoch, package generation, activation revision, production handshake id, configuration generation, effective route set, and schemas.
- Add fenced claim renewal, semantic completion, blocked transitions, cancellation/discard controls, and interruption recovery.
- Separate system attempt count, worker interruption count, and candidate content retry count.
- Add stable provider/system/content/policy/compatibility failure taxonomy.
- Disable automatic candidate-to-route escalation in `route-escalation-disabled-v1`.
- Add exact candidate/node semantic-origin provenance and enforce `custom-shadow-only-v1`.
- Keep production claim and semantic commit fail-closed until S6 makes `production_write_authorized` true.

## Capabilities

### New Capabilities

- `fenced-learning-queue`: Atomic fenced learning queue, retry/failure separation, interruption recovery, semantic commit atomicity, and provenance policy for production learning work.

### Modified Capabilities

- `experience-candidate-distillation`: Distillation failures no longer share one generic candidate retry path; system-route failure, interruption, and candidate-content failure have separate states, counters, and discard effects.
- `experience-intervention-governance`: Any node containing unbenchmarked custom semantic origin remains record-only `shadow_only` and cannot use existing diagnostic or conservative live-delivery paths.

## Impact

- Expected code areas: distillation queue worker, job/candidate repositories, learning pipeline, node merge/writeback, background runtime, route failure handling, governance/delivery state, status/doctor projections, and tests.
- Expected persisted concepts: claim id/owner/fence, claim authority bindings, lease/renewal timestamps, state revision, failure category/code, three retry counters, blocked metadata, semantic-origin provenance, and completion transaction evidence.
- Dependencies: S1-S4.
- Held closed until: S6 current production activation and handshake authority.
- No production queue work becomes supported through this slice alone.
