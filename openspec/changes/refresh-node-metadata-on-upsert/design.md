## Context

ExperienceEngine already preserves feedback counters when a stable node id is refreshed, which prevents usage/helped/harmed history from being reset. Real runtime validation now shows a complementary problem: the SQLite upsert statement does not refresh candidate-derived fields such as `trigger_pattern`, so stale or polluted metadata survives even after newer sanitized candidates are generated.

## Goals / Non-Goals

**Goals:**
- Refresh candidate-derived node metadata when an existing node id is upserted.
- Preserve accumulated feedback counters and lifecycle timestamps during the refresh.
- Add regression coverage for metadata refresh on an existing node id.

**Non-Goals:**
- Recompute node ids or change the stable-id scheme.
- Migrate every historical node in bulk without a new candidate refresh.
- Change analyzer heuristics or node ranking behavior.

## Decisions

### Refresh descriptive fields during conflict updates

The SQLite upsert will update `trigger_pattern`, guidance text, evidence summary, and other candidate-derived descriptive fields on conflict. This keeps the node aligned with the latest sanitized candidate while preserving counters that are accumulated outside the analyzer.

Alternative considered:
- Preserve old descriptive fields forever: rejected because stale metadata prevents repaired summaries from taking effect.

### Keep counters and feedback timestamps authoritative

`usage_count`, `helped_count`, `harmed_count`, and their timestamps remain sourced from the existing node merge logic. The repository update only broadens which descriptive fields are refreshed; it does not change feedback ownership.

Alternative considered:
- Rebuild the whole node from the new candidate every time: rejected because it risks discarding runtime feedback history.

## Risks / Trade-offs

- [A bad new candidate can overwrite a previously better trigger pattern] → Keep refreshes scoped to stable node ids and rely on existing analyzer/storage gates.
- [Historical polluted nodes remain until touched again] → Accept for now; this change guarantees the next qualifying refresh repairs them.
- [The upsert SQL grows wider] → Cover the refresh path with integration assertions so regressions are easy to catch.
