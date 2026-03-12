## Why

Real Claude Code failure validation revealed a missing adapter surface: when a Bash call fails, Claude emits `PostToolUseFailure`, not `PostToolUse`. ExperienceEngine currently does not install or normalize that hook, so real failed tool runs are invisible to the Claude adapter and harmed attribution cannot complete.

## What Changes

- Define support for Claude `PostToolUseFailure` as part of the adapter lifecycle.
- Install a `PostToolUseFailure` hook alongside the existing Claude hook set.
- Normalize `PostToolUseFailure` into a failed `HostToolResult`.
- Extend doctor/tests so the new hook is covered and regression-safe.

## Impact

- Unblocks real Claude harmed-attribution validation.
- Brings Claude failure handling closer to the real runtime behavior already observed locally.
