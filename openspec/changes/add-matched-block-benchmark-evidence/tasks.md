## 1. Manifest And Attempt Schema

- [x] 1.1 Materialize the imported statistical units, event aggregation, scorecard, ground truth, three-arm set, manifest, preflight, formal-attempt, failure-code, disposition, exclusion, replacement, instrumentation, and publication tables as typed exhaustive fixtures/constants.
- [x] 1.2 Add immutable block, arm, scenario, fixture, ground-truth, runtime-version, and instrumentation manifest types/storage.
- [x] 1.3 Add distinct preflight and formal-attempt records.
- [x] 1.4 Enforce unique formal `(block_id, arm)` attempts.
- [x] 1.5 Add disposition and replacement-lineage records without destructive overwrite.

### Task 1 Source Evidence

- `src/evaluation/matched-block/constants.ts`, `types.ts`, and `contract.ts` mechanically encode the frozen statistical units, harm-first event aggregation, exact three-arm set, 3x3 confusion-matrix cells, minimum public scorecard, every stable `BENCH_*` code, every block disposition, exact manifest/attempt/publication field sets, and strict canonical digest validation.
- `MatchedBlockBenchmarkStore` owns a dedicated campaign SQLite database containing only `benchmark_*` tables. It never opens or creates the canonical ExperienceEngine runtime authority database and explicitly rejects runtime-authority table contamination.
- Campaign, scenario, fixture, ground-truth, runtime, instrumentation, sealed block, arm plan, publication plan, disposition, decision, and replacement records are immutable inserts. A sealed block and its exact three arm plans are inserted transactionally after cross-manifest digest/reference validation.
- Preflight records are append-only and retryable only before formal start. Atomic formal insertion consumes the unique `(block_id, arm)` slot at revision one; one CAS-governed revision-two transition terminalizes it, and no later preflight or second formal attempt is accepted.
- Focused tests prove exhaustive constants, digest drift rejection, correct-skip plausibility, harm-first aggregation, dedicated database ownership, preflight/formal separation, formal uniqueness/CAS, immutable disposition/replacement lineage, and sealed publication plan/decision records.
- At the Task 1 acceptance boundary, this foundation did not execute benchmark arms or produce efficacy evidence; Tasks 2-5 remained open and `support_claim_allowed=false` remained required.

## 2. Harness Execution

- [x] 2.1 Seal manifests before formal execution.
- [x] 2.2 Run bounded preflight without creating efficacy attempts.
- [x] 2.3 Enforce forced holdout/control and declared arm order/seed rules.
- [x] 2.4 Apply identical timeout, resource, fixture reset, observer, and collection behavior across arms.
- [x] 2.5 Implement exact `treatment`, `forced_holdout`, and `no_ee` behavior, including would-have-delivered capture and external no-EE instrumentation.
- [x] 2.6 Make the atomic formal-attempt insertion the boundary immediately before task input release.

### Task 2 Source Evidence

- `arm-control.ts` freezes the three exact treatment differences, binds each arm plan to a canonical control digest, and deterministically derives a complete order from the sealed seed.
- `harness.ts` loads only an already sealed block, verifies every manifest/reference/control/order/isolation contract, runs bounded append-only preflight, and refuses any block whose formal slot is already consumed.
- Fixture reset, timeout/resource/network policy, observer identity, transcript adapter, scorer identity, and collected metrics are all bound to the same sealed instrumentation/execution contract for every arm.
- `treatment` requires EE decision and normal delivery semantics; `forced_holdout` requires the full decision pipeline plus would-have-delivered capture and unconditional zero delivery; `no_ee` rejects any EE runtime, decision, or delivery evidence.
- The harness synchronously inserts the revision-one formal attempt and makes task-input release the immediately following awaited operation. Any contamination after this boundary terminalizes the consumed attempt and cannot be retried under the same block id.
- Focused tests prove deterministic order, bounded preflight without formal consumption, three-arm execution order, arm-neutral collection, formal-start adjacency, holdout leakage rejection, no-EE isolation, and partial-rerun refusal.
- At the Task 2 acceptance boundary, no real matched campaign or efficacy score had run; Tasks 3-5 remained open and `support_claim_allowed=false` remained required.

## 3. Failure And Rerun Protocol

