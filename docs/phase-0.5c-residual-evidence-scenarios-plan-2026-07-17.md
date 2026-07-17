# Phase 0.5C Residual Evidence Scenarios Plan

Date: `2026-07-17`

Status: C1 and C2 accepted; C3 runner/validator and local-pack feedback preflight complete; exact published-artifact campaign blocked on a new immutable release

## 1. Current Evidence Boundary

The accepted v4 OpenClaw campaign proves five complete matched three-arm blocks for one deterministic inject scenario. It does not provide:

- a valid correct-skip denominator;
- a false-positive injection measurement;
- a harm-recovery sequence;
- more than one scenario cluster;
- confidence-interval bounds across scenario clusters.

The existing v1 benchmark contract already defines skip labels, plausible distractors, the 3x3 confusion matrix, complete blocks, arm isolation, and publication governance. The remaining gap is not a second benchmark system. It is a versioned extension that records every decision opportunity inside a task trial and can represent a causal harm-recovery sequence.

## 2. Non-Negotiable Compatibility Boundary

1. Retained v1-v4 campaign databases and observations remain immutable.
2. Existing `matched-block-benchmark-v1` manifests and single-opportunity observations remain readable and score identically.
3. New sequence evidence uses a new protocol stratum and versioned observation/ground-truth contracts.
4. Runtime activation, queue, route, delivery, feedback, quarantine, and node-governance authority remain owned by the production runtime.
5. Benchmark code may observe and verify production transitions but may not write lifecycle state directly.
6. Every real repetition remains one complete `treatment` / `forced_holdout` / `no_ee` block.
7. `support_claim_allowed=false` and `production_learning_ready=false` remain unchanged.

## 3. Decision-Opportunity Evidence V2

One task trial may contain one or more predeclared decision opportunities. Each opportunity records:

- stable opportunity id and ordinal;
- actual decision (`inject`, `conservative`, or `skip`);
- would-have-delivered and delivered state;
- selected, rejected, and considered candidate ids;
- stable skip reason code;
- task-success result for the opportunity;
- whether skipped guidance was later shown to be required;
- delivered intervention outcome counts;
- optional authoritative harm/governance transition evidence;
- immutable evidence digest.

Arm-level aggregate counts must exactly equal the sum of opportunity records. Legacy v1 observations are interpreted as one opportunity only when the ground truth is also v1.

## 4. Correct-Skip Contract

A treatment opportunity counts as a correct skip only when all of the following are true:

1. Ground truth is predeclared as `expected_action=skip`.
2. At least one plausible candidate or distractor is declared.
3. At least one declared plausible id appears in considered, selected, or rejected candidate evidence.
4. The decision is `skip` and delivered count is zero.
5. A non-empty stable skip/rejection reason is recorded.
6. The deterministic task check succeeds.
7. Evidence does not show that the skipped guidance was required to avoid the known failure.

An empty retrieval, missing scorecard, or unbound session is not a correct skip. It is incomplete or incomparable instrumentation.

False-positive injection is any delivered treatment intervention on a skip-labeled opportunity. A forced-holdout would-have-delivered decision is reported separately and does not count as delivered false-positive harm.

## 5. Harm-Recovery Contract

The first harm-recovery protocol uses a two-opportunity sequence:

1. `harm_exposure`
   - a sealed active node is applicable;
   - treatment delivers the node;
   - the deterministic task outcome proves the guidance was harmful;
   - authoritative production feedback/attribution records the harm;
   - the node transitions through the production governance path to a non-live delivery state.
2. `recovery_recheck`
   - the same task family is presented in a fresh host session;
   - the implicated node remains a plausible candidate;
   - treatment must not deliver the harmful node;
   - the skip/rejection reason and post-harm delivery state are observed;
   - the correct task completes without the old harmful path.

The forced-holdout arm runs the same decision pipeline but suppresses delivery. It does not receive synthetic harmed evidence for a non-delivered event. The no-EE arm contains no ExperienceEngine runtime evidence. State divergence caused by actual treatment delivery is an intended causal outcome and must be recorded, not normalized away.

The benchmark harness must invoke host/runtime feedback APIs or commands. Direct SQL updates of harmed counters, lifecycle state, or delivery state invalidate the block.

## 6. Scoring Changes

The v2 scorer shall:

- use the sum of treatment decision opportunities as the delivery-rate denominator;
- populate the confusion matrix per treatment opportunity rather than per block;
- compute correct-skip and false-positive rates from skip-labeled opportunity evidence;
- preserve task-trial pairwise deltas at the block level;
- expose supplemental harm-recovery counts and rate without changing the frozen v1 minimum public scorecard;
- keep unavailable fields explicitly `null`;
- keep v1 single-opportunity scorecard digests stable for the same input.

Supplemental v2 output:

```text
harm_recovery_opportunity_count
harm_recovery_success_count
harm_recovery_rate
correct_skip_evidence_coverage
```

## 7. Scenario Set

The first multi-scenario campaign contains three scenario classes:

1. Existing inject scenario.
2. Correct-skip scenario with an intentionally tempting but inapplicable sealed node.
3. Harm-recovery sequence with actual harmful treatment delivery and production-governed suppression on recheck.

Infrastructure pilots may begin with one complete block per new scenario. Publishable cross-scenario claims still require a separately sealed repetition plan and sufficient scenario clusters.

## 8. OpenSpec Slices

### C1 — `add-benchmark-decision-opportunity-evidence`

- versioned ground-truth decision sequence;
- versioned arm observation evidence;
- strict aggregate validation;
- opportunity-level correct-skip/confusion scoring;
- v1 compatibility.

