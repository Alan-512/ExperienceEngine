## Why

The repository now proves real second-turn conservative injection for a matching task family, but it does not yet prove the negative boundary: a real task from a different task family in the same scope should skip injection. Without a real negative-control validation, the current trigger tuning could drift toward over-injection.

## What Changes

- Validate that a real follow-up task from a different task family does not inject prior hints.
- Promote a sanitized real negative-control payload sequence into the fixture corpus.
- Extend replay coverage so skip behavior is exercised against a real OpenClaw payload shape.

## Capabilities

### Modified Capabilities
- `openclaw-experience-plugin`: Add a real-runtime negative-control requirement for conservative hint injection.

## Impact

- Affects `openspec/specs/openclaw-experience-plugin/spec.md`
- Affects real-runtime fixtures under `tests/fixtures/openclaw/`
- Affects replay assertions for skip behavior
