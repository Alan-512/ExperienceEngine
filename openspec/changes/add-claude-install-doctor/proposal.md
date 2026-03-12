# Change Proposal: Add Claude Install Doctor

## Why

ExperienceEngine can now install Claude Code hooks and replay finished sessions into the core runtime, but the CLI still only exposes host diagnostics for OpenClaw. Users need a way to verify whether Claude Code is wired correctly in the current project.

## What Changes

- Add Claude Code install inspection logic
- Extend `ee doctor` to support `claude-code`
- Report whether the expected ExperienceEngine hook commands are present in `.claude/settings.local.json`

## Impact

- Claude Code installation becomes observable instead of opaque
- The CLI starts to look like a multi-agent product rather than an OpenClaw-only tool