- [x] 3.1 Classify infrastructure failure, product failure, exclusion, abort, and valid completion with stable reasons.
- [x] 3.2 Preserve every formal attempt, including timeout and failure.
- [x] 3.3 Create replacement blocks with new ids and explicit original-block lineage.
- [x] 3.4 Prevent partial-arm reruns from entering efficacy scoring.
- [x] 3.5 Add fixtures proving task timeouts and EE runtime failures after valid start remain completed product outcomes when common infrastructure succeeds.
- [x] 3.6 Implement every stable `BENCH_*` infrastructure code and every frozen block disposition/exclusion field.

### Task 3 Source Evidence

- `failure-protocol.ts` deterministically classifies terminal attempts while retaining task timeout and EE provider/route/queue/activation/retrieval/delivery failures as completed product outcomes when common infrastructure succeeded.
- Block disposition requires all three terminal formal rows and applies stable priority across contamination, protocol defect, operator abort, infrastructure failure, and complete efficacy eligibility.
- The original attempts remain immutable under every disposition. Incomplete or invalid blocks are excluded as a whole from efficacy but remain in infrastructure accounting.
- Replacement creation requires a new block id and seed, preserves scenario/repository/task/corpus/host/model identity, increments replacement generation, creates all three new arm plans, and atomically commits replacement manifest, original superseded disposition, and lineage.
- A complete block cannot be replaced because its result is unfavorable or noisy, and Task 2 rejects partial arm reruns before new task release.
- Focused tests cover product failure eligibility, infrastructure exclusion, contamination, abort, incomplete blocks, atomic full replacement, retained attempts, and unfavorable-result rerun rejection.

## 4. Scoring And Publication

- [x] 4.1 Compute efficacy from complete eligible matched blocks only.
- [x] 4.2 Report coverage, infrastructure reliability, task success, old-mistake avoidance, inject/skip confusion matrix, helpful/harmful/neutral outcomes, and uncertainty.
- [x] 4.3 Predeclare repetition and publication thresholds.
- [x] 4.4 Generate an auditable public/private scorecard with negative and incomplete results retained.
- [x] 4.5 Implement harm-first intervention aggregation, correct-skip rules, confusion matrix, and the complete minimum public scorecard.
- [x] 4.6 Use within-block deltas and scenario/block clustering; report infrastructure reliability across every attempted arm including invalid/replaced blocks.
- [x] 4.7 Extend the OpenClaw scenario runner with sealed matched-block campaign mode while preserving existing non-efficacy diagnostic scenario runs as separately labeled evidence.
- [x] 4.8 Add real/deterministic OpenClaw fixtures for forced holdout suppression, no-EE isolation, formal start boundary, product-runtime failure retention, whole-block replacement, and complete-block scoring.

### Task 4 Source Evidence

