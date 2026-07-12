## 1. Manifest And Attempt Schema

- [ ] 1.1 Materialize the imported statistical units, event aggregation, scorecard, ground truth, three-arm set, manifest, preflight, formal-attempt, failure-code, disposition, exclusion, replacement, instrumentation, and publication tables as typed exhaustive fixtures/constants.
- [ ] 1.2 Add immutable block, arm, scenario, fixture, ground-truth, runtime-version, and instrumentation manifest types/storage.
- [ ] 1.3 Add distinct preflight and formal-attempt records.
- [ ] 1.4 Enforce unique formal `(block_id, arm)` attempts.
- [ ] 1.5 Add disposition and replacement-lineage records without destructive overwrite.

## 2. Harness Execution

- [ ] 2.1 Seal manifests before formal execution.
- [ ] 2.2 Run bounded preflight without creating efficacy attempts.
- [ ] 2.3 Enforce forced holdout/control and declared arm order/seed rules.
- [ ] 2.4 Apply identical timeout, resource, fixture reset, observer, and collection behavior across arms.
- [ ] 2.5 Implement exact `treatment`, `forced_holdout`, and `no_ee` behavior, including would-have-delivered capture and external no-EE instrumentation.
- [ ] 2.6 Make the atomic formal-attempt insertion the boundary immediately before task input release.

## 3. Failure And Rerun Protocol

- [ ] 3.1 Classify infrastructure failure, product failure, exclusion, abort, and valid completion with stable reasons.
- [ ] 3.2 Preserve every formal attempt, including timeout and failure.
- [ ] 3.3 Create replacement blocks with new ids and explicit original-block lineage.
- [ ] 3.4 Prevent partial-arm reruns from entering efficacy scoring.
- [ ] 3.5 Add fixtures proving task timeouts and EE runtime failures after valid start remain completed product outcomes when common infrastructure succeeds.
- [ ] 3.6 Implement every stable `BENCH_*` infrastructure code and every frozen block disposition/exclusion field.

## 4. Scoring And Publication

- [ ] 4.1 Compute efficacy from complete eligible matched blocks only.
- [ ] 4.2 Report coverage, infrastructure reliability, task success, old-mistake avoidance, inject/skip confusion matrix, helpful/harmful/neutral outcomes, and uncertainty.
- [ ] 4.3 Predeclare repetition and publication thresholds.
- [ ] 4.4 Generate an auditable public/private scorecard with negative and incomplete results retained.
- [ ] 4.5 Implement harm-first intervention aggregation, correct-skip rules, confusion matrix, and the complete minimum public scorecard.
- [ ] 4.6 Use within-block deltas and scenario/block clustering; report infrastructure reliability across every attempted arm including invalid/replaced blocks.
- [ ] 4.7 Extend the OpenClaw scenario runner with sealed matched-block campaign mode while preserving existing non-efficacy diagnostic scenario runs as separately labeled evidence.
- [ ] 4.8 Add real/deterministic OpenClaw fixtures for forced holdout suppression, no-EE isolation, formal start boundary, product-runtime failure retention, whole-block replacement, and complete-block scoring.

## 5. Validation

- [ ] 5.1 Run focused manifest, attempt uniqueness, failure, rerun, scoring, and publication tests.
- [ ] 5.2 Run a deterministic matched-block pilot against the validated runtime artifact.
- [ ] 5.3 Run TypeScript typecheck, relevant evaluation tests, full tests, and build.
- [ ] 5.4 Run `pnpm exec openspec validate add-matched-block-benchmark-evidence --strict`.
