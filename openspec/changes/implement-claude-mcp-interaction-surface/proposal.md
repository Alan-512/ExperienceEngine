## Why

ExperienceEngine now has a complete MCP-native interaction surface on Codex, but Claude Code still uses hooks only for runtime integration and relies on fallback CLI for user-visible inspection and control. That leaves the cross-host interaction contract only partially implemented.

## What Changes

- Register the shared ExperienceEngine MCP server with Claude Code during `ee install claude-code`
- Extend Claude doctor output to verify both hooks and MCP interaction wiring
- Add a generic MCP server CLI entry so Codex and Claude can share the same server binary contract

## Impact

- Affects Claude Code installer, doctor, and package CLI entrypoints
- Reuses the existing shared MCP interaction surface rather than creating a Claude-specific command set
- Moves Claude closer to the unified MCP-primary interaction model already implemented on Codex
