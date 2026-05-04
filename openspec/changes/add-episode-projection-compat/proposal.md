## Why

ExperienceEngine stores task runs, input records, outcome records, injection events, review events, and attribution evidence in separate tables. That is acceptable for the write model, but operators and later policy code need a coherent read model for one host task.

This change adds an `episode_id` compatibility layer and episode projection. It keeps current tables as the facts and avoids a full ledger migration.

## What Changes

- Add nullable `episode_id` fields and indexes to current task/evidence tables.
- Generate and propagate an episode id for new task paths.
- Add an episode projection repository that reads across existing tables.
- Use the projection in inspection and evidence-building paths when available.
- Keep old rows without `episode_id` readable through existing fallback paths.

## Capabilities

### Added Capabilities

- `experience-episode-projection`: A completed host task can be inspected as a coherent episode without replacing the current persistence model.

### Modified Capabilities

- `experience-attribution-records`: Attribution records can optionally link to an episode id.
- `experience-intervention-governance`: Intervention and review evidence can be grouped by episode for inspection and future policy evaluation.

## Impact

- Affected code:
  - `src/types/domain.ts`
  - `src/store/sqlite/schema.sql`
  - `src/store/sqlite/migrations.ts`
  - `src/store/sqlite/repositories/episode-repo.ts`
  - `src/runtime/service.ts`
  - `src/interaction/service.ts`
  - `src/hybrid/capsule-builder.ts`
- Affected tests:
  - `tests/unit/sqlite-db.test.ts`
  - `tests/unit/episode-repo.test.ts`
  - `tests/unit/runtime-service.test.ts`
  - `tests/unit/interaction-service.test.ts`
  - `tests/unit/hybrid/capsule-builder.test.ts`
