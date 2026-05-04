## 1. Schema Compatibility

- [x] 1.1 Add nullable `episode_id` to `task_runs`, `experience_input_records`, `outcome_records`, `injection_events`, `attribution_records`, and `review_events`
- [x] 1.2 Add indexes for each `episode_id` field
- [x] 1.3 Keep existing primary keys, foreign keys, and write ownership unchanged
- [x] 1.4 Update migrations for existing databases
- [x] 1.5 Run `pnpm vitest run tests/unit/sqlite-db.test.ts`

## 2. Runtime Propagation

- [x] 2.1 Generate a stable episode id before the first `beforePromptBuild` injection-event write for a task/session path
- [x] 2.2 Retain the episode id in session/runtime state through `finalizeTask`
- [x] 2.3 Propagate the episode id to task, input, outcome, injection, attribution, and review records
- [x] 2.4 Add tests proving new runtime-created evidence shares one episode id across pre-finalize injection and finalize writes
- [x] 2.5 Run `pnpm vitest run tests/unit/runtime-service.test.ts`

## 3. Episode Projection Repository

- [x] 3.1 Add episode projection domain types
- [x] 3.2 Create `src/store/sqlite/repositories/episode-repo.ts`
- [x] 3.3 Implement `getByEpisodeId(episodeId)`
- [x] 3.4 Implement `listRecentByScope(scopeId, limit)`
- [x] 3.5 Add tests for full, partial, old-row, and mixed-row projections
- [x] 3.6 Run `pnpm vitest run tests/unit/episode-repo.test.ts`

## 4. Projection-Aware Read Surfaces

- [x] 4.1 Add episode id to latest inspection data when available
- [x] 4.2 Use episode projection for richer inspection evidence when present
- [x] 4.3 Preserve fallback reads when `episode_id` is missing
- [x] 4.4 Use projection in hybrid capsule/evidence construction where available
- [x] 4.5 Run `pnpm vitest run tests/unit/interaction-service.test.ts tests/unit/hybrid/capsule-builder.test.ts`

## 5. Validation

- [x] 5.1 Run targeted unit tests for schema, runtime, repository, inspection, and hybrid evidence
- [x] 5.2 Run `pnpm typecheck`
- [x] 5.3 Run `openspec validate --changes --strict`
