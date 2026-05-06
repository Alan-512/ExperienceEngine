# Design: Codex App Windows hook lifecycle wiring

## Problem Statement

ExperienceEngine currently has a strong Codex core path through the Codex MCP server and the `ee codex exec` wrapper. Current Codex releases also support a Codex-native hooks surface behind `codex_hooks`, loaded from `hooks.json` or inline `[hooks]` config next to active config layers. ExperienceEngine should use that surface for Codex App/CLI lifecycle integration.

The failing Codex App symptoms come from project-level wiring that crosses host and protocol boundaries incorrectly: Claude Code hook commands are being placed under `.codex/hooks.json`, Linux/WSL paths can be written into Codex App config that is executed by a Windows runtime, and the Codex hook feature flag may not be enabled.

The fix should make valid Codex-native hook wiring installable, invalid wiring impossible to generate, easy to diagnose, and safe to repair.

## Architecture

### Runtime Boundaries

Codex integration should be modeled as three separate surfaces:

1. **Codex CLI wrapper**
   - Owns deterministic before/after lifecycle for `ee codex exec`.
   - Uses the existing `createCodexBehaviorLoop` path.
   - Remains the deterministic lifecycle fallback when host-native Codex hooks are disabled, unavailable, or unhealthy.

2. **Codex MCP server**
   - Provides host-native tools/resources such as lookup, inspect, broker actions, and explain.
   - Is registered with `codex mcp add experienceengine`.
   - On Windows, command registration must use a Windows-accessible launcher.

3. **Codex-native hooks**
   - Use Codex hook events such as `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`.
   - Must be enabled through the managed `codex_hooks` feature flag.
   - Must run a Codex-specific ExperienceEngine hook command, for example `experienceengine-codex-hook` or an equivalent `ee codex-hook` entrypoint.
   - Must not reuse Claude Code's `experienceengine-claude-hook`.
   - Doctor should report the hook surface as disabled, absent, healthy, or drifted rather than treating MCP health as hook health.

### Codex Hook Semantics

The Codex hook command should normalize Codex payloads into the shared ExperienceEngine adapter event model instead of parsing Claude payloads:

- `UserPromptSubmit`: run prompt-time lookup/injection and emit Codex-supported additional context when ExperienceEngine selects guidance.
- `PreToolUse`: capture intent and optionally surface guardrail context without relying on unsupported input rewriting.
- `PostToolUse`: capture supported tool results and preserve enough state for outcome attribution.
- `Stop`: finalize the Codex turn/session and perform governance writeback.

Codex hook output must follow Codex's JSON output shapes. The adapter must not emit Claude-specific `hookSpecificOutput` values unless they are also valid for the Codex event being handled.

### Configuration Ownership

ExperienceEngine should only mutate config blocks it owns:

- Managed Codex instruction block in `AGENTS.md`.
- Codex MCP registration through `codex mcp add/remove`.
- Managed Codex hook entries in `.codex/hooks.json` or managed inline `[hooks]` config.
- Managed `codex_hooks` feature flag in the Codex config layer ExperienceEngine owns.
- ExperienceEngine-owned invalid Claude hook entries in `.codex/hooks.json` during repair.

For `.codex/hooks.json`, repair must preserve unrelated user hooks, remove only hook commands that clearly reference ExperienceEngine's Claude hook or invalid ExperienceEngine paths, and upsert only ExperienceEngine-owned Codex hook entries.

### Path Selection

Use `CodexRuntimeTarget` to choose command form for both hooks and MCP:

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
- Hooks: feature flag enabled/disabled, absent, healthy, or drifted.
- CLI fallback: available/unavailable.

Repair should:

1. Re-run Codex MCP registration for the resolved runtime target.
2. Ensure launchers exist.
3. Enable `codex_hooks` in the managed Codex config layer.
4. Upsert ExperienceEngine-owned Codex hook entries.
5. Remove ExperienceEngine-owned invalid Claude hook entries from `.codex/hooks.json`.
6. Leave `.codex/hooks.json` deleted only if it becomes empty and no Codex hook entries should be installed in that file.
7. Report what was changed.

## Error Handling

- If Codex CLI is unavailable, doctor should still inspect local project files and install state.
- If `.codex/hooks.json` is malformed JSON, doctor should report a parse error and repair should avoid overwriting it unless a separate explicit repair mode is added.
- If the runtime target is ambiguous, installer should default from `process.platform` and allow `EXPERIENCE_ENGINE_CODEX_RUNTIME_TARGET` override.
- If `codex_hooks` is disabled outside an ExperienceEngine-owned config layer, doctor should report it as disabled and recommend repair without clobbering unrelated user settings.
- If Codex hook execution fails, doctor should distinguish hook command failure from MCP registration failure.

## Testing Strategy

- Unit-test pure config analysis for `.codex/hooks.json` drift detection.
- Unit-test Codex hook payload normalization and Codex hook output formatting.
- Unit-test Windows command generation for hooks and MCP without requiring a real Codex App.
- Unit-test repair behavior with temp project files:
  - removes ExperienceEngine Claude hook entries
  - upserts ExperienceEngine Codex hook entries
  - preserves unrelated hooks
  - removes empty hook file when appropriate
- Unit-test `codex_hooks` feature flag enablement in managed config.
- Unit-test doctor output using mocked `inspectCodexInstall`.
- Avoid SQLite-heavy integration tests for this change unless needed, because current Windows tempdir cleanup can fail independently with `EPERM`.

## Documentation Strategy

Docs should say:

- `ee codex exec` is the deterministic lifecycle path.
- Codex MCP is the host-native tool surface when the host loads it.
- Codex App/CLI hooks are the host-native lifecycle surface when `codex_hooks` is enabled.
- Codex hooks must use ExperienceEngine's Codex-specific hook command, not Claude Code hooks.
- `ee doctor codex` and `ee repair codex` are the supported way to diagnose/repair drift.
