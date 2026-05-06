## 1. Repo Policy Model

- [x] 1.1 Define `RepoExperienceMode = "safe" | "fast_learning" | "strict"`
- [x] 1.2 Define repo policy and circuit state domain types
- [x] 1.3 Add SQLite repo policy table with scope id or repo id, configured mode, effective mode, circuit state, reason, and timestamps
- [x] 1.4 Create `RepoPolicyRepository`
- [x] 1.5 Add persistence/default tests

## 2. Policy Evaluator

- [x] 2.1 Create `src/experience-management/repo-policy.ts`
- [x] 2.2 Compute recent harmful intervention rate from the latest 20 delivered or live-diagnostic attribution records for a repo/scope, requiring at least 5 eligible records before automatic downgrade
- [x] 2.3 Fall back to injection event evidence when attribution records are missing
- [x] 2.4 Treat a circuit breach as at least 2 `strong_harmed` records or at least 30% `weak_harmed` plus `strong_harmed` records in the eligible window
- [x] 2.5 Implement deterministic downgrades from `fast_learning` to `safe`, `safe` to `strict`, and strict circuit hold until manual restore
- [x] 2.6 Add evaluator tests for thresholds, fallback, no-evidence behavior, and manual-restore reset

## 3. Runtime Integration

- [x] 3.1 Apply repo policy to the diagnostic candidate gate
- [x] 3.2 Keep `safe` equal to the Phase 3 gate
- [x] 3.3 Let `fast_learning` relax only named numeric score/margin thresholds by one policy step from `safe`, never hard safety predicates
- [x] 3.4 Let `strict` require the strongest match band plus at least `safe` score/margin thresholds and suppress live diagnostics when the circuit is tripped
- [x] 3.5 Assert disabled scope and quarantined/retired delivery states remain authoritative
- [x] 3.6 Run `pnpm vitest run tests/unit/runtime-service.test.ts tests/unit/repo-policy.test.ts`

## 4. Inspect And Restore

- [x] 4.1 Surface configured mode, effective mode, circuit state, reason, and timestamp in repo summary or config inspection
- [x] 4.2 Add manual restore path through existing config or interaction command surface
- [x] 4.3 Keep attribution and injection history unchanged during restore
- [x] 4.4 Run `pnpm vitest run tests/unit/config-command.test.ts tests/unit/interaction-service.test.ts`

## 5. Validation

- [x] 5.1 Run targeted unit tests for repo policy, runtime, config, and interaction surfaces
- [x] 5.2 Run `pnpm typecheck`
- [x] 5.3 Run `openspec validate --changes --strict`
