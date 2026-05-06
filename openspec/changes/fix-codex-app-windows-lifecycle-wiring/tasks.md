## Implementation

- [ ] Add Codex project hook inspection helpers.
  - Detect `.codex/hooks.json` absence, parse failure, invalid ExperienceEngine Claude hook references, WSL paths under Windows runtime target, and unrelated user hooks.
  - Keep helpers pure where possible so they can be tested without launching Codex App.

- [ ] Update Codex install/repair behavior.
  - Ensure Codex install does not create `.codex/hooks.json` with `experienceengine-claude-hook`.
  - Ensure Windows runtime target uses the Windows MCP launcher path.
  - Add repair behavior that removes only ExperienceEngine-owned invalid hook entries and preserves unrelated hooks.
  - Delete `.codex/hooks.json` only when no hooks remain after repair.

- [ ] Extend Codex doctor and status surfaces.
  - Report MCP wiring, runtime target, launcher existence, project hook state, and CLI fallback as distinct sections.
  - Recommend `ee repair codex` for invalid Claude hook or WSL-path drift.
  - Keep wording clear that `ee codex exec` is the deterministic lifecycle fallback.

- [ ] Update operator action surfaces.
  - Ensure Codex repair action summaries include hook cleanup and MCP refresh results.
  - Ensure broker/operational summaries do not describe Claude hook wiring as a Codex App success path.

- [ ] Update public docs.
  - Update `README.md`.
  - Update `README.zh-CN.md`.
  - Update `docs/user-guide.md`.
  - Distinguish Codex CLI wrapper, Codex MCP, and Codex App hook compatibility.

## Tests

- [ ] Add unit tests for Codex project hook inspection.
- [ ] Add unit tests for Windows runtime target command generation and launcher existence reporting.
- [ ] Add unit tests that repair removes invalid ExperienceEngine Claude hook entries while preserving unrelated hooks.
- [ ] Add unit tests that malformed `.codex/hooks.json` is reported but not overwritten.
- [ ] Add doctor/status output tests for separate MCP/wrapper/hook diagnostics.

## Validation

- [ ] Run targeted Codex installer/doctor/repair tests.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `openspec validate fix-codex-app-windows-lifecycle-wiring --strict`.
- [ ] Run `openspec validate --specs --strict`.
