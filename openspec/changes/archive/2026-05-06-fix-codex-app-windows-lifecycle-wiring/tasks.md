## Implementation

- [x] Add Codex project hook inspection helpers.
  - Detect `codex_hooks` feature state, `.codex/hooks.json` absence, parse failure, invalid ExperienceEngine Claude hook references, missing ExperienceEngine Codex hook entries, WSL paths under Windows runtime target, and unrelated user hooks.
  - Keep helpers pure where possible so they can be tested without launching Codex App.

- [x] Add Codex-native hook adapter entrypoint.
  - Add a Codex-specific hook command such as `experienceengine-codex-hook` or `ee codex-hook`.
  - Normalize Codex `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop` payloads into the shared adapter event model.
  - Return Codex-valid hook output for prompt-time additional context and supported stop/tool feedback.
  - Persist enough Codex hook state across hook invocations for automatic outcome attribution and governance writeback.

- [x] Update Codex install/repair behavior.
  - Ensure Codex install does not create `.codex/hooks.json` with `experienceengine-claude-hook`.
  - Ensure Codex install enables `codex_hooks` in the managed config layer.
  - Ensure Codex install writes ExperienceEngine-owned Codex hook entries for the supported lifecycle events.
  - Ensure Windows runtime target uses Windows hook and MCP launcher paths.
  - Add repair behavior that removes only ExperienceEngine-owned invalid hook entries and preserves unrelated hooks.
  - Delete `.codex/hooks.json` only when no hooks remain after repair and ExperienceEngine is not installing managed hooks there.

- [x] Extend Codex doctor and status surfaces.
  - Report MCP wiring, runtime target, launcher existence, `codex_hooks` feature state, project hook state, and CLI fallback as distinct sections.
  - Recommend `ee repair codex` for disabled hooks, missing Codex hook entries, invalid Claude hook drift, or WSL-path drift.
  - Keep wording clear that `ee codex exec` is the deterministic lifecycle fallback.

- [x] Update operator action surfaces.
  - Ensure Codex repair action summaries include `codex_hooks` enablement, Codex hook install/refresh, hook cleanup, and MCP refresh results.
  - Ensure broker/operational summaries do not describe Claude hook wiring as a Codex App success path.

- [x] Update public docs.
  - Update `README.md`.
  - Update `README.zh-CN.md`.
  - Update `docs/user-guide.md`.
  - Distinguish Codex CLI wrapper, Codex MCP, and Codex-native hooks.

## Tests

- [x] Add unit tests for Codex project hook inspection.
- [x] Add unit tests for Codex hook payload normalization and Codex hook output formatting.
- [x] Add unit tests for Windows runtime target command generation and launcher existence reporting.
- [x] Add unit tests that install/repair enables `codex_hooks` and writes Codex-native hook entries.
- [x] Add unit tests that repair removes invalid ExperienceEngine Claude hook entries while preserving unrelated hooks.
- [x] Add unit tests that malformed `.codex/hooks.json` is reported but not overwritten.
- [x] Add doctor/status output tests for separate MCP/wrapper/hook diagnostics.

## Validation

- [x] Run targeted Codex installer/doctor/repair tests.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm build`.
- [x] Run `openspec validate fix-codex-app-windows-lifecycle-wiring --strict`.
- [x] Run `openspec validate --specs --strict`.
