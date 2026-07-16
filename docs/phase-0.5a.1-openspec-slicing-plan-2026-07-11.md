# Phase 0.5A.1 OpenSpec Slicing Plan

**Created:** `2026-07-11`

**Status:** Historical slicing plan approved. S1-S8 implementation and acceptance gates are complete. The accepted one-block S8 pilot is intentionally `not_publishable` under its sealed repetition threshold.

## Post-Implementation Status

This document remains the historical dependency and ownership plan. Current progress is:

| Slice | Current status |
| --- | --- |
| S1 `establish-runtime-package-home-identity` | Complete |
| S2 `add-runtime-schema-migration-authority` | Complete |
| S3 `add-runtime-process-authority` | Complete |
| S4 `add-runtime-configuration-route-authority` | Complete |
| S5 `add-fenced-learning-queue-semantics` | Complete |
| S6 `add-openclaw-production-activation` | Complete |
| S7 `validate-published-runtime-closure` | Complete, including exact published npm/ClawHub live-host acceptance |
| S8 `add-matched-block-benchmark-evidence` | Complete: sealed three-arm harness, failure/replacement protocol, complete-block scoring, real OpenClaw pilot, deterministic recomputation, and fail-closed publication decision accepted; one-block pilot remains `not_publishable` |

Historical statements below that say implementation has not started describe the state when the slicing plan was approved, not the current repository state.

**Source of truth:** `docs/adoption-quality-evidence-design-2026-07-10.md`, with Phase 0.5A.1 protocol freeze approved after the final three-blocker closure confirmation.

**Frozen contract id:** `phase-0.5a.1-freeze-2026-07-11`

## Goal

Translate the frozen Phase 0.5A.1 protocol into independently reviewable and independently verifiable OpenSpec changes without reopening accepted architecture or enabling a partial runtime that can bypass the final production-activation authority.

## Non-Goals

- Do not implement the package-local supervisor, worker, schema, queue, activation, control, benchmark, or distribution changes in this planning pass.
- Do not change public documentation to claim full OpenClaw background learning support.
- Do not treat an earlier slice as production-ready merely because its local tests pass.
- Do not replace the frozen protocol with implementation preferences about module names, query shape, indexes, or logging layout.

## Dependency Graph

```text
S1 package/home identity
  -> S2 SQLite/schema/migration authority
     -> S3 supervisor/worker authority and fencing
        -> S4 immutable configuration/validation/route authority
           -> S5 fenced queue/failure/provenance semantics
              -> S6 OpenClaw control and production activation
                 -> S7 published artifact runtime closure
                    -> S8 matched-block benchmark evidence
```

Later slices may be reviewed while earlier slices are unimplemented, but implementation and acceptance must preserve this order unless a replacement ordering proves the same writer, fencing, activation, retry, and distribution safety invariants.

## Slice Register

| Slice | OpenSpec change | Primary capability | Depends on | Held closed until | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| S1 | `establish-runtime-package-home-identity` | `runtime-package-home-identity` | none | S2 schema authority | Package closure and canonical home identity are deterministic, integrity-bound, and identical across plugin, supervisor, worker, and operator paths. |
| S2 | `add-runtime-schema-migration-authority` | `runtime-schema-migration-authority` | S1 | S3 process authority | SQLite settings, schema metadata, one migration owner, migration lease, and plugin ready/read-only/warming/incompatible modes are mechanically enforced. |
| S3 | `add-runtime-process-authority` | `runtime-process-authority` | S1, S2 | S6 production activation | Launch authorization, attempt binding, child identity, supervisor lease, worker lease, fencing, lifecycle terminalization, and canonical supervisor freshness are atomic and split-brain safe. |
| S4 | `add-runtime-configuration-route-authority` | `runtime-configuration-route-authority` | S1-S3 | S6 production activation | Machine integrity, immutable configuration generation, provider validation, capability route state, invalidation, and current pointer CAS are crash-atomic and fail closed. |
| S5 | `add-fenced-learning-queue-semantics` | `fenced-learning-queue` | S1-S4 | S6 production activation | Queue claim/renew/complete/recover uses one protected-write predicate, separate retry counters, deterministic failure taxonomy, and provenance caps; production claiming remains disabled without authoritative handshake fixtures. |
| S6 | `add-openclaw-production-activation` | `openclaw-production-activation` | S1-S5 | completion of its own gate | OpenClaw-native controls, exhaustive package activation, preactivation verification, post-CAS production activation, gateway whitelist, and live activation projections converge on one authority truth. |
| S7 | `validate-published-runtime-closure` | `published-runtime-closure` | S1-S6 | published npm and ClawHub evidence | Actual downloaded artifacts contain every entrypoint/dependency/schema/profile asset and pass clean-home, Windows resolution, supervisor/worker, and live-host activation validation before docs change. |
| S8 | `add-matched-block-benchmark-evidence` | `matched-block-benchmark-evidence` | S1-S7 | complete benchmark gate | Immutable block manifests, preflight/formal separation, one formal attempt per block/arm, forced holdout, arm-neutral instrumentation, complete-block efficacy, replacement reruns, and publication thresholds are enforced. |

