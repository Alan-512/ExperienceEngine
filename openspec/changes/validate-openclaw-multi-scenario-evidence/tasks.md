## 1. Runner architecture

- [x] 1.1 Extract common OpenClaw matched-block host/arm execution.
- [x] 1.2 Add sealed inject, correct-skip, and harm-recovery scenario adapters.
- [x] 1.3 Preserve the retained v1-v4 runner/evidence boundary.

## 2. Independent validation

- [x] 2.1 Validate complete arm sets, formal ordering, isolation, and no-EE absence.
- [x] 2.2 Validate correct-skip candidate/reason evidence.
- [x] 2.3 Validate delivered harm, authoritative feedback, governance transition, and fresh-session suppression.
- [x] 2.4 Recompute scorecard and evidence digests independently.

## 3. Real-host pilot

- [ ] 3.1 Seal a new campaign with one complete block per scenario.
- [ ] 3.2 Run exact published-artifact OpenClaw preflight and formal attempts.
- [ ] 3.3 Retain only non-sensitive evidence and clean copied authentication/runtime state.
- [ ] 3.4 Record exact limitations and keep support/readiness false.

## 4. Closeout

- [ ] 4.1 Run strict OpenSpec for all Phase 0.5C slices.
- [ ] 4.2 Run focused and full repository gates, closure, binding, and diff checks.
- [ ] 4.3 Update Phase 0.5C status and durable handoff.

## Implementation Evidence

- Common host execution, sealed scenario adapters, deterministic plan generation, and exact-key schema validation are implemented without mutating retained v1-v4 evidence.
- Formal execution consumes a previously sealed plan and rejects artifact, model, executable, Node, platform, or OpenClaw-version drift before campaign database creation.
- Independent validation requires the exact artifact and retained runtime, rejects duplicate or missing block/arm evidence, rebinds attribution/review identities to runtime SQLite evidence, and recomputes the scorecard and publication decision.
- Current-source local-pack real-host feedback validation proved user `mark_harmed`, `manual_override`, `strong_harmed`, quarantine, and fresh-session suppression while retaining `artifact_runtime_validated=false`, `support_claim_allowed=false`, and `production_learning_ready=false`.
- Submission-review hardening passed `5` focused files / `38` tests; the full repository gate passed `240` files / `1501` tests, TypeScript, production build, all three strict Phase 0.5C OpenSpec changes, runtime closure, OpenClaw production binding, and diff checks.
- Runtime closure remained `f5a88dfd14ba5e279badeeba9a644b7a8d0f616fa4d11a94803825ced94baa1f` with build id `build_16ad8bdc23633f6f9980161a00d66e58778d0b7f5ec2452964d23aa1a546a697`; `production_learning_ready=false` remains unchanged.
- Tasks 3.1-4.3 remain open until a new immutable published artifact is available and a fresh exact-artifact campaign completes.

