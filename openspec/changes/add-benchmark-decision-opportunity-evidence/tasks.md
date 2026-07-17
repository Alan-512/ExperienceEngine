## 1. Versioned contracts

- [x] 1.1 Add v2 ground-truth decision-opportunity types and strict schema validation.
- [x] 1.2 Add v2 arm scoring observations with immutable opportunity evidence.
- [x] 1.3 Preserve v1 campaign and observation compatibility.

## 2. Scoring

- [x] 2.1 Validate aggregate counters against opportunity records.
- [x] 2.2 Compute delivery and confusion metrics per treatment opportunity.
- [x] 2.3 Compute evidence-backed correct-skip and false-positive rates.
- [x] 2.4 Keep task-trial pairwise deltas and unavailable fields unchanged.

## 3. Acceptance

- [x] 3.1 Add positive and negative contract/scoring tests.
- [x] 3.2 Prove empty retrieval cannot count as correct skip.
- [x] 3.3 Prove retained v1 scoring output remains unchanged.
- [x] 3.4 Run strict OpenSpec, focused tests, typecheck, and build.

## Acceptance Evidence

- V2 ground truth and arm observations enforce unique contiguous opportunity sets, exact digests, aggregate equality, and campaign/block protocol binding.
- Correct skip requires declared plausible-candidate consideration plus a stable allowed reason; empty retrieval produces zero correct-skip evidence coverage.
- Treatment delivery on a skip label increments false-positive injection; forced-holdout would-have-delivered evidence with zero delivery does not.
- V1 observations retain one-opportunity semantics and omit v2-only scorecard fields.
- Focused matched-block gate passed `4` files / `34` tests.
- Full repository gate passed `237` files / `1482` tests, TypeScript, production build, runtime closure, OpenClaw production binding, strict OpenSpec, and diff checks.
- Runtime closure remained `1d3ef09ef3c718b3d7b331d02142c3630dce71421d693867d79e0eb841f2db16`; `production_learning_ready=false` remains unchanged.

