## 0. Prerequisite

- [x] 0.1 Complete `freeze-current-intervention-governance`
- [x] 0.2 Confirm Phase 0 golden tests pass before editing domain or controller code

## 1. Domain Model

- [x] 1.1 Add `InterventionStrength` to `src/types/domain.ts`
- [x] 1.2 Add optional `interventionStrength` to intervention diagnostics and injection scorecards
- [x] 1.3 Confirm `DeliveryState`, `EvaluationMode`, and `InjectionMode` enums remain unchanged

## 2. Controller And Scorecard

- [x] 2.1 Add deterministic strength derivation in `src/controller/intervention-controller.ts`
- [x] 2.2 Preserve existing `InjectionMode` decisions and selected node ids
- [x] 2.3 Persist strength through `src/controller/injection-scorecard.ts`

## 3. Inspection And MCP Compatibility

- [x] 3.1 Surface strength in verbose inspect or structured scorecard summaries where appropriate
- [x] 3.2 Preserve existing scorecard fields for current CLI and MCP consumers

## 4. Validation

- [x] 4.1 Add unit tests proving existing injection modes do not change
- [x] 4.2 Add runtime tests proving scorecard JSON includes strength
- [x] 4.3 Run `pnpm vitest run tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts tests/unit/inspect-command.test.ts tests/unit/codex-mcp-server.test.ts`
- [x] 4.4 Run `pnpm typecheck`
