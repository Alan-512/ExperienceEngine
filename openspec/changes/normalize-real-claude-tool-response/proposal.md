## Why

Real Claude Code tool-session validation showed that ExperienceEngine captured `PreToolUse`, `PostToolUse`, and `SessionEnd`, but the persisted evidence still degraded to `Bash: unknown`. The live `PostToolUse` payload carries tool output under `tool_response.stdout/stderr` and does not always include an explicit `status`, so the current normalizer drops real evidence that the core runtime needs.

## What Changes

- Define the requirement that Claude `PostToolUse` normalization understands real `tool_response` payloads.
- Update the Claude hook normalizer to read `tool_response.stdout/stderr` and infer success/failure from the response shape when no explicit status is present.
- Promote a sanitized real Claude tool-session payload sequence into repository fixtures and replay coverage.

## Impact

- Real Claude tool runs persist meaningful evidence instead of `unknown`.
- Claude adapter validation now covers the same live payload shape seen in local runs.
