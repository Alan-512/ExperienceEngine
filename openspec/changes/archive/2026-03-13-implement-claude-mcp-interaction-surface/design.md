## Context

Claude Code already has the right runtime split for ExperienceEngine:

- hooks capture prompt/tool/session lifecycle
- ExperienceEngine runtime service handles injection and finalization

What is still missing is the interactive half of the contract. Claude users should be able to inspect and control ExperienceEngine inside the agent session through MCP rather than having to fall back to `ee inspect`, `ee feedback`, or `ee disable`.

Claude Code's documented MCP surface uses `claude mcp add/get` with a project or local scope, which is sufficient for registering the same stdio MCP server used by Codex.

## Decisions

### 1. Claude will reuse the shared ExperienceEngine MCP server

ExperienceEngine should not create a second MCP server just for Claude. The server already exposes host-agnostic resources, prompts, and tools.

Implementation consequence:
- add a generic `mcp-server` CLI command
- keep `codex-mcp-server` as a compatibility alias
- register Claude against the generic command

### 2. Claude install owns both runtime hooks and MCP wiring

`ee install claude-code` should remain the single install entrypoint for Claude users.

Implementation consequence:
- continue writing `.claude/settings.local.json` hook configuration
- also register the ExperienceEngine MCP server through the Claude CLI using project scope
- persist host wiring details in Claude install state

### 3. Claude doctor must report interaction readiness, not just hook presence

The Claude doctor surface should verify:
- hook presence
- MCP server registration presence
- transport and command details when available

This keeps Claude aligned with the product's MCP-primary interaction model.
