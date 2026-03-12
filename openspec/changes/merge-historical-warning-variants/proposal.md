## Why

The runtime and repository fixes stop new warning pollution, but the real OpenClaw SQLite state still contains legacy `read/process` warning variants that fragment support counts and clutter candidate retrieval. Those historical duplicates should be merged into the canonical warning node and retired so the live database reflects the current model behavior.

## What Changes

- Add a repeatable maintenance script that merges legacy warning variants into the canonical warning node for each scope/task family.
- Preserve and aggregate feedback counters on the canonical warning node while retiring duplicate legacy variants.
- Add regression coverage for duplicate-warning cleanup and verify the real OpenClaw SQLite state is repaired.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `openclaw-experience-plugin`: Extend experience persistence maintenance so historical warning variants can be normalized into the canonical warning node without losing accumulated counters.

## Impact

- Affects maintenance workflows against the SQLite backing store.
- Affects the live OpenClaw development database by retiring stale duplicate warning nodes.
- Affects regression coverage for warning-node hygiene and duplicate retirement.
