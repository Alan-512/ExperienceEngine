# Design: Normalize Claude Hook Events

## Summary

Introduce a Claude-specific event normalizer plus a lightweight event log writer.

Each raw hook invocation will still be captured as-is, but ExperienceEngine will also derive a normalized event with these stable fields:

- `adapter`
- `capturedAt`
- `sessionId`
- `eventName`
- `cwd`
- `promptText`
- `toolName`
- `toolInputSummary`
- `toolOutputSummary`
- `toolStatus`

The normalized event will be appended to a Claude adapter-owned `events.jsonl` file under the ExperienceEngine product home.

## Extraction Rules

- Prefer Claude-native field names when present
- Fall back across common string or nested-object candidates
- Avoid failing the hook command when the payload shape is incomplete; missing data becomes `undefined`

## Non-Goals

- Converting normalized Claude events into full `ExperienceInput`
- Running intervention logic during Claude hook execution
