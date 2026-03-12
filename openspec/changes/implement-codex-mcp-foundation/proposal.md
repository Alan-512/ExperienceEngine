# Change Proposal: Implement Codex MCP Foundation

## Why

The multi-agent roadmap now has real OpenClaw and Claude Code foundations, but Codex is still only defined at the architecture level. The latest official Codex surface we can rely on is MCP registration and shared `~/.codex/config.toml` wiring, not lifecycle hooks.

ExperienceEngine needs a first Codex foundation that is explicit about that boundary:

- install a Codex-facing adapter through the unified `ee install <agent>` CLI
- register ExperienceEngine as a local Codex MCP server
- verify the registration through `ee doctor codex`

## What Changes

- Add a Codex installer path to `ee install codex`
- Add a Codex doctor path to `ee doctor codex`
- Add a local `codex-mcp-server` CLI entrypoint for ExperienceEngine
- Persist Codex adapter install-state under the shared ExperienceEngine product home

## Scope

This change only establishes Codex MCP wiring and a minimal local server surface.

It does not yet:

- assume official Codex lifecycle hooks exist
- implement automatic prompt-time intervention like OpenClaw or Claude Code
- redesign the core runtime or feedback policy for Codex-specific behavior
