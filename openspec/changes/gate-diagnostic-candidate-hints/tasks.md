## 1. Diagnostic Candidate Pool

- [ ] 1.1 Add `listDiagnosticCandidatesByExactScope(scopeId)` to `src/store/sqlite/repositories/node-repo.ts`
- [ ] 1.2 Include only same-scope `candidate` nodes with `delivery_state = 'shadow_only'`
- [ ] 1.3 Exclude retired, quarantined, and cross-scope nodes
- [ ] 1.4 Add repository tests

## 2. Record-Only Diagnostic Evaluation

- [ ] 2.1 Include diagnostic candidates in runtime evaluation without prompt delivery
- [ ] 2.2 Add named scorecard/diagnostic metadata for record-only candidate ids, for example `recordOnlyDiagnosticCandidateIds`
- [ ] 2.3 Persist record-only diagnostic matches as `mode=skip`, `delivered=false`, and `injected_node_ids=[]`
- [ ] 2.4 Ensure `session.injectedNodeIds` stays empty for record-only diagnostic matches
- [ ] 2.5 Add runtime tests for record-only behavior

## 3. Live Diagnostic Gate

- [ ] 3.1 Add a pure diagnostic-safety predicate separate from existing `InjectionRiskLevel`
- [ ] 3.2 Gate live diagnostic hints on same scope, same task family, high match band, no negative evidence, no harm history, enough score, enough margin, and no destructive or irreversible action guidance
- [ ] 3.3 Add unit tests for each gate rejection reason, including diagnostic-unsafe guidance
- [ ] 3.4 Deliver at most one qualifying diagnostic candidate
- [ ] 3.5 Keep delivered diagnostic candidates in `inject_conservative` mode with `InterventionStrength=diagnostic_hint`
- [ ] 3.6 Assert diagnostic delivery does not promote, mutate `delivery_state`, or change usage/helped/harmed counters
- [ ] 3.7 Preserve existing second-opinion downgrade/skip behavior when enabled

## 4. Validation

- [ ] 4.1 Run `pnpm vitest run tests/unit/node-repo.test.ts tests/unit/candidate-retriever.test.ts tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts`
- [ ] 4.2 Run `pnpm typecheck`
- [ ] 4.3 Run `openspec validate --changes --strict`
