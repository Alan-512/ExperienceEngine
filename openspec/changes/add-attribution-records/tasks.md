## 1. Schema And Types

- [ ] 1.1 Add `AttributionVerdict` domain type with `strong_helped`, `weak_helped`, `neutral`, `unknown`, `weak_harmed`, and `strong_harmed`
- [ ] 1.2 Add `AttributionRecord` domain type linked to `injection_id`, `node_id`, optional `episode_id`, `InterventionStrength`, delivered status, outcome, verdict, confidence, evidence refs, optional user override, and timestamps
- [ ] 1.3 Add SQLite `attribution_records` table and indexes for injection id, node id, verdict, and optional episode id
- [ ] 1.4 Update database bootstrap and migrations
- [ ] 1.5 Run `pnpm vitest run tests/unit/sqlite-db.test.ts`

## 2. Repository

- [ ] 2.1 Create `src/store/sqlite/repositories/attribution-record-repo.ts`
- [ ] 2.2 Implement `upsert`, `listByInjectionId`, `listByNodeId`, and verdict/count queries needed by inspection and later policy
- [ ] 2.3 Ensure JSON evidence refs round-trip correctly
- [ ] 2.4 Add `tests/unit/attribution-record-repo.test.ts`
- [ ] 2.5 Run `pnpm vitest run tests/unit/attribution-record-repo.test.ts`

## 3. Runtime Attribution Writes

- [ ] 3.1 Write one attribution record per delivered selected node during `ExperienceRuntimeService.finalizeTask`
- [ ] 3.2 Use `unknown` or `neutral` when automatic evidence is insufficient
- [ ] 3.3 Write weak helped/harmed verdicts only when current outcome evidence is bounded and relevant
- [ ] 3.4 Write diagnostic record-only attribution for `recordOnlyDiagnosticCandidateIds`
- [ ] 3.5 Assert attribution writes do not mutate usage/helped/harmed counters or delivery state
- [ ] 3.6 Run `pnpm vitest run tests/unit/runtime-service.test.ts`

## 4. Inspection And Summaries

- [ ] 4.1 Extend latest inspection data with attribution records
- [ ] 4.2 Show verdict and confidence in `ee inspect --last --verbose`
- [ ] 4.3 Keep default inspect output concise and source-compatible
- [ ] 4.4 Update MCP or benchmark summaries only where they already expose comparable intervention detail
- [ ] 4.5 Run `pnpm vitest run tests/unit/inspect-command.test.ts tests/unit/interaction-service.test.ts tests/unit/codex-mcp-server.test.ts`

## 5. Validation

- [ ] 5.1 Run targeted unit tests for schema, repository, runtime, and inspection
- [ ] 5.2 Run `pnpm typecheck`
- [ ] 5.3 Run `openspec validate --changes --strict`
