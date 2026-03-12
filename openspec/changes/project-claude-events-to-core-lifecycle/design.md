# Design: Project Claude Events To Core Lifecycle

## Summary

Use the normalized Claude event shape as the adapter boundary and project it into the existing host-agnostic lifecycle objects:

- `HostPromptContext`
- `HostToolResult`

## Projection Rules

- `UserPromptSubmit` becomes a `HostPromptContext`
- `PostToolUse` becomes a `HostToolResult`
- `SessionEnd` resolves to the most recent remembered prompt context for that session

Pre-tool events are still useful as normalized captures, but they do not need to produce a core lifecycle object in this change.

## Session State

The Claude adapter will keep a lightweight in-memory map of latest prompt context by session id. This enables later `SessionEnd` events to finalize the right task context without relying on raw Claude payload shape.

## Non-Goals

- Running the full ExperienceRuntimeService from the Claude hook command
- Persisting Claude tool results into SQLite in this change
