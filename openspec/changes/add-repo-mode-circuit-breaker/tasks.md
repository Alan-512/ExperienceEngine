## 1. Repo Policy Model

- [ ] 1.1 Define `RepoExperienceMode = "safe" | "fast_learning" | "strict"`
- [ ] 1.2 Define repo policy and circuit state domain types
- [ ] 1.3 Add SQLite repo policy table with scope id or repo id, configured mode, effective mode, circuit state, reason, and timestamps
- [ ] 1.4 Create `RepoPolicyRepository`
- [ ] 1.5 Add persistence/default tests

## 2. Policy Evaluator

- [ ] 2.1 Create `src/experience-management/repo-policy.ts`
- [ ] 2.2 Compute recent harmful intervention rate from attribution records
- [ ] 2.3 Fall back to injection event evidence when attribution records are missing
- [ ] 2.4 Implement deterministic downgrades from `fast_learning` to `safe`, `safe` to `strict`, and strict circuit hold
- [ ] 2.5 Add evaluator tests for thresholds, fallback, and no-evidence behavior

## 3. Runtime Integration

- [ ] 3.1 Apply repo policy to the diagnostic candidate gate
- [ ] 3.2 Keep `safe` equal to the Phase 3 gate
- [ ] 3.3 Let `fast_learning` relax only numeric/strength thresholds, never hard safety predicates
- [ ] 3.4 Let `strict` require highest-confidence match and suppress live diagnostics when the circuit is tripped
- [ ] 3.5 Assert disabled scope and quarantined/retired delivery states remain authoritative
- [ ] 3.6 Run `pnpm vitest run tests/unit/runtime-service.test.ts tests/unit/repo-policy.test.ts`

## 4. Inspect And Restore

- [ ] 4.1 Surface configured mode, effective mode, circuit state, reason, and timestamp in repo summary or config inspection
- [ ] 4.2 Add manual restore path through existing config or interaction command surface
- [ ] 4.3 Keep attribution and injection history unchanged during restore
- [ ] 4.4 Run `pnpm vitest run tests/unit/config-command.test.ts tests/unit/interaction-service.test.ts`

## 5. Validation

- [ ] 5.1 Run targeted unit tests for repo policy, runtime, config, and interaction surfaces
- [ ] 5.2 Run `pnpm typecheck`
- [ ] 5.3 Run `openspec validate --changes --strict`
