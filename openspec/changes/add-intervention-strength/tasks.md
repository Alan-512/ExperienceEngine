## 0. Prerequisite

- [ ] 0.1 Complete `freeze-current-intervention-governance`
- [ ] 0.2 Confirm Phase 0 golden tests pass before editing domain or controller code

## 1. Domain Model

- [ ] 1.1 Add `InterventionStrength` to `src/types/domain.ts`
- [ ] 1.2 Add optional `interventionStrength` to intervention diagnostics and injection scorecards
- [ ] 1.3 Confirm `DeliveryState`, `EvaluationMode`, and `InjectionMode` enums remain unchanged

## 2. Controller And Scorecard

- [ ] 2.1 Add deterministic strength derivation in `src/controller/intervention-controller.ts`
- [ ] 2.2 Preserve existing `InjectionMode` decisions and selected node ids
- [ ] 2.3 Persist strength through `src/controller/injection-scorecard.ts`

## 3. Inspection And MCP Compatibility

- [ ] 3.1 Surface strength in verbose inspect or structured scorecard summaries where appropriate
- [ ] 3.2 Preserve existing scorecard fields for current CLI and MCP consumers

## 4. Validation

- [ ] 4.1 Add unit tests proving existing injection modes do not change
- [ ] 4.2 Add runtime tests proving scorecard JSON includes strength
- [ ] 4.3 Run `pnpm vitest run tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts tests/unit/inspect-command.test.ts tests/unit/codex-mcp-server.test.ts`
- [ ] 4.4 Run `pnpm typecheck`