- `scoring.ts` reads only immutable complete dispositions for efficacy, retains every attempted arm in infrastructure reliability, and refuses missing observations for any efficacy-eligible arm.
- The scorer emits the complete minimum scorecard, treatment/forced-holdout/no-EE pairwise deltas, the frozen 3×3 confusion matrix, scenario-cluster confidence intervals, complete/excluded block coverage, and explicit unavailable values for incomparable provider cost or token data.
- Publication decisions evaluate sealed repetition, coverage, reliability, negative-disclosure, and directional quality thresholds. Missing threshold metrics fail closed, and decisions are immutable campaign records.
- `openclaw-matched-block` is a separately labeled CLI target over the campaign DB plus external observation JSON. It records that historical single-arm diagnostic evidence was not reused.
- Focused tests cover paired scoring, unavailable metrics, original/replacement reliability accounting, incomplete campaigns, immutable decisions, and CLI routing.
- Real OpenClaw pilot v3 used the exact independently downloaded ClawHub `0.5.1` artifact (`sha256:01f6f17005d2edb4db5a0358e284799818fd4cab977fb16604cc5ddaa5eed692`) with three isolated OpenClaw local-host arms.
- All 15 bounded preflight records passed. Three formal attempts terminalized at revision two and the block disposition is `complete`.
- Treatment persisted one `inject` event with `delivery_mode=live` and `delivered=1`. Forced holdout persisted the same seeded-node `inject` decision with `delivery_mode=holdout` and `delivered=0`. No-EE contained no ExperienceEngine plugin, extension, database, decision, or delivery evidence.
- Independent validation proved every formal task file was created after its revision-one attempt insertion, with observed release deltas of approximately 4.6–7.7 ms, and matched the sealed task-input digest.
- Deterministic fixtures retain post-start product failures as completed product outcomes and enforce atomic whole-block replacement. The real complete block was scored independently through both the API and actual `ee evaluate openclaw-matched-block` CLI with the same evidence digest `547e38f09e7c0ca732b3d9522116f33248fbf4fe6ce2fe8`.
- Earlier v1/v2 pilot strata remain preserved as negative/defective protocol evidence and are not pooled with v3: v1 exposed scope-root drift; v2 exposed canonical OpenClaw session-key adapter drift.
- The v3 scorecard has complete-block coverage `1.0` and infrastructure reliability `1.0`, but the sealed plan requires five complete repetitions per scenario. With one block, the immutable decision is correctly `not_publishable`; `support_claim_allowed=false` and `production_learning_ready=false` remain required.
- Real OpenClaw campaign v4 created a new immutable protocol stratum rather than appending to v1-v3. It sealed all five block manifests and all fifteen arm plans before the first formal task release.
- V4 passed `75/75` bounded preflight records, terminalized `15/15` formal attempts at revision two, and produced five `complete` block dispositions with no exclusion, replacement, or infrastructure failure.
- Treatment delivered the seeded node in all five blocks. Forced holdout retained the same inject decision with zero delivery in all five blocks. No-EE remained free of ExperienceEngine plugin, extension, database, decision, and delivery evidence in all five blocks.
- Independent validation verified every block/arm runtime artifact, formal-start boundary, session binding, injection record, and no-EE isolation, then deterministically recomputed the persisted campaign scorecard and publication decision.
- The public `ee evaluate openclaw-matched-block` path remained fail closed without negative-result disclosure and reproduced the persisted `publishable` decision only with explicit `--negative-results-disclosed`. The common scorecard evidence digest is `17b60c1314e4d62e5ec7d5b420bc335b8fdb246133c135ebf2b5f4cb3f8c0d7c`.
- All sealed v4 thresholds passed: complete-block coverage `1.0`, infrastructure reliability `1.0`, five repetitions, harmful rate `0`, infrastructure failure rate `0`, and negative-result disclosure present. Treatment-minus-no-EE task-success and repeated-old-mistake-avoidance deltas are both `0.4`.
- V4 has one scenario cluster and unavailable confidence-interval bounds. Its `publishable` decision is therefore a disclosed directional single-scenario result, not a general cross-scenario efficacy, full-support, or production-readiness claim. `support_claim_allowed=false` and `production_learning_ready=false` remain mandatory.

## 5. Validation

- [x] 5.1 Run focused manifest, attempt uniqueness, failure, rerun, scoring, and publication tests.
- [x] 5.2 Run a deterministic matched-block pilot against the validated runtime artifact.
- [x] 5.3 Run TypeScript typecheck, relevant evaluation tests, full tests, and build.
- [x] 5.4 Run `pnpm exec openspec validate add-matched-block-benchmark-evidence --strict`.

### Task 5 Acceptance Evidence

- Focused matched-block contract, harness, failure/replacement, scoring/publication, and CLI tests passed. The final full repository suite passed `232` test files and `1451` tests.
- Both pilot scripts passed Node syntax validation. TypeScript typecheck and the production build passed.
- The real OpenClaw v3 pilot and repeated v4 campaign ran against the independently downloaded ClawHub `0.5.1` artifact and passed their independent validators. Their accepted evidence is non-authoritative benchmark evidence only; it did not mutate runtime package/process/configuration/route/queue/activation or delivery-state authority.
- The actual `ee evaluate openclaw-matched-block` CLI recomputed the same v4 campaign scorecard evidence digest as the independent validator when negative-result disclosure was supplied explicitly.
- Strict S8 OpenSpec validation and `git diff --check` passed.
- Runtime closure validation passed with unchanged digest `3c7aab519faa57d38000090d6c5b5506b3ae8e0a231d2e38e5f17717dac1096f` and package build id `build_16df7fdd54be7801c2430c49a4fef2612144e559da5e2cb92bc99d319f559077`.
- OpenClaw package-local production binding validation passed through activation, semantic completion, stale-output fencing rejection, and graceful supervisor/worker shutdown. It continued to report `production_learning_ready=false`.
- S8 implementation and evidence acceptance are complete. The retained v3 one-block publication decision remains `not_publishable`; the new v4 five-block decision is `publishable` under its sealed single-scenario thresholds. The one-cluster limitation is disclosed, and `support_claim_allowed=false` plus `production_learning_ready=false` remain mandatory.
