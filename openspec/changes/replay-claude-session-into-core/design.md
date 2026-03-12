# Design: Replay Claude Session Into Core

## Summary

Use the normalized Claude event and projection layers already in place, but persist adapter session state on disk between hook invocations.

## Session Store

The Claude adapter will store per-session JSON under the adapter state directory, including:

- latest prompt context
- accumulated tool results

## Replay Flow

On `SessionEnd`:

1. Load the stored Claude session state
2. Recreate the common lifecycle sequence inside one process:
   - `beforePromptBuild(promptContext)`
   - `persistToolResult(...)` for each stored tool result
   - `finalizeTask(promptContext)`
3. Remove the stored session state

This reuses the existing `ExperienceRuntimeService` without requiring a long-lived Claude process.

## Non-Goals

- Prompt injection back into Claude Code during this change
- Claude-specific MCP wiring