### C2 — `add-benchmark-harm-recovery-scenarios`

- harm-exposure and recovery-recheck invariants;
- authoritative feedback/governance evidence;
- supplemental harm-recovery scorecard;
- deterministic production-path fixtures.

### C3 — `validate-openclaw-multi-scenario-evidence`

- scenario adapters for inject, correct skip, and harm recovery;
- new sealed campaign/protocol stratum;
- independent runtime/session/candidate/governance validation;
- real OpenClaw pilot and evidence record;
- explicit claim limitations.

## 9. Acceptance Order

1. Strict validate all three OpenSpec slices.
2. Implement C1 and run focused contract/scoring tests.
3. Implement C2 and prove production-path harm/quarantine behavior without direct benchmark writes.
4. Implement C3 runner/validator adapters.
5. Run deterministic local fixtures.
6. Run a new real OpenClaw multi-scenario infrastructure pilot.
7. Run full TypeScript, tests, build, runtime closure, OpenClaw binding, strict OpenSpec, and diff checks.
8. Update durable evidence and phase status without changing support/readiness flags.

## 10. Exit Criteria

Phase 0.5C residual evidence is complete only when:

- correct-skip evidence cannot be produced from an empty retrieval;
- false-positive delivery is measured from skip-labeled opportunities;
- harm recovery uses actual delivered harm and the production governance path;
- v1-v4 evidence remains unchanged and readable;
- a new multi-scenario campaign completes independent validation;
- public wording states the exact scenario and repetition boundary.

## 11. Current Implementation Record

### C1 accepted

- `matched-block-benchmark-v1` and `matched-block-benchmark-v2` are accepted side by side.
- V2 ground truth seals one or more decision opportunities.
- V2 arm observations retain candidate consideration, stable skip reason, delivery, outcomes, task checks, and optional governance evidence.
- Opportunity arrays and arm aggregates are cross-validated and digest-bound.
- Delivery rate and confusion matrix use treatment decision opportunities.
- Empty retrieval does not count as correct skip.
- False-positive injection counts only actual treatment delivery on a skip label.
- Legacy v1 scorecard shape and one-opportunity semantics remain unchanged.

Validation:

- focused matched-block tests: `4` files / `34` tests passed;
- full repository tests: `237` files / `1482` tests passed;
- TypeScript, build, strict C1 OpenSpec, runtime closure, OpenClaw binding, and diff checks passed;
- runtime closure digest remained unchanged.

### C2 accepted

- Harm-recovery ground truth uses `harm_exposure` followed by `recovery_recheck`.
- Governance transition evidence is digest-bound and must declare `authority_source=production_runtime`.
- The runtime acceptance fixture proves actual delivered harm, automatic `strong_harmed` attribution, automatic `mark_harmed` review evidence, transition to `quarantined`, and a fresh-session skip.
- The scorer requires explicit governance exclusion for the implicated node on recheck.
- Supplemental report output includes opportunity count, success count, and recovery rate.
- Repeated harmful delivery remains visible as recovery failure plus false-positive injection.

Validation:

- focused C2 tests: `2` files / `47` tests passed;
- full repository tests: `237` files / `1484` tests passed;
- TypeScript, build, strict C1/C2 OpenSpec, runtime closure, OpenClaw binding, and diff checks passed;
- runtime closure digest remained unchanged and production readiness remained false.

### C3 source and local-pack validation complete

- Common OpenClaw host execution is separated from sealed inject, correct-skip, and harm-recovery adapters.
- Campaign plans use a new immutable campaign id/protocol stratum and reject unknown fields at plan, block, observation, opportunity, and governance-transition boundaries.
- Formal execution now consumes a previously sealed and independently validated plan rather than regenerating a plan at execution time.
- Before campaign database creation, execution verifies exact artifact filename, size, SHA-256, model identity, executable identity, Node version, platform, and OpenClaw version.
- Independent validation requires the exact artifact and retained runtime, rejects duplicate/missing arm evidence, verifies no-EE database absence, rebinds attribution and review identities to production SQLite evidence, and recomputes the scorecard/publication decision.
- A current-source local-pack real-host preflight proved same-session harmful feedback, `manual_override`, `strong_harmed`, user `mark_harmed`, quarantine, and fresh-session suppression.
- The local-pack exposure task succeeded, so that run is feedback compatibility/recovery evidence only; it is not formal harm-efficacy evidence and does not satisfy exact published-artifact C3 acceptance.

Validation before release preparation:

- focused multi-scenario and matched-block tests: `5` files / `38` tests passed after submission-review hardening;
- full repository gate: `240` files / `1501` tests passed;
- TypeScript, production build, all three strict Phase 0.5C OpenSpec changes, runtime closure, OpenClaw production binding, and diff checks passed;
- runtime closure remained `f5a88dfd14ba5e279badeeba9a644b7a8d0f616fa4d11a94803825ced94baa1f` with build id `build_16ad8bdc23633f6f9980161a00d66e58778d0b7f5ec2452964d23aa1a546a697`;
- `support_claim_allowed=false` and `production_learning_ready=false` remain unchanged.

### Still open

- publish a new immutable artifact containing the production feedback fallback;
- seal and independently validate a fresh campaign plan against that exact artifact;
- run the complete inject, correct-skip, and formal harm-recovery three-arm campaign;
- require the formal treatment harm fixture to produce deterministic task failure before accepting recovery evidence;
- independently validate the retained runtime and clean copied authentication/runtime state;
- complete Tasks 3.1-4.3 and Phase 0.5C closeout without changing support/readiness flags.

