# Change: Fix Codex App Windows hook lifecycle wiring

## Why

Current Codex releases support lifecycle hooks through `codex_hooks`, `hooks.json`, and inline `[hooks]` config. ExperienceEngine should use that Codex-native hook surface instead of relying only on MCP or the `ee codex exec` wrapper.

Codex App on Windows can currently load ExperienceEngine project configuration that was written for the wrong host/protocol boundary:

- `.codex/hooks.json` can reference `experienceengine-claude-hook`, which is a Claude Code lifecycle hook rather than a Codex lifecycle entrypoint.
- `.codex/config.toml` and hook commands can contain WSL-style paths such as `/mnt/d/...`, even when Codex App executes commands from a Windows/PowerShell environment.
- `codex_hooks` can be disabled or absent, so valid hook config may not run.
- The failure appears in Codex App as repeated `hook exited with code 1`, or as ExperienceEngine MCP being available while lifecycle capture/injection never happens.

This makes the operator experience look like ExperienceEngine is broken in Codex App, when the root cause is host/runtime/protocol wiring drift.

## What Changes

- Codex installation and repair must install Codex-native hooks, not Claude Code hooks.
- Codex install/repair must enable the `codex_hooks` feature in the managed Codex config it owns.
- Windows Codex runtime wiring must use Windows-accessible launcher commands for hooks and MCP registration.
- Doctor/repair must detect and report Codex App project config drift:
  - Claude hook referenced from `.codex/hooks.json`
  - WSL paths in Windows-targeted Codex App config
  - missing `codex_hooks` feature flag
  - missing or non-existent Codex hook launcher path
  - missing or non-existent MCP launcher path
  - MCP loaded even though hooks are not healthy, or hooks healthy while MCP is not loaded
- Documentation must distinguish:
  - Codex CLI wrapper lifecycle ownership
  - Codex MCP host-native integration
  - Codex-native hooks for Codex App/CLI lifecycle integration

## Non-Goals

- Do not reuse the Claude hook protocol or `experienceengine-claude-hook` for Codex.
- Do not hard-code local machine paths such as `/mnt/d/...`, `/home/seed/...`, or `D:\ExperienceEngineData\...`.
- Do not remove the existing Codex CLI wrapper flow.
- Do not change retrieval, governance, scoring, or prompt-delivery behavior.

## Impact

- Affected specs:
  - `codex-runtime-loop`
  - `agent-adapter-installation`
  - `cli-user-experience-surface`
- Affected code areas:
  - `src/install/codex-installer.ts`
  - `src/install/codex-runtime-target.ts`
  - `src/install/codex-cli.ts`
  - Codex hook command/normalizer/session-state code added for this change
  - `src/cli/commands/doctor.ts`
  - repair/operational action surfaces that reinstall Codex
  - Codex installer/doctor/repair tests
- Affected docs:
  - `README.md`
  - `README.zh-CN.md`
  - `docs/user-guide.md`
