## Why

After fixing prompt contamination, real runtime validation showed that cleaned task summaries were persisted into `experience_input_records` but not into existing `experience_nodes`. The current node upsert path preserves feedback counters, but it also preserves stale `trigger_pattern` and other candidate-derived fields, which leaves polluted node metadata in place indefinitely.

## What Changes

- Refresh candidate-derived node metadata on `experience_nodes` upsert instead of only updating counters and timestamps.
- Keep feedback counters and lifecycle timestamps intact while allowing cleaned `trigger_pattern`, evidence summaries, and guidance fields to replace stale values.
- Add regression coverage proving an existing node can be refreshed with a cleaner `trigger_pattern` without losing usage/helped/harmed history.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `openclaw-experience-plugin`: Tighten experience persistence so refreshed nodes adopt the latest sanitized candidate metadata while preserving accumulated feedback counters.

## Impact

- Affects SQLite node upsert behavior in the plugin runtime.
- Affects how existing strategy/warning nodes recover from previously polluted trigger patterns.
- Affects regression coverage for node persistence and real-runtime validation evidence.
