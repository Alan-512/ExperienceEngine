## Why

The repository now proves real runtime injection and real skip boundaries, but it still lacks a formal validation for node feedback attribution. Without a real runtime check for `usage_count`, `helped_count`, and `harmed_count`, the feedback loop remains only partially proven.

## What Changes

- Validate that a real injected successful turn increments node usage/helped counters.
- Validate that a real injected failed turn increments node usage/harmed counters.
- Record the acceptance criteria for real feedback attribution and keep the change scoped to persisted runtime state.

## Capabilities

### Modified Capabilities
- `openclaw-experience-plugin`: Add a real-runtime requirement for feedback attribution on injected turns.

## Impact

- Affects `openspec/specs/openclaw-experience-plugin/spec.md`
- Affects real-runtime validation evidence in the local OpenClaw development environment
- May later affect replay fixtures if a stable harmful-shape fixture is promoted
