## Context

The frozen evidence protocol uses matched multi-arm blocks rather than isolated demos. Each block holds comparable task conditions across arms, including a forced holdout/control arm. Formal efficacy must not be contaminated by setup retries or arm-specific instrumentation. Reruns replace whole blocks rather than erasing inconvenient attempts.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 12.1–12.11.

The implementation SHALL mechanically encode and test:

- statistical units and harm-first event outcome aggregation;
- the complete minimum public scorecard and ground-truth scenario schema;
- correct-skip rules and the three-by-three intervention confusion matrix;
- exactly three required arms: `treatment`, `forced_holdout`, and `no_ee`;
- forced-holdout execution of decision pipeline plus would-have-delivered capture with unconditional suppression;
- the complete sealed block manifest, arm plan, preflight record, formal attempt record, uniqueness and CAS rules;
- formal start boundary immediately before task input release;
- product-runtime versus benchmark-infrastructure failure classification, stable `BENCH_*` codes, block eligibility, dispositions, exclusion record, and replacement lineage;
- external arm-neutral instrumentation for all arms, including no-EE;
- within-block scoring, scenario/block clustering, complete-block efficacy, all-attempt reliability, and predeclared publication thresholds.

## Goals / Non-Goals

**Goals:**

- Predeclare immutable block and instrumentation manifests.
- Guarantee one formal attempt per block/arm.
- Separate preflight from efficacy attempts.
- Preserve infrastructure failures and original rerun history.
- Score only statistically eligible complete matched blocks.
- Publish balanced scorecards with coverage and reliability.

**Non-Goals:**

- Changing runtime activation, queue, route, or delivery authority.
- Treating benchmark assurance as provider validation or runtime health.
- Letting benchmark outcomes promote custom-origin nodes in v1.
- Using download count or handpicked case studies as efficacy evidence.
- Automatically deleting excluded or replaced attempts.

## Decisions

### 1. Seal the block before formal execution

The block manifest records scenario/ground truth, fixture and revision, task prompt, arm definitions, holdout, seed/order, package/host/model/config identifiers, timeout/resource rules, success/failure rubric, and instrumentation identity. Formal execution cannot mutate it.

### 2. Separate preflight namespace

Environment setup, credential checks, dependency install, and harness smoke belong to preflight records. They can retry under bounded policy but can never be converted into formal arm attempts.

### 3. Enforce one formal attempt per block and arm

The storage key `(block_id, arm)` is unique for formal attempts. A timeout, product failure, or infrastructure failure still consumes that formal slot and receives a disposition.

A task timeout after a valid formal start is normally a completed task outcome with `task_timeout = true`, not a harness timeout. Product provider/route/queue/activation/retrieval/delivery failures after valid arm start remain product-runtime outcomes when the common harness, host transcript, and scorer complete.

### 4. Require complete blocks for efficacy

Primary efficacy comparisons use only blocks whose required arms have statistically eligible completed outcomes under the frozen rules. Coverage and reasons for incomplete blocks are reported separately.

### 5. Preserve failures and replace blocks immutably

An invalid or rerun block is never overwritten. A replacement has a new block id and explicit lineage to the original. Original attempts remain visible in reliability and audit reports.

### 6. Keep instrumentation arm-neutral

Logging, timeout, resource limits, fixture reset, observers, and scoring collection must be identical across arms except for the declared treatment difference.

### 7. Predeclare publication thresholds

The benchmark plan states minimum repetitions, complete-block coverage, infrastructure reliability, helpfulness/avoidance/quality metrics, uncertainty reporting, and negative-result disclosure before results are known.

## Risks / Trade-offs

- [Risk] Strict completeness reduces sample size. → Mitigation: report coverage and run more sealed blocks rather than silently weakening eligibility.
- [Risk] Host/provider instability can dominate. → Mitigation: separate infrastructure reliability and use immutable replacement lineage.
- [Risk] Instrumentation can leak treatment. → Mitigation: sealed arm-neutral manifest and differential checks.
- [Risk] Reruns can bias results. → Mitigation: one formal attempt per block/arm and new replacement block ids.

## Acceptance Gate

- Tests cover manifest immutability, preflight/formal separation, uniqueness, forced holdout, arm-neutral instrumentation, disposition, complete-block scoring, replacement lineage, and publication gating.
- A deterministic pilot produces an auditable scorecard without mutating runtime authority.
- `pnpm exec openspec validate add-matched-block-benchmark-evidence --strict` passes.
