## Why

ExperienceEngine currently keeps ordinary `candidate` nodes in `shadow_only`, which is safe but can make first reuse feel silent: the system may learn from a task and still provide no guidance when the same bounded diagnostic situation appears again.

The revised refactor plan addresses this with diagnostic hints, but only under strict gates. The first slice should let same-scope candidates be evaluated without prompt delivery, then allow at most one live diagnostic hint when a separate diagnostic-safety predicate and a strong match gate both pass.

## What Changes

- Add a diagnostic candidate pool for same-scope `shadow_only` candidate nodes.
- Phase 3A: record diagnostic candidate matches without prompt delivery.
- Phase 3B: allow at most one live `diagnostic_hint` when the candidate is same-scope, same task family, diagnostic-safe, high-match, and has no harm or negative evidence.
- Keep cross-scope, weak-match, diagnostic-unsafe, harmed, quarantined, and retired candidates out of live prompt delivery.

## Capabilities

### Modified Capabilities

- `experience-intervention-governance`: Low-risk first reuse can be evaluated and eventually delivered as bounded diagnostic hints.
- `experience-learning-quality`: Candidate reuse validation gains a conservative first-reuse path without promoting candidates to active.

## Impact

- Affected code:
  - `src/store/sqlite/repositories/node-repo.ts`
  - `src/controller/candidate-retriever.ts`
  - `src/controller/intervention-controller.ts`
  - `src/runtime/service.ts`
  - `src/types/domain.ts`
- Affected tests:
  - `tests/unit/node-repo.test.ts`
  - `tests/unit/candidate-retriever.test.ts`
  - `tests/unit/intervention-controller.test.ts`
  - `tests/unit/runtime-service.test.ts`
