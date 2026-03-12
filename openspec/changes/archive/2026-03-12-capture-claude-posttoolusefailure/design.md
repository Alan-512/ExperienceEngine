## Design Summary

Claude's real runtime emits a separate failure hook event instead of overloading `PostToolUse`. The adapter should treat that event as a failed tool result and feed it into the same session store / finalization path already used for successful tool runs.

## Resolution Strategy

1. Add `PostToolUseFailure` to the installed Claude hook configuration and doctor checks.
2. Update the Claude hook normalizer to:
   - recognize `PostToolUseFailure`
   - default its normalized status to `failure`
3. Update projection so `PostToolUseFailure` becomes a `HostToolResult`.
4. Add unit coverage for install/doctor/normalization/projection.

## Scope Control

This change only captures the failure event. It does not change policy, ranking, or success-path behavior.
