# Design: Codex MCP Foundation

## Official Surface Assumption

Codex will be treated as an MCP-first host. The foundation uses only the currently documented Codex surfaces:

- MCP server registration through the Codex CLI / shared config
- shared user config under `~/.codex/config.toml`

This change intentionally does not invent or depend on undocumented Codex lifecycle hooks.

## Installer Model

ExperienceEngine will add a new installer target:

- `ee install codex`

The installer will:

- resolve ExperienceEngine shared paths under `~/.experienceengine/adapters/codex`
- register a local MCP server named `experienceengine`
- persist install-state metadata so later diagnostics can inspect the install

The preferred host-wiring path is the official Codex CLI. If the CLI is unavailable, the install should fail clearly instead of silently mutating unknown config.

## Minimal MCP Server

The foundation will add a local `codex-mcp-server` entrypoint owned by ExperienceEngine.

In this first step, the server only needs to prove that:

- Codex can connect to it successfully
- ExperienceEngine can expose at least one MCP tool or resource surface without host-specific hooks

That gives the product a real Codex entrypoint without over-claiming automatic intervention.

## Doctor Model

`ee doctor codex` will inspect:

- whether Codex install-state exists
- whether the Codex host has an `experienceengine` MCP server entry
- what command/config Codex currently points at

This mirrors the existing install/doctor pattern already used for OpenClaw and Claude Code.
