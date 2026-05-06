# Change: Fix Codex App Windows lifecycle wiring

## Why

Codex App on Windows can currently load ExperienceEngine project configuration that was written for the wrong runtime boundary:

- `.codex/hooks.json` can reference `experienceengine-claude-hook`, which is a Claude Code lifecycle hook rather than a Codex lifecycle entrypoint.
- `.codex/config.toml` and hook commands can contain WSL-style paths such as `/mnt/d/...`, even when Codex App executes commands from a Windows/PowerShell environment.
- The failure appears in Codex App as repeated `hook exited with code 1`, while ExperienceEngine MCP tools are not actually available in the session.

This makes the operator experience look like ExperienceEngine is broken in Codex App, when the root cause is host/runtime wiring drift.

## What Changes

- Codex installation and repair must not install Claude Code hooks into Codex App project config.
- Windows Codex runtime wiring must use Windows-accessible launcher commands for MCP registration.
- Doctor/repair must detect and report Codex App project config drift:
  - Claude hook referenced from `.codex/hooks.json`
  - WSL paths in Windows-targeted Codex App config
  - missing or non-existent MCP launcher path
  - MCP not loaded even though project config appears present
- Documentation must distinguish:
  - Codex CLI wrapper lifecycle ownership
  - Codex MCP host-native integration
  - Codex App project hook compatibility status

## Non-Goals

- Do not implement a fake Codex lifecycle hook by reusing the Claude hook protocol.
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
  - `src/cli/commands/doctor.ts`
  - repair/operational action surfaces that reinstall Codex
  - Codex installer/doctor/repair tests
- Affected docs:
  - `README.md`
  - `README.zh-CN.md`
  - `docs/user-guide.md`
