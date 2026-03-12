## Design Summary

Claude Code's real `PostToolUse` payload shape differs from the defensive fallback shape already covered in tests:

- tool input is nested under `tool_input.command`
- tool output is nested under `tool_response.stdout` / `tool_response.stderr`
- success is implied by a present, non-interrupted `tool_response`, rather than an explicit `status`

The normalizer should treat these fields as first-class rather than letting the projection fall back to `unknown`.

## Resolution Strategy

1. Extend the hook normalizer to read `tool_response.stdout/stderr` when direct `tool_output` / `tool_result` strings are absent.
2. Infer `toolStatus` from `tool_response.interrupted` when explicit status fields are absent:
   - `interrupted: true` => `failure`
   - present `tool_response` and not interrupted => `success`
3. Promote one sanitized real Claude tool-session sequence into `tests/fixtures/claude-code/`.
4. Add regression coverage that replays the fixture through `processClaudeHookPayload` and asserts persisted `evidence_json`.

## Scope Control

This change does not add new runtime stages or change Claude install behavior. It only aligns normalized tool events with the real host payload already observed locally.
