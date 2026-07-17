## 1. Contract

- [x] 1.1 Add harm-exposure and recovery-recheck ground-truth requirements.
- [x] 1.2 Add authoritative harm and governance-transition observation evidence.
- [x] 1.3 Add supplemental harm-recovery campaign metrics.

## 2. Deterministic production-path fixture

- [x] 2.1 Seed an eligible harmful node through the existing repository path.
- [x] 2.2 Produce actual delivered harm through the runtime intervention path.
- [x] 2.3 Record harm through the existing feedback/attribution service.
- [x] 2.4 Verify production governance makes the node non-live.
- [x] 2.5 Verify a fresh equivalent opportunity does not redeliver the node.

## 3. Acceptance

- [x] 3.1 Reject direct state mutation and missing authoritative evidence.
- [x] 3.2 Reject reused sessions and repeated harmful delivery.
- [x] 3.3 Run focused tests, strict OpenSpec, typecheck, and build.

## Acceptance Evidence

- The existing production runtime test now proves actual conservative delivery, an automatic `strong_harmed` attribution bound to the injection, an automatic `mark_harmed` review event, a production transition to `quarantined`, and a fresh-session skip.
- Benchmark opportunity evidence requires `authority_source=production_runtime`, a transition evidence id, a valid transition digest, an authoritative harm evidence id, and explicit governance exclusion on recheck.
- Supplemental scorecard fields report harm-recovery opportunity count, success count, and rate without changing the frozen v1 minimum public scorecard.
- Repeated harmful delivery produces recovery failure, zero correct skip, and one false-positive injection.
- Focused C2 gate passed `2` files / `47` tests.
- Full repository gate passed `237` files / `1484` tests, TypeScript, build, runtime closure, OpenClaw production binding, strict C1/C2 OpenSpec, and diff checks.
- Runtime closure remained `1d3ef09ef3c718b3d7b331d02142c3630dce71421d693867d79e0eb841f2db16`; `production_learning_ready=false` remains unchanged.