## Cross-Slice Safety Invariants

Every OpenSpec change SHALL preserve all of the following even when reviewed or implemented in isolation:

1. A production lease alone never authorizes semantic learning writes.
2. Pending-generation and activation-only workers never claim production queue work.
3. Authority loss permits only interruption recovery; it cannot write semantic content or consume content retry.
4. Revision zero belongs only to absent-row empty-home authority bootstrap.
5. `initialize_package_activation` accepts the exact valid `uninitialized` revision `N >= 0`.
6. `fresh_supervisor_authority` is derived only from authoritative database evidence; caller expected values are outer CAS predicates.
7. Current package activation revision and historical launch activation revision remain distinct.
8. Gateway package-authority writes exist only in the frozen exhaustive whitelist.
9. Historical authorization, attempt, lease, or handshake evidence is immutable and cannot overwrite current authority.
10. Any node containing unbenchmarked custom semantic origin remains `shadow_only` for the complete lifetime of `custom-shadow-only-v1`.
11. Migration ownership is singular; the gateway plugin cannot perform opportunistic schema migration.
12. WAL, busy retries, PID presence, file existence, loaded plugin state, or current heartbeat are never substitutes for ownership or production activation authority.

## Normative Frozen Contract Import Matrix

The OpenSpec changes are implementation deltas over the frozen design. The following source sections are normative imports, not background reading. An implementation that omits, renames away, weakens, or locally contradicts an imported field, state, transition, writer rule, policy value, failure mapping, or evidence rule is non-conforming even when its local tests pass.

| Slice | Normative source sections | Mandatory mechanical encoding |
| --- | --- | --- |
| S1 | 4.3, 4.7 stable control-plane bootstrap, initial table shapes imported from 4.8, 4.13, 4.15, 4.17, 4.20 and 6.6, 4.14 home identity, 4.15 package-generation identity, 4.18 embedded closure manifest | canonical-home resolution, create-once integrity key, complete fixed empty-home control-plane bootstrap DDL/constraints/meta, home identity, package-generation identity, closure-manifest fixture, mismatch/concurrency tests |
| S2 | 4.12–4.13 | exact SQLite v1 PRAGMA policy, read-back verification, transaction rules, busy/lock failure behavior, schema compatibility table, migration lease/state table, plugin mode permission matrix |
| S3 | 4.8–4.9, 4.16 | gateway heartbeat and launch-state schema, authorization and attempt states/transitions, supervisor freshness predicate, lease lifecycle table, worker modes, fencing policy, versioned timing/restart policies |
| S4 | 5.1–5.6, 6.1–6.7, 7.1–7.3 | profile-registry schema/rules, immutable configuration-generation manifest, integrity-key bootstrap, validation record schema/invalidation, route envelope, supervisor-only runtime-route writer matrix, capability route/fallback table |
| S5 | 4.9–4.11, 5.5, 8.1–8.6 | protected-write operation matrix, queue metadata, job/candidate state tables, stable failure code/class/scope mapping, transition/counter table, resume rules, provenance schema/aggregation limits, custom shadow-only cap |
| S6 | 4.8, 4.15–4.17, 4.20, 9.1–10.3 | activation authority schema, exact state table, blocked-boundary exit table, exhaustive gateway whitelist, writer-mode CAS matrix, handshake schema/transitions, live activation/readiness predicates, orthogonal setup/quality/health/value projection, derived milestone rules, deterministic status/control schema |
| S7 | 4.18–4.20, 13–14, 17 | embedded closure manifest, external distribution attestation, per-channel evidence record, actual-download validation sequence, Windows resolution record/probe, live-host gate, documentation evidence matrix |
| S8 | 12.1–12.11 | statistical units, event aggregation, minimum scorecard, ground-truth schema, three-arm contract, sealed manifest, preflight/formal attempt schema, failure/disposition table, replacement lineage, scoring and publication rules |

