# Design: Codex App Windows lifecycle wiring

## Problem Statement

ExperienceEngine currently has a strong Codex core path through the Codex MCP server and the `ee codex exec` wrapper. The failing Codex App symptoms come from project-level wiring that crosses host boundaries incorrectly: Claude Code hook commands are being placed under `.codex/hooks.json`, and Linux/WSL paths can be written into Codex App config that is executed by a Windows runtime.

The fix should make invalid wiring impossible to generate, easy to diagnose, and safe to repair.

## Architecture

### Runtime Boundaries

Codex integration should be modeled as three separate surfaces:

1. **Codex CLI wrapper**
   - Owns deterministic before/after lifecycle for `ee codex exec`.
   - Uses the existing `createCodexBehaviorLoop` path.
   - Remains the authoritative lifecycle fallback when host-native Codex App hooks are unavailable.

2. **Codex MCP server**
   - Provides host-native tools/resources such as lookup, inspect, broker actions, and explain.
   - Is registered with `codex mcp add experienceengine`.
   - On Windows, command registration must use a Windows-accessible launcher.

3. **Codex App project hooks**
   - Must not reuse Claude Code's `experienceengine-claude-hook`.
   - If Codex App does not provide a compatible hook protocol in this repo, installer/repair should leave `.codex/hooks.json` absent or remove only ExperienceEngine-owned invalid entries.
   - Doctor should report the hook surface as unsupported, absent, or drifted rather than treating it as healthy.

### Configuration Ownership

ExperienceEngine should only mutate config blocks it owns:

- Managed Codex instruction block in `AGENTS.md`.
- Codex MCP registration through `codex mcp add/remove`.
- ExperienceEngine-owned invalid hook entries in `.codex/hooks.json` during repair.

For `.codex/hooks.json`, repair must preserve unrelated user hooks and remove only hook commands that clearly reference ExperienceEngine's Claude hook or invalid ExperienceEngine paths.

### Path Selection

Use `CodexRuntimeTarget` to choose command form:

- `windows`: use `.cmd` launcher paths and Windows path syntax.
- `posix`: use POSIX launcher paths.

Doctor should flag mismatches, for example:

- Windows runtime target with `/mnt/<drive>/...` command paths.
- POSIX runtime target with `cmd.exe /c ...` command paths.
- Any configured command path that does not exist when resolved for the target runtime.

### Doctor and Repair

Doctor output should classify the current Codex state into separate sections:

- MCP registration: wired/unwired, command, transport, enabled.
- Runtime target: windows/posix, launcher path, launcher existence.
- Project hooks: absent, unsupported, healthy, or drifted.
- CLI fallback: available/unavailable.

Repair should:

1. Re-run Codex MCP registration for the resolved runtime target.
2. Ensure launchers exist.
3. Remove ExperienceEngine-owned invalid Claude hook entries from `.codex/hooks.json`.
4. Leave `.codex/hooks.json` deleted only if it becomes empty.
5. Report what was changed.

## Error Handling

- If Codex CLI is unavailable, doctor should still inspect local project files and install state.
- If `.codex/hooks.json` is malformed JSON, doctor should report a parse error and repair should avoid overwriting it unless a separate explicit repair mode is added.
- If the runtime target is ambiguous, installer should default from `process.platform` and allow `EXPERIENCE_ENGINE_CODEX_RUNTIME_TARGET` override.

## Testing Strategy

- Unit-test pure config analysis for `.codex/hooks.json` drift detection.
- Unit-test Windows command generation without requiring a real Codex App.
- Unit-test repair behavior with temp project files:
  - removes ExperienceEngine Claude hook entries
  - preserves unrelated hooks
  - removes empty hook file when appropriate
- Unit-test doctor output using mocked `inspectCodexInstall`.
- Avoid SQLite-heavy integration tests for this change unless needed, because current Windows tempdir cleanup can fail independently with `EPERM`.

## Documentation Strategy

Docs should say:

- `ee codex exec` is the deterministic lifecycle path.
- Codex MCP is the host-native tool surface when the host loads it.
- Codex App project hooks must not be configured with Claude Code hooks.
- `ee doctor codex` and `ee repair codex` are the supported way to diagnose/repair drift.
