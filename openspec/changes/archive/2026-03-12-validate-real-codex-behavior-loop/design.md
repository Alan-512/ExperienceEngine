# Design: Real Codex Behavior Validation

## Validation Model

Codex does not provide the same host lifecycle hooks as OpenClaw or Claude Code, so real validation will be driven by Codex itself calling the ExperienceEngine MCP tools inside a non-interactive Codex execution.

The validation sequence is:

1. Seed a temporary ExperienceEngine home with a matching strategy node
2. Install the Codex adapter so the live Codex host sees the `experienceengine` MCP server
3. Run a real Codex `exec` prompt that explicitly asks Codex to call:
   - `experienceengine_lookup_hints`
   - `experienceengine_record_tool_result`
   - `experienceengine_finalize_task`
4. Verify the temporary SQLite database records:
   - injected node ids
   - outcome signal
   - helped or harmed counter updates

## Scope Control

This validation is intentionally explicit and controlled. It proves the current Codex loop works in a real host without requiring any undocumented automatic callbacks.