Each implementation slice must materialize its imported contract as typed schemas/constants, migration definitions where applicable, exhaustive tables or fixtures, and tests that fail when an imported enum member, writer branch, transition, required field, or policy value is omitted.

## Cross-Slice Ownership Matrix

| Authority or artifact | Sole owning slice | Cross-slice rule |
| --- | --- | --- |
| Package closure, create-once integrity key, fixed empty-home control-plane bootstrap, and stable home identity | S1 | Key creation occurs after canonical path resolution and before SQLite bootstrap. S1 may create only the fixed versioned control-plane bootstrap schema; all later control-schema/learning-schema changes belong to S2 migration authority. Later slices consume immutable identity and cannot add another resolver, key lifecycle, or package-generation identity. |
| SQLite/schema/migration authority | S2 | WAL/locks never confer process or activation authority; plugin cannot opportunistically migrate. S2 exposes a fail-closed supervisor-authority dependency and cannot acquire a runtime migration lease until S3 supplies objective fresh supervisor authority. |
| Generic authorization consumption, launch attempt, supervisor/worker lease and fencing primitives | S3 | S3 exposes no unrestricted package-authorization issuer. Authorization insertion is legal only through an S6 package-authority mutation decision: either a named gateway-whitelist operation or an exact supervisor-owned activation/control transition. Worker mode/generation eligibility also comes only from S6 activation authority. Before S6, tests may construct repository fixtures but no runtime path may issue launch authority or acquire a target worker lease. |
| Configuration generation, validation, effective route identity and runtime-route projection | S4 | S4 consumes the S1 integrity key and cannot create, rotate, replace, or repair it. Package-local supervisor is the sole runtime-route projection writer; worker submits fenced observations; plugin is read-only. Mutable production route-projection writes consume the S6 canonical protected-write predicate and remain fail-closed before S6. S5 candidate failures cannot mutate S4 route authority. |
| Queue/job/candidate/provenance transitions | S5 | S5 consumes the S6 canonical `production_write_authorized` interface and cannot define a weaker local predicate. Authority-loss recovery is a non-semantic maintenance path. |
| Package activation, gateway whitelist, handshake and production write authority | S6 | S6 is the sole owner of activation state/handshake truth and the only provider of production-write authorization to S5. |
| Published-channel validation and support evidence | S7 | Validation records observe S1–S6 authority; they never create or repair authority by assertion. |
| Benchmark evidence | S8 | Benchmark records may raise separately defined assurance only; they never write package/process/configuration/route/queue/activation or delivery-state authority. |

When a local slice summary conflicts with the imported frozen contract or ownership matrix, the frozen contract and this matrix win. Fix the OpenSpec before implementation; do not resolve the conflict ad hoc in code.

## Existing Specification Supersession Map

New authority capabilities do not automatically override archived/current product specs. The following existing capabilities receive explicit deltas in the owning slice:

