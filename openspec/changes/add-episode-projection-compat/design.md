## Context

This change depends on:

- `add-attribution-records`

Attribution records provide the first useful per-node evidence stream. Episode projection groups that evidence with the surrounding task, injection, outcome, and review records.

## Goals / Non-Goals

**Goals:**
- Add an `episode_id` compatibility field to new rows in relevant tables.
- Build a read projection over existing tables.
- Preserve old databases and rows without `episode_id`.
- Let inspection and evidence-building prefer episode projection when available.

**Non-Goals:**
- Replace existing repositories with an append-only ledger.
- Backfill all historical rows.
- Change existing primary keys or write ownership.
- Change node lifecycle or feedback semantics.
- Add console or team views.

## Decisions

### 1. Episode id is a compatibility key, not a new ledger

The change should add nullable `episode_id` fields and indexes while leaving current table ownership intact.

Rationale:
- The current system already works. This phase creates a coherent read model without increasing migration risk.

### 2. New writes should share one episode id

For new task paths, runtime should generate a stable episode id and propagate it to task runs, input records, outcome records, injection events, attribution records, and any compatible review linkage.

Rationale:
- A projection is only useful when new evidence can be grouped deterministically.
- Runtime currently writes injection events before task finalization. The episode id therefore needs to be created before the first injection event write and retained in session/runtime state through finalization.

### 3. Old data remains readable

Rows without `episode_id` should continue to work through existing inspection and learning paths. Projection-aware code must have a fallback.

Rationale:
- This is a compatibility layer, not a historical migration.

### 4. Projection is read-only reconstruction

`EpisodeRepository.getByEpisodeId` should reconstruct an episode from current tables. It should not become the write owner for those tables.

Rationale:
- Keeping write ownership unchanged reduces the chance of breaking task finalization and feedback governance.

## Risks / Trade-offs

- [Projection may be partial for old rows] -> Accept; fallback paths remain.
- [Episode id propagation can be missed in one write path] -> Add focused tests across runtime-created rows.
- [Temptation to migrate ledgers early] -> Keep this spec explicitly read-model only.

## Implementation Plan

1. Add nullable `episode_id` fields and indexes to relevant SQLite tables.
2. Add domain types for episode projection output.
3. Generate and propagate episode id through runtime task paths.
4. Implement `EpisodeRepository` read projection.
5. Use projection in inspection and hybrid evidence paths when present.
6. Add compatibility tests for old rows without episode ids and mixed rows.
