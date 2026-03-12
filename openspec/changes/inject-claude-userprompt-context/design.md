## Design Summary

The Claude adapter should follow the same high-level lifecycle as OpenClaw:

1. `UserPromptSubmit` builds a prompt context
2. ExperienceEngine decides whether to inject
3. Claude receives additional context immediately
4. The session remembers which node ids were injected
5. `SessionEnd` finalizes the task using the remembered prompt context and any accumulated tool results

## Resolution Strategy

1. Update the Claude hook command to call `ExperienceRuntimeService.beforePromptBuild()` during `UserPromptSubmit`.
2. Persist the resulting `injected_node_ids` into the stored Claude session prompt context.
3. Emit Claude hook output as JSON with `hookSpecificOutput.additionalContext` when ExperienceEngine chooses `inject` or `inject_conservative`.
4. Adjust the installed hook command to use `node --no-warnings` so experimental SQLite warnings do not corrupt hook output.
5. Add tests that seed a candidate node, replay `UserPromptSubmit`, assert returned hook output, and confirm the stored session carries injected node ids into finalization.

## Scope Control

This change only enables prompt-time intervention on Claude `UserPromptSubmit`. It does not attempt mid-run tool interception, inline tool blocking, or a Claude-specific UI.
