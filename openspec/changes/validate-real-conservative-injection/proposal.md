## Why

The repository now validates real OpenClaw tool persistence and experience-node creation, but it has not yet proven that a later similar real task will trigger conservative hint injection inside the host runtime. Until that second-turn behavior is validated against the real gateway, the core product claim remains only partially proven.

## What Changes

- Validate that a real follow-up task in the same scope and task family triggers conservative injection.
- Promote at least one real runtime payload sequence into the canonical fixture corpus after sanitization.
- Record the acceptance criteria for real injection verification so future regressions can be checked explicitly.

## Capabilities

### Modified Capabilities
- `openclaw-experience-plugin`: Add an explicit real-runtime validation requirement for second-turn conservative injection and real payload promotion.

## Impact

- Affects `openspec/specs/openclaw-experience-plugin/spec.md`
- Affects runtime capture assets under `tests/fixtures/openclaw/`
- Affects integration validation against a local OpenClaw development runtime
