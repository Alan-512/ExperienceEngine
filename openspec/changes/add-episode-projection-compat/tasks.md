## 1. Schema Compatibility

- [ ] 1.1 Add nullable `episode_id` to `task_runs`, `experience_input_records`, `outcome_records`, `injection_events`, `attribution_records`, and `review_events`
- [ ] 1.2 Add indexes for each `episode_id` field
- [ ] 1.3 Keep existing primary keys, foreign keys, and write ownership unchanged
- [ ] 1.4 Update migrations for existing databases
- [ ] 1.5 Run `pnpm vitest run tests/unit/sqlite-db.test.ts`

## 2. Runtime Propagation

- [ ] 2.1 Generate a stable episode id before the first `beforePromptBuild` injection-event write for a task/session path
- [ ] 2.2 Retain the episode id in session/runtime state through `finalizeTask`
- [ ] 2.3 Propagate the episode id to task, input, outcome, injection, attribution, and review records
- [ ] 2.4 Add tests proving new runtime-created evidence shares one episode id across pre-finalize injection and finalize writes
- [ ] 2.5 Run `pnpm vitest run tests/unit/runtime-service.test.ts`

## 3. Episode Projection Repository

- [ ] 3.1 Add episode projection domain types
- [ ] 3.2 Create `src/store/sqlite/repositories/episode-repo.ts`
- [ ] 3.3 Implement `getByEpisodeId(episodeId)`
- [ ] 3.4 Implement `listRecentByScope(scopeId, limit)`
- [ ] 3.5 Add tests for full, partial, old-row, and mixed-row projections
- [ ] 3.6 Run `pnpm vitest run tests/unit/episode-repo.test.ts`

## 4. Projection-Aware Read Surfaces

- [ ] 4.1 Add episode id to latest inspection data when available
- [ ] 4.2 Use episode projection for richer inspection evidence when present
- [ ] 4.3 Preserve fallback reads when `episode_id` is missing
- [ ] 4.4 Use projection in hybrid capsule/evidence construction where available
- [ ] 4.5 Run `pnpm vitest run tests/unit/interaction-service.test.ts tests/unit/hybrid/capsule-builder.test.ts`

## 5. Validation

- [ ] 5.1 Run targeted unit tests for schema, runtime, repository, inspection, and hybrid evidence
- [ ] 5.2 Run `pnpm typecheck`
- [ ] 5.3 Run `openspec validate --changes --strict`
