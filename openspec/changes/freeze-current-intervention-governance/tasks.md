## 1. Controller Golden Tests

- [ ] 1.1 Add or extend tests for active nodes producing current `inject` behavior
- [ ] 1.2 Add or extend tests for `priority_candidate` / `conservative_only` producing current `inject_conservative` behavior
- [ ] 1.3 Add or extend tests proving ordinary `candidate` / `shadow_only` nodes are not live injected
- [ ] 1.4 Add or extend tests proving retired and quarantined nodes stay out of live injection

## 2. Repository And Evaluation-Mode Golden Tests

- [ ] 2.1 Freeze `listLiveInjectableByExactScope` behavior in `tests/unit/node-repo.test.ts`
- [ ] 2.2 Freeze `listShadowEligibleByExactScope` behavior in `tests/unit/node-repo.test.ts`
- [ ] 2.3 Freeze conservative cross-scope query behavior in `tests/unit/node-repo.test.ts`
- [ ] 2.4 Add runtime tests for current `live`, `shadow`, and `holdout` delivered flag and injected-node behavior

## 3. Scorecard And Host-Summary Golden Tests

- [ ] 3.1 Add runtime tests for current scorecard JSON fields and injected node ids
- [ ] 3.2 Add renderer tests for current generic and conservative prompt output
- [ ] 3.3 Add interaction or inspect tests for current scorecard explanations
- [ ] 3.4 Add Codex MCP summary tests for current action reason, trust summary, and retrieval notes

## 4. Validation

- [ ] 4.1 Run `pnpm vitest run tests/unit/intervention-controller.test.ts tests/unit/node-repo.test.ts tests/unit/injection-renderer.test.ts tests/unit/runtime-service.test.ts tests/unit/interaction-service.test.ts tests/unit/codex-mcp-server.test.ts`
- [ ] 4.2 Run `pnpm typecheck`
- [ ] 4.3 Run `openspec validate freeze-current-intervention-governance --strict`
- [ ] 4.4 Run `openspec validate --changes --strict`
