## 1. Schema And Types

- [x] 1.1 Add `AttributionVerdict` domain type with `strong_helped`, `weak_helped`, `neutral`, `unknown`, `weak_harmed`, and `strong_harmed`
- [x] 1.2 Add `AttributionRecord` domain type linked to `injection_id`, `node_id`, optional `episode_id`, `InterventionStrength`, delivered status, outcome, verdict, confidence, evidence refs, optional user override, and timestamps
- [x] 1.3 Add SQLite `attribution_records` table and indexes for injection id, node id, verdict, and optional episode id
- [x] 1.4 Update database bootstrap and migrations
- [x] 1.5 Run `pnpm vitest run tests/unit/sqlite-db.test.ts`

## 2. Repository

- [x] 2.1 Create `src/store/sqlite/repositories/attribution-record-repo.ts`
- [x] 2.2 Implement append-only `insert` plus idempotent insert-by-record-id retry handling, `listByInjectionId`, `listByNodeId`, and verdict/count queries needed by inspection and later policy
- [x] 2.3 Ensure JSON evidence refs round-trip correctly
- [x] 2.4 Add `tests/unit/attribution-record-repo.test.ts`
- [x] 2.5 Run `pnpm vitest run tests/unit/attribution-record-repo.test.ts`

## 3. Runtime Attribution Writes

- [x] 3.1 Write one attribution record per delivered selected node during `ExperienceRuntimeService.finalizeTask`
- [x] 3.2 Use `unknown` or `neutral` when automatic evidence is insufficient
- [x] 3.3 Write weak helped/harmed verdicts only when current outcome evidence is bounded and relevant
- [x] 3.4 Write diagnostic record-only attribution for `recordOnlyDiagnosticCandidateIds`
- [x] 3.5 Assert attribution writes do not mutate usage/helped/harmed counters or delivery state
- [x] 3.6 Run `pnpm vitest run tests/unit/runtime-service.test.ts`

## 4. Manual Override Mirroring

- [x] 4.1 Mirror `feedbackLast` helped/harmed actions into attribution override evidence when the related injection/node can be resolved
- [x] 4.2 Mirror `feedbackNode` helped/harmed actions into attribution override evidence when no injection context exists, using a manual-override source and preserving existing review-event behavior
- [x] 4.3 Ensure override writes do not replace existing attribution rows; write a new append-only override record or an idempotent retry of the same override record
- [x] 4.4 Add interaction tests proving manual feedback still updates existing governance exactly as before and additionally appears in attribution inspection
- [x] 4.5 Run `pnpm vitest run tests/unit/interaction-service.test.ts`

## 5. Inspection And Summaries

- [x] 5.1 Extend latest inspection data with attribution records
- [x] 5.2 Show verdict and confidence in `ee inspect --last --verbose`
- [x] 5.3 Keep default inspect output concise and source-compatible
- [x] 5.4 Update MCP or benchmark summaries only where they already expose comparable intervention detail
- [x] 5.5 Run `pnpm vitest run tests/unit/inspect-command.test.ts tests/unit/interaction-service.test.ts tests/unit/codex-mcp-server.test.ts`

## 6. Validation

- [x] 6.1 Run targeted unit tests for schema, repository, runtime, manual feedback override, and inspection
- [x] 6.2 Run `pnpm typecheck`
- [x] 6.3 Run `openspec validate --changes --strict`
