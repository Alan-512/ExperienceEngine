## Why

ExperienceEngine now has frozen intervention-governance behavior, explicit `InterventionStrength`, renderer policy language, and a strictly gated diagnostic candidate path. The next product gap is attribution visibility: the system can govern learned guidance, but operators cannot yet inspect a per-node record explaining whether a delivered or diagnostic intervention helped, harmed, remained neutral, or was unknown.

This change adds attribution records as an append-only evidence layer. It deliberately does not rewrite the existing feedback counters, delivery-state transitions, or review state machine.

## What Changes

- Add a durable `attribution_records` table and repository.
- Write one attribution record per selected node when an injection is resolved.
- Write record-only diagnostic attribution for Phase 3 diagnostic candidate matches without treating them as delivered interventions.
- Surface attribution records in inspection and evaluation summaries where useful.
- Preserve manual `helped` / `harmed` as an override path on top of automatic attribution.

## Capabilities

### Added Capabilities

- `experience-attribution-records`: Per-node attribution evidence can be recorded, inspected, and queried without changing lifecycle governance.

### Modified Capabilities

- `experience-intervention-governance`: Existing feedback and delivery-state governance gains attribution evidence, while the state machine remains source-compatible.

## Impact

- Affected code:
  - `src/types/domain.ts`
  - `src/store/sqlite/schema.sql`
  - `src/store/sqlite/db.ts`
  - `src/store/sqlite/migrations.ts`
  - `src/store/sqlite/repositories/attribution-record-repo.ts`
  - `src/runtime/service.ts`
  - `src/interaction/service.ts`
  - `src/evaluation/benchmark-summary.ts`
- Affected tests:
  - `tests/unit/sqlite-db.test.ts`
  - `tests/unit/attribution-record-repo.test.ts`
  - `tests/unit/runtime-service.test.ts`
  - `tests/unit/interaction-service.test.ts`
  - `tests/unit/inspect-command.test.ts`
  - `tests/unit/codex-mcp-server.test.ts`