| Owning slice | Existing capability | Superseded or extended contract |
| --- | --- | --- |
| S4 | `experience-learning-quality` | capability-specific profile/validation/assurance/health and prohibition on silent rule-authored production semantic fallback |
| S5 | `experience-candidate-distillation` | generic “any distillation failure increments candidate retry” is replaced by system-attempt/interruption/content-retry separation; only content retry exhaustion discards |
| S5 | `experience-intervention-governance` | custom-origin shadow-only cap overrides existing diagnostic-live/conservative delivery paths while evaluated-origin paths remain intact |
| S6 | `openclaw-experience-plugin` | plugin service lifecycle calls package-local supervisor; interaction/producer behavior remains distinct from full learning activation |
| S6 | `cli-user-experience-surface` | status/doctor add orthogonal activation, quality, health, capability, blocked queue, and value projections |
| S7 | `agent-adapter-installation` | installation/doctor support becomes channel-specific and actual-artifact evidence-bound |
| S7 | `openclaw-experience-plugin` | full-learning support claim requires installed artifact closure and live activation for that exact channel/version |
| S8 | `openclaw-scenario-evaluation` | publishable efficacy uses sealed matched treatment/forced-holdout/no-EE blocks; existing diagnostic scenario runs remain separately labeled |

No existing requirement may continue to drive runtime behavior when an explicit delta above changes it. Capabilities not listed here are not silently superseded by the new changes.

## Review Rules

Each slice review must answer four questions:

1. **Boundary:** Does the change own one coherent capability and avoid importing later-slice behavior?
2. **Dependency:** Does it explicitly name its prerequisite changes and keep later behavior disabled or fail-closed?
3. **Invariant:** Does every requirement preserve the frozen cross-contract authority, retry, provenance, and activation rules?
4. **Gate:** Are the validation commands and evidence needed to accept the slice executable and unambiguous?

A review may reject a slice for an implementation-level omission that makes the capability unverifiable. It should not reopen already frozen product semantics unless it demonstrates a material contradiction affecting writer ownership, split-brain/fencing safety, retry-counter consumption, activation truth, production protected-write eligibility, or benchmark statistical eligibility.

## Implementation Sequence And Gate Discipline

For each slice:

1. Approve its proposal, design, tasks, and delta spec under strict OpenSpec validation.
2. Implement only that slice and its tests.
3. Run focused tests first, then typecheck, full tests, and build when shared runtime/storage behavior is touched.
4. Record source-repo evidence without calling the capability supported.
5. Accept the slice only when its own gate passes and every earlier accepted invariant remains green.
6. Begin the next implementation slice only after the current slice has a clean review boundary.

S6 is the earliest slice that may make production activation logically possible. S7 is the earliest slice that may prove the canonical published path. Public support claims remain prohibited until S7 clean-home and live-host evidence pass.

## OpenSpec Artifacts

The following change directories are created by this slicing pass:

```text
openspec/changes/establish-runtime-package-home-identity
openspec/changes/add-runtime-schema-migration-authority
openspec/changes/add-runtime-process-authority
openspec/changes/add-runtime-configuration-route-authority
openspec/changes/add-fenced-learning-queue-semantics
openspec/changes/add-openclaw-production-activation
openspec/changes/validate-published-runtime-closure
openspec/changes/add-matched-block-benchmark-evidence
```

Their task lists remain unchecked until implementation begins. Creation and strict validation of these artifacts approve only the implementation plan, not runtime behavior.

## Slicing Completion Record

- All eight change-local strict validations passed.
- Repository-wide strict validation passed for all 53 active OpenSpec changes.
- The slicing artifacts contain no unresolved placeholder markers, Windows absolute paths, unmatched code fences, or trailing whitespace.
- `git diff --check` passed; the pre-existing LF-to-CRLF warning for `docs/product-ux-improvement-checklist.md` remains non-failing.
- No runtime source, runtime tests, build output, public support claim, or published artifact was changed or validated in this slicing pass.
- The independent slicing review initially found nine implementation-contract gaps and closed them through normative imports, ownership boundaries, physically complete bootstrap schema requirements, fail-closed dependency interfaces, exact mechanical tables, and existing-spec deltas. See `docs/phase-0.5a.1-openspec-slicing-review-2026-07-11.md`.
- Historical review approval originally permitted implementation to begin with S1 only. Current progress is recorded in the status table above: S1-S8 implementation gates are complete. S8 completion proves the benchmark machinery and one real three-arm pilot, not publishable efficacy; the sealed five-repetition threshold was not met, so public benchmark/support claims remain prohibited.
