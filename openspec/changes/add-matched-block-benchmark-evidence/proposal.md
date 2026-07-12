## Why

ExperienceEngine needs product evidence that cannot be inflated by easy tasks, selective reruns, hidden instrumentation differences, or counting infrastructure failures as efficacy. Phase 0.5A.1 freezes immutable matched-block manifests, forced holdout, one formal attempt per block/arm, preflight separation, arm-neutral instrumentation, complete-block efficacy, replacement reruns, and publication thresholds.

This eighth slice depends on S1-S7 so benchmark runs observe the actual validated published runtime. It does not grant runtime authority or change delivery policy.

## What Changes

- Add immutable matched-block manifests with scenario identity, repository/task fixture, ground truth, arm assignment, seed, package/runtime versions, and instrumentation contract.
- Separate preflight attempts from formal efficacy attempts.
- Enforce at most one formal attempt for each `(block_id, arm)`.
- Require a forced holdout/control arm and arm-neutral instrumentation.
- Classify infrastructure failure, product failure, exclusion, abort, and completion without hiding failed attempts.
- Compute efficacy only from complete matched blocks while reporting coverage and infrastructure reliability separately.
- Replace invalid/rerun blocks with new block ids while preserving original attempts and disposition history.
- Gate public benchmark claims on predefined repetition, coverage, quality, and publication thresholds.

## Capabilities

### New Capabilities

- `matched-block-benchmark-evidence`: Immutable matched-block benchmark execution, statistical eligibility, failure/exclusion handling, replacement reruns, scoring, and publication governance.

### Modified Capabilities

- `openclaw-scenario-evaluation`: OpenClaw evaluation campaigns gain an immutable matched three-arm mode with forced holdout, no-EE control, one formal attempt per block/arm, external arm-neutral instrumentation, and complete-block efficacy.

## Impact

- Expected code areas: evaluation harnesses, scenario/fixture manifests, result storage, benchmark reports/summaries, host runners, artifact/version capture, CI/manual validation scripts, docs/case studies, and tests.
- Expected persisted artifacts: block manifest, arm attempt, preflight record, formal-attempt uniqueness, disposition, exclusion/replacement lineage, instrumentation manifest, scorecard, and publication decision.
- Dependencies: S1-S7.
- Runtime authority and delivery-state semantics are read-only inputs to this slice.
- Benchmark success cannot override `custom-shadow-only-v1` or create support claims beyond S7 evidence.
